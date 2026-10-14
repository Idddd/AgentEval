import type { LocationRewrite } from "@tanstack/react-router";

export type WorkspaceVersion = "v1" | "v2";

export function workspaceVersion(href: string): WorkspaceVersion {
  return /^\/v2(?:\/|$)/.test(new URL(href, "http://localhost").pathname)
    ? "v2"
    : "v1";
}

// Keep the existing route tree while exposing both interfaces at separate
// public prefixes. Each router/request owns its own version state.
export function createWorkspaceRewrite(): LocationRewrite {
  let version: WorkspaceVersion = "v1";
  return {
    input: ({ url }) => {
      const internal = new URL(url);
      const prefix = internal.pathname.match(/^\/(v1|v2)(?=\/|$)/);
      if (prefix) {
        version = prefix[1] as WorkspaceVersion;
        internal.pathname = internal.pathname.slice(prefix[0].length) || "/";
      }
      return internal;
    },
    output: ({ url }) => {
      const external = new URL(url);
      if (!/^\/v[12](?:\/|$)/.test(external.pathname))
        external.pathname = `/${version}${external.pathname}`;
      return external;
    },
  };
}
