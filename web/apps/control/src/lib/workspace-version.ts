import type { LocationRewrite } from "@tanstack/react-router";

export type WorkspaceVersion = "v1" | "v2" | "v2-mock" | "v3";

export function workspaceVersion(href: string): WorkspaceVersion {
  const prefix = new URL(href, "http://localhost").pathname.match(/^\/(v1|v2-mock|v2|v3)(?=\/|$)/);
  return prefix ? prefix[1] as WorkspaceVersion : "v2";
}

// Keep the existing route tree while exposing the workspaces at separate
// public prefixes. Each router/request owns its own version state.
export function createWorkspaceRewrite(): LocationRewrite {
  let version: WorkspaceVersion = "v2";
  return {
    input: ({ url }) => {
      const internal = new URL(url);
      const prefix = internal.pathname.match(/^\/(v1|v2-mock|v2|v3)(?=\/|$)/);
      if (prefix) {
        version = prefix[1] as WorkspaceVersion;
        internal.pathname = internal.pathname.slice(prefix[0].length) || "/";
      }
      return internal;
    },
    output: ({ url }) => {
      const external = new URL(url);
      if (!/^\/(?:v1|v2-mock|v2|v3)(?:\/|$)/.test(external.pathname))
        external.pathname = `/${version}${external.pathname}`;
      return external;
    },
  };
}

export function isMockWorkspace(version: WorkspaceVersion) { return version === "v2" || version === "v2-mock"; }
