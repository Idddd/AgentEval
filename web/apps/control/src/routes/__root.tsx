import type { QueryClient } from "@tanstack/react-query";
import {
  ClientOnly,
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
  redirect,
  useRouterState,
} from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { workspaceVersion } from "@/lib/workspace-version";

const NmgrApp = lazy(() => import("@/features/nmgr/app").then((module) => ({ default: module.NmgrApp })));

import { MarketplaceShell } from "@/features/marketplace/shell";
import appCss from "../styles.css?url";

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
}>()({
  component: WorkspaceRoot,
  beforeLoad: ({ location }) => {
    if (workspaceVersion(location.publicHref) === "v2" && location.pathname.replace(/\/$/, "") === "/import") return;
    const guardrailDetail = location.pathname.match(
      /^\/[^/]+\/governance\/guardrails\/([^/]+)\/?$/,
    );
    if (guardrailDetail?.[1])
      throw redirect({
        to: "/guardrails",
        search: { item: decodeURIComponent(guardrailDetail[1]) },
        replace: true,
      });
    const destination =
      /^\/guardrails\/[^/]+\/?$/.test(location.pathname) ||
      ["/guardrails", "/policies", "/templates"].includes(location.pathname)
        ? null
        : /(?:template|policy-library)/.test(location.pathname)
          ? ("/policies" as const)
          : ("/guardrails" as const);
    if (destination) throw redirect({ to: destination, replace: true });
  },
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      { title: "Profiles and Guardrails" },
      {
        name: "description",
        content: "Profiles and Guardrails",
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/api/branding/favicon" },
    ],
  }),
  shellComponent: RootDocument,
});

function WorkspaceRoot() {
  const version = useRouterState({
    select: (state) => workspaceVersion(state.location.publicHref),
  });
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  return (
    <ClientOnly
      fallback={
        <div className="p-8" role="status">
          Loading workspace…
        </div>
      }
    >
      {version === "v2" && pathname.replace(/\/$/, "") === "/import" ? <Outlet /> : version === "v2" ? (
        <Suspense fallback={<div className="p-8" role="status">Loading V2…</div>}>
          <NmgrApp />
        </Suspense>
      ) : (
        <MarketplaceShell />
      )}
    </ClientOnly>
  );
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
