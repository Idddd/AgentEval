#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { parseAllDocuments } from "yaml";

const releaseName = "tasklattice";
const releaseNamespace = "tasklattice-openshift-validation";
const rendered = execFileSync(
  "helm",
  [
    "template",
    releaseName,
    "charts/tasklattice",
    "--namespace",
    releaseNamespace,
    "--kube-version",
    "1.29.0",
    "--include-crds",
    "--values",
    "charts/tasklattice/values-openshift.yaml",
    "--set-string",
    "control.publicUrl=https://tasklattice.apps.example.com",
    "--set",
    "keycloak.enabled=true",
    "--set-string",
    "keycloak.publicUrl=https://keycloak.apps.example.com",
    "--set",
    "openshift.routes.keycloak.enabled=true",
    "--set",
    "exampleMcp.enabled=true",
  ],
  { encoding: "utf8" },
);

const documents = parseAllDocuments(rendered);
const parseErrors = documents.flatMap((document) => document.errors);
if (parseErrors.length > 0) {
  console.error("OpenShift render contains invalid or duplicate YAML keys:");
  for (const error of parseErrors) {
    console.error(`- ${error.message}`);
  }
  process.exit(1);
}

const objects = documents
  .map((document) => document.toJS())
  .filter((object) => object && typeof object === "object");

function podTemplateFor(object) {
  switch (object.kind) {
    case "Pod":
      return object;
    case "Deployment":
    case "StatefulSet":
    case "DaemonSet":
    case "Job":
    case "ReplicaSet":
      return object.spec?.template;
    case "CronJob":
      return object.spec?.jobTemplate?.spec?.template;
    default:
      return undefined;
  }
}

const violations = [];
let checkedContainers = 0;
const resourceIdentities = new Set();

for (const object of objects) {
  if (!object.apiVersion || !object.kind || !object.metadata?.name) {
    continue;
  }
  const identity = [
    object.apiVersion,
    object.kind,
    object.metadata.namespace ?? "",
    object.metadata.name,
  ].join("/");
  if (resourceIdentities.has(identity)) {
    violations.push(`OpenShift render contains duplicate resource ${identity}.`);
  }
  resourceIdentities.add(identity);
}

for (const object of objects) {
  const template = podTemplateFor(object);
  if (!template) {
    continue;
  }

  const workload = `${object.kind}/${object.metadata?.name}`;
  const podSpec = object.kind === "Pod" ? object.spec : template.spec;

  const containers = [
    ...(podSpec?.initContainers ?? []),
    ...(podSpec?.containers ?? []),
  ];
  for (const container of containers) {
    checkedContainers += 1;
    const identity = `${workload} container/${container.name}`;
    const securityContext = container.securityContext ?? {};

    if (securityContext.runAsUser === 0) {
      violations.push(`${identity} explicitly runs as root.`);
    }
    if (securityContext.privileged === true) {
      violations.push(`${identity} is statically privileged.`);
    }
    if ((securityContext.capabilities?.add ?? []).length > 0) {
      violations.push(`${identity} adds Linux capabilities.`);
    }
    if (securityContext.allowPrivilegeEscalation !== false) {
      violations.push(
        `${identity} must set allowPrivilegeEscalation=false.`,
      );
    }
    if (!(securityContext.capabilities?.drop ?? []).includes("ALL")) {
      violations.push(`${identity} must explicitly drop the ALL capability set.`);
    }

    for (const resourceType of ["requests", "limits"]) {
      for (const resourceName of ["cpu", "memory"]) {
        if (container.resources?.[resourceType]?.[resourceName] == null) {
          violations.push(
            `${identity} is missing resources.${resourceType}.${resourceName}.`,
          );
        }
      }
    }
  }
}

for (const service of objects.filter((object) => object.kind === "Service")) {
  if (service.spec?.type === "LoadBalancer") {
    violations.push(
      `Service/${service.metadata?.name} remains LoadBalancer in the OpenShift profile.`,
    );
  }
}

const controlRoute = objects.find(
  (object) =>
    object.apiVersion === "route.openshift.io/v1" &&
    object.kind === "Route" &&
    object.metadata?.name === `${releaseName}-control`,
);
if (!controlRoute) {
  violations.push("The OpenShift profile must render a Route for Control.");
}

const privilegedBinding = objects.find(
  (object) =>
    object.kind === "RoleBinding" &&
    object.roleRef?.name === "system:openshift:scc:privileged" &&
    object.subjects?.some(
      (subject) =>
        subject.kind === "ServiceAccount" &&
        subject.name === `${releaseName}-openshell-sandbox`,
    ),
);
if (!privilegedBinding) {
  violations.push(
    "The OpenShift profile must bind the OpenShell sandbox ServiceAccount to the privileged SCC.",
  );
}

const anyuidBinding = objects.find(
  (object) =>
    object.kind === "RoleBinding" &&
    object.roleRef?.name === "system:openshift:scc:anyuid",
);
const anyuidSubjects = anyuidBinding?.subjects ?? [];
for (const serviceAccount of [
  `${releaseName}-runtime`,
  `${releaseName}-control`,
  `${releaseName}-openshell`,
]) {
  if (
    !anyuidSubjects.some(
      (subject) =>
        subject.kind === "ServiceAccount" &&
        subject.name === serviceAccount &&
        subject.namespace === releaseNamespace,
    )
  ) {
    violations.push(
      `The OpenShift anyuid SCC RoleBinding must include ServiceAccount/${serviceAccount}.`,
    );
  }
}

const gatewayConfig = objects.find(
  (object) =>
    object.kind === "ConfigMap" &&
    object.metadata?.name === `${releaseName}-openshell-config`,
);
if (gatewayConfig?.data?.["gateway.toml"]?.includes("app_armor_profile")) {
  violations.push(
    "The OpenShift profile must omit OpenShell's structured AppArmor field.",
  );
}

if (checkedContainers === 0) {
  violations.push("The OpenShift render did not contain any Pod containers.");
}

if (violations.length > 0) {
  console.error("OpenShift Helm validation failed:");
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log(
  `Validated ${checkedContainers} static containers for OpenShift anyuid; ` +
    "root containers, elevated capabilities, LoadBalancer Services, and resource gaps were not found.",
);
