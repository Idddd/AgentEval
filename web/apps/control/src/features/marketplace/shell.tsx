import {
  ClientOnly,
  Link,
  Outlet,
  useRouterState,
} from "@tanstack/react-router";
import { CircleHelp, Folder, Layers2, Search, ShieldCheck } from "lucide-react";
import { BrandMark } from "@/components/brand/brand-logo";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { GuardGovernanceProvider } from "@/features/guard-governance/mock-provider";
import { GuardrailImportProvider } from "@/features/guard-governance/guardrail-import/guardrail-import-provider";

// Restore the original visual shell without depending on live backend services.
export function MarketplaceShell() {
  return (
    <ClientOnly
      fallback={
        <div className="p-8 text-sm text-muted-foreground" role="status">
          Loading AI Marketplace…
        </div>
      }
    >
      <TooltipProvider delayDuration={250}>
        <SidebarProvider>
          <ShellContent />
        </SidebarProvider>
      </TooltipProvider>
    </ClientOnly>
  );
}

function ShellContent() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const section = pathname === "/templates" ? "Templates" : "Guardrails";
  return (
    <>
      <a
        href="#marketplace-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-background focus:p-3"
      >
        Skip to content
      </a>
      <MarketplaceSidebar section={section} />
      <SidebarInset>
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/94 px-4 backdrop-blur-md sm:px-6 lg:px-8">
          <SidebarTrigger />
          <div className="flex items-center gap-1 text-xs">
            <span className="hidden sm:inline">Demo Project</span>
            <span className="hidden text-muted-foreground sm:inline">/</span>
            <span className="font-medium">{section}</span>
          </div>
          <button
            disabled
            className="ml-auto hidden h-9 w-64 items-center gap-2 rounded-md border bg-muted/25 px-3 text-left text-xs text-muted-foreground/55 lg:flex"
          >
            <Search className="size-4" />
            Search project
            <span className="ml-auto text-[9px] uppercase">Later</span>
          </button>
        </header>
        <main
          id="marketplace-content"
          tabIndex={-1}
          className="mx-auto w-full max-w-[1600px] p-5 sm:p-6 lg:px-8"
        >
          <GuardGovernanceProvider projectId="individual">
            <GuardrailImportProvider projectId="individual">
              <Outlet />
            </GuardrailImportProvider>
          </GuardGovernanceProvider>
        </main>
      </SidebarInset>
    </>
  );
}

function MarketplaceSidebar({ section }: { section: string }) {
  const { isMobile, state, setOpenMobile } = useSidebar();
  const compact = !isMobile && state === "collapsed";
  const sections = [
    { to: "/guardrails" as const, label: "Guardrails", icon: ShieldCheck },
    { to: "/templates" as const, label: "Templates", icon: Layers2 },
  ];
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="gap-1.5 border-b border-sidebar-border p-2">
        <Link
          to="/guardrails"
          aria-label="AI Marketplace home"
          onClick={() => setOpenMobile(false)}
          className="flex min-h-11 min-w-0 items-center gap-3 px-2 group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:size-11 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
        >
          <BrandMark className="size-8 shrink-0" />
          {!compact && (
            <strong className="truncate font-sans text-[15px] font-medium tracking-wide">
              AI Marketplace
            </strong>
          )}
        </Link>
        <div
          className="flex h-11 items-center gap-3 rounded-md border border-sidebar-border px-3 text-[13px] group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
          title="Demo Project"
        >
          <Folder className="size-4 shrink-0 text-muted-foreground" />
          {!compact && <span>Demo Project</span>}
        </div>
      </SidebarHeader>
      <SidebarContent>
        <nav aria-label="Marketplace sections" className="flex flex-col py-1">
          <SidebarGroup>
            <SidebarGroupLabel>Workspace</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {sections.map(({ to, label, icon: Icon }) => (
                  <SidebarMenuItem key={to}>
                    <SidebarMenuButton
                      asChild
                      isActive={section === label}
                      tooltip={label}
                    >
                      <Link
                        to={to}
                        aria-label={label}
                        aria-current={section === label ? "page" : undefined}
                        onClick={() => setOpenMobile(false)}
                      >
                        <Icon />
                        <span>{label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </nav>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton disabled tooltip="Help & documentation">
              <CircleHelp />
              <span>Help & documentation</span>
              <span className="ml-auto text-[10px] uppercase">Later</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <div className="mt-1 flex items-center gap-3 border-t border-sidebar-border px-2 pt-3 pb-1 group-data-[collapsible=icon]:justify-center">
          <span
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground"
            aria-label="Local Administrator"
          >
            LA
          </span>
          {!compact && (
            <div className="min-w-0 text-xs">
              <div className="font-medium">Local Administrator</div>
              <div className="text-[10px] text-muted-foreground">
                Local account
              </div>
            </div>
          )}
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
