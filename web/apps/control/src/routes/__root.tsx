import type { QueryClient } from "@tanstack/react-query";
import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
  redirect,
} from "@tanstack/react-router";
import { MarketplaceShell } from "@/features/marketplace/shell";
import appCss from "../styles.css?url";

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
}>()({
  component: MarketplaceShell,
  beforeLoad: ({ location }) => {
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
      { title: "AI Marketplace" },
      {
        name: "description",
        content: "AI Marketplace · Guardrails and Policies",
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/api/branding/favicon" },
    ],
  }),
  shellComponent: RootDocument,
});

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
