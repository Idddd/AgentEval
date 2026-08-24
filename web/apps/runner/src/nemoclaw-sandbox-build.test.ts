import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const temporaryDirectories: string[] = [];
const repositoryRoot = resolve(import.meta.dirname, "../../..");
const buildScript = join(repositoryRoot, "scripts/build-nemoclaw-sandbox.sh");
const openClawWrapper = join(
  repositoryRoot,
  "infra/docker/Dockerfile.nemoclaw-openclaw",
);
const describeWithBash = process.platform === "win32" ? describe.skip : describe;

async function executable(path: string, contents: string): Promise<void> {
  await writeFile(path, contents, { encoding: "utf8", mode: 0o755 });
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describeWithBash("NemoClaw sandbox image build", () => {
  it("passes the pinned OpenClaw upstream image through the local wrapper", async () => {
    const root = await mkdtemp(join(tmpdir(), "tasklattice-nemoclaw-build-"));
    temporaryDirectories.push(root);
    const bin = join(root, "bin");
    const log = join(root, "docker.log");
    await mkdir(bin);

    await executable(
      join(bin, "git"),
      `#!/usr/bin/env bash
set -euo pipefail
if [ "$1" = "clone" ]; then
  target=""
  for argument in "$@"; do target="$argument"; done
  mkdir -p "$target/scripts" "$target/agents/hermes"
  touch "$target/Dockerfile" "$target/agents/hermes/Dockerfile"
  touch "$target/scripts/nemoclaw-start.sh"
fi
`,
    );
    await executable(join(bin, "node"), "#!/usr/bin/env bash\nexit 0\n");
    await executable(
      join(bin, "docker"),
      `#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$DOCKER_LOG"
exit 0
`,
    );

    const finalImage = "registry.example/tasklattice-nemoclaw-sandbox:test";
    const result = spawnSync("bash", [buildScript], {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`,
        TMPDIR: root,
        DOCKER_LOG: log,
        NEMOCLAW_AGENT_PLATFORM: "openclaw",
        NEMOCLAW_IMAGE: finalImage,
      },
    });

    expect(result.status, result.stderr).toBe(0);
    const builds = (await readFile(log, "utf8"))
      .trim()
      .split("\n")
      .filter((line) => line.startsWith("build "));
    const upstreamImage =
      "tasklattice-nemoclaw-openclaw-upstream:2adc8481ff30";

    expect(builds).toHaveLength(2);
    expect(builds[0]).toMatch(/^build --file .*\/Dockerfile /);
    expect(builds[0]).toContain(`--tag ${upstreamImage}`);
    expect(builds[1]).toBe(
      `build --file ${openClawWrapper} --build-arg BASE_IMAGE=${upstreamImage} --tag ${finalImage} ${repositoryRoot}`,
    );
  });
});
