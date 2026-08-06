import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const temporaryDirectories: string[] = [];
const patcher = resolve(
  import.meta.dirname,
  "../../../scripts/patch-nemoclaw-openclaw-no-proxy.mjs",
);
const gatewayExport =
  'export OPENCLAW_GATEWAY_URL="ws://${_GATEWAY_WS_HOST}:${_DASHBOARD_PORT}"';
const vulnerableAssignment =
  '_NO_PROXY_VAL="localhost,127.0.0.1,::1,${PROXY_HOST}"';
const fixedAssignment =
  '_NO_PROXY_VAL="localhost,127.0.0.1,::1,${PROXY_HOST},${_GATEWAY_WS_HOST}"';

async function fixture(contents: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "tasklattice-nemoclaw-patch-"));
  temporaryDirectories.push(directory);
  const file = join(directory, "nemoclaw-start.sh");
  await writeFile(file, contents, "utf8");
  return file;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("NemoClaw OpenClaw NO_PROXY patch", () => {
  it("adds the resolved sandbox gateway host to both proxy variable variants", async () => {
    const file = await fixture(
      `#!/usr/bin/env bash\n${gatewayExport}\n${vulnerableAssignment}\nexport NO_PROXY="$_NO_PROXY_VAL"\nexport no_proxy="$_NO_PROXY_VAL"\n`,
    );

    const result = spawnSync(process.execPath, [patcher, file], {
      encoding: "utf8",
    });

    expect(result.status).toBe(0);
    const patched = await readFile(file, "utf8");
    expect(patched).toContain(fixedAssignment);
    expect(patched).toContain('export NO_PROXY="$_NO_PROXY_VAL"');
    expect(patched).toContain('export no_proxy="$_NO_PROXY_VAL"');
  });

  it("fails closed when upstream already contains the fix", async () => {
    const file = await fixture(
      `#!/usr/bin/env bash\n${gatewayExport}\n${fixedAssignment}\n`,
    );

    const result = spawnSync(process.execPath, [patcher, file], {
      encoding: "utf8",
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("already present in NO_PROXY");
  });

  it("fails closed when the pinned upstream layout changes", async () => {
    const file = await fixture(
      `#!/usr/bin/env bash\n${gatewayExport}\n_NO_PROXY_VAL="localhost"\n`,
    );

    const result = spawnSync(process.execPath, [patcher, file], {
      encoding: "utf8",
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "expected one vulnerable NO_PROXY assignment, found 0",
    );
  });
});
