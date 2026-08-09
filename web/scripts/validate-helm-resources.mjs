#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { parseAllDocuments } from "yaml";

const releaseName = "tasklattice";
const releaseNamespace = "tasklattice-resource-validation";
const chartPath = "charts/tasklattice";
const requiredResources = [
  ["requests", "cpu"],
  ["requests", "memory"],
  ["limits", "cpu"],
  ["limits", "memory"],
];

function templateArguments(extraArguments = []) {
  return [
    "template",
    releaseName,
    chartPath,
    "--namespace",
    releaseNamespace,
    "--kube-version",
    "1.29.0",
    "--include-crds",
    ...extraArguments,
  ];
}

function renderChart(extraArguments = []) {
  return execFileSync("helm", templateArguments(extraArguments), {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function parseObjects(rendered) {
  return parseAllDocuments(rendered, { uniqueKeys: false })
    .map((document) => {
      if (document.errors.length > 0) {
        throw document.errors[0];
      }
      return document.toJS();
    })
    .filter((object) => object && typeof object === "object");
}

const rendered = renderChart([
  "--set-string",
  "control.publicUrl=http://192.0.2.10",
  "--set",
  "keycloak.enabled=true",
  "--set-string",
  "keycloak.publicUrl=http://192.0.2.11:8080",
  "--set",
  "exampleMcp.enabled=true",
]);

const objects = parseObjects(rendered);

const localObjects = parseObjects(
  renderChart(["--set", "control.service.type=LoadBalancer"]),
);
const localSecret = localObjects.find(
  (object) =>
    object.kind === "Secret" &&
    object.metadata?.name === `${releaseName}-secrets`,
);
const localControlToml = localSecret?.stringData?.["control.toml"] ?? "";
if (/^public_url\s*=/m.test(localControlToml)) {
  throw new Error(
    "Local authentication must not render server.public_url when control.publicUrl is empty.",
  );
}

const localControlService = localObjects.find(
  (object) =>
    object.kind === "Service" &&
    object.metadata?.name === `${releaseName}-control`,
);
if (localControlService?.spec?.type !== "LoadBalancer") {
  throw new Error(
    "The Control Service must render as LoadBalancer without requiring control.publicUrl.",
  );
}

const localWithPublicUrlObjects = parseObjects(
  renderChart([
    "--set",
    "control.service.type=LoadBalancer",
    "--set-string",
    "control.publicUrl=http://198.51.100.20",
  ]),
);

function podAnnotations(collection, kind, name) {
  return (
    collection.find(
      (object) =>
        object.kind === kind && object.metadata?.name === name,
    )?.spec?.template?.metadata?.annotations ?? {}
  );
}

const checksumComparisons = [
  ["Deployment", `${releaseName}-runner`, "checksum/runner-secret", false],
  ["Deployment", `${releaseName}-litellm`, "checksum/litellm-secret", false],
  [
    "StatefulSet",
    `${releaseName}-postgresql`,
    "checksum/postgresql-secret",
    false,
  ],
  [
    "Deployment",
    `${releaseName}-control`,
    "checksum/control-config",
    true,
  ],
];
for (const [kind, name, annotation, shouldChange] of checksumComparisons) {
  const before = podAnnotations(localObjects, kind, name)[annotation];
  const after = podAnnotations(localWithPublicUrlObjects, kind, name)[annotation];
  if (!before || !after) {
    throw new Error(`${kind}/${name} is missing ${annotation}.`);
  }
  if ((before !== after) !== shouldChange) {
    throw new Error(
      `${kind}/${name} ${annotation} ${
        shouldChange ? "must" : "must not"
      } change when only control.publicUrl changes.`,
    );
  }
}

const missingOidcPublicUrlResult = spawnSync(
  "helm",
  templateArguments([
    "--set",
    "auth.oidc.enabled=true",
    "--set-string",
    "auth.oidc.issuer=https://identity.example.com",
    "--set-string",
    "auth.oidc.clientId=tasklattice",
  ]),
  { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
);
if (
  missingOidcPublicUrlResult.status === 0 ||
  !missingOidcPublicUrlResult.stderr.includes(
    "control.publicUrl is required when OIDC authentication",
  )
) {
  throw new Error(
    "The Chart must require control.publicUrl when OIDC authentication is enabled.",
  );
}

const namespaceDefaults = new Map();
for (const object of objects) {
  if (object.kind !== "LimitRange") {
    continue;
  }

  const namespace = object.metadata?.namespace ?? releaseNamespace;
  const containerLimit = object.spec?.limits?.find(
    (limit) => limit.type === "Container",
  );
  if (!containerLimit) {
    continue;
  }

  namespaceDefaults.set(namespace, {
    requests: containerLimit.defaultRequest ?? {},
    limits: containerLimit.default ?? {},
  });
}

const releaseDefaults = namespaceDefaults.get(releaseNamespace);
const missingReleaseDefaults = requiredResources.filter(
  ([resourceType, resourceName]) =>
    releaseDefaults?.[resourceType]?.[resourceName] == null,
);
if (missingReleaseDefaults.length > 0) {
  throw new Error(
    "The release namespace must define Container LimitRange defaults for " +
      missingReleaseDefaults
        .map(([resourceType, resourceName]) => `${resourceType}.${resourceName}`)
        .join(", ") +
      " so dynamically injected sandbox containers are admitted with resources.",
  );
}

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
let defaultedContainers = 0;
const defaultedContainerNames = [];

for (const object of objects) {
  const template = podTemplateFor(object);
  if (!template) {
    continue;
  }

  const namespace = object.metadata?.namespace ?? releaseNamespace;
  const defaults = namespaceDefaults.get(namespace);
  const hookNames = (
    object.metadata?.annotations?.["helm.sh/hook"] ?? ""
  ).split(",");
  const isPreInstallHook = hookNames.includes("pre-install");
  const podSpec = object.kind === "Pod" ? object.spec : template.spec;
  const containerGroups = [
    ["initContainers", podSpec?.initContainers ?? []],
    ["containers", podSpec?.containers ?? []],
  ];

  for (const [groupName, containers] of containerGroups) {
    for (const container of containers) {
      checkedContainers += 1;
      let usedDefaults = false;

      for (const [resourceType, resourceName] of requiredResources) {
        if (container.resources?.[resourceType]?.[resourceName] != null) {
          continue;
        }
        if (
          !isPreInstallHook &&
          defaults?.[resourceType]?.[resourceName] != null
        ) {
          usedDefaults = true;
          continue;
        }

        violations.push(
          `${object.kind}/${object.metadata?.name} ${groupName}/${container.name} ` +
            `in namespace ${namespace} is missing resources.${resourceType}.${resourceName}`,
        );
      }

      if (usedDefaults) {
        defaultedContainers += 1;
        defaultedContainerNames.push(
          `${object.kind}/${object.metadata?.name} ${groupName}/${container.name}`,
        );
      }
    }
  }
}

if (checkedContainers === 0) {
  throw new Error("The rendered chart did not contain any Pod containers.");
}

if (violations.length > 0) {
  console.error("Helm resource validation failed:");
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log(
  `Validated ${checkedContainers} rendered containers; ` +
    `${defaultedContainers} rely on namespace LimitRange admission defaults.`,
);
for (const containerName of defaultedContainerNames) {
  console.log(`- ${containerName}`);
}
