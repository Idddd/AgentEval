#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";

const target = process.argv[2];
if (!target) {
  console.error(
    "Usage: node scripts/patch-nemoclaw-openclaw-no-proxy.mjs <nemoclaw-start.sh>",
  );
  process.exit(2);
}

const gatewayExport =
  'export OPENCLAW_GATEWAY_URL="ws://${_GATEWAY_WS_HOST}:${_DASHBOARD_PORT}"';
const vulnerableAssignment =
  '_NO_PROXY_VAL="localhost,127.0.0.1,::1,${PROXY_HOST}"';
const fixedAssignment =
  '_NO_PROXY_VAL="localhost,127.0.0.1,::1,${PROXY_HOST},${_GATEWAY_WS_HOST}"';
const replacement = `# OPENCLAW_GATEWAY_URL uses the sandbox interface so enforced child
# processes can dial the gateway. Keep that self-connection away from the
# OpenShell HTTP proxy; the base policy admits it through openclaw_gateway_dialback.
${fixedAssignment}`;

const source = await readFile(target, "utf8");
const gatewayExportIndex = source.indexOf(gatewayExport);
const vulnerableIndexes = [...source.matchAll(
  new RegExp(vulnerableAssignment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"),
)].map((match) => match.index ?? -1);

if (gatewayExportIndex < 0) {
  throw new Error(
    "Refusing to patch NemoClaw: the expected OPENCLAW_GATEWAY_URL assignment is missing.",
  );
}
if (source.includes(fixedAssignment)) {
  throw new Error(
    "Refusing to patch NemoClaw: the gateway host is already present in NO_PROXY; review and remove the downstream patch.",
  );
}
if (vulnerableIndexes.length !== 1) {
  throw new Error(
    `Refusing to patch NemoClaw: expected one vulnerable NO_PROXY assignment, found ${vulnerableIndexes.length}.`,
  );
}
if (vulnerableIndexes[0] < gatewayExportIndex) {
  throw new Error(
    "Refusing to patch NemoClaw: NO_PROXY is initialized before _GATEWAY_WS_HOST is resolved.",
  );
}

const patched = source.replace(vulnerableAssignment, replacement);
await writeFile(target, patched, "utf8");
console.log(
  "Patched NemoClaw OpenClaw self-dialback to bypass the OpenShell HTTP proxy.",
);
