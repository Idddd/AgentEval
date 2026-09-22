import {
  ClientOnly,
  Link,
  Outlet,
  useRouterState,
} from "@tanstack/react-router";
import { FileText, Folder, ShieldCheck } from "lucide-react";
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
import {
  BusinessDemoProvider,
  BusinessConnectionStatus,
} from "@/features/business-demo/provider";
import { OwnerMenu } from "@/features/business-demo/owner-menu";

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
          <BusinessDemoProvider>
            <ShellContent />
          </BusinessDemoProvider>
        </SidebarProvider>
      </TooltipProvider>
    </ClientOnly>
  );
}

function ShellContent() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const section = pathname === "/policies" ? "Guardrails" : "Profiles";
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
            <span className="hidden sm:inline">Default Project</span>
            <span className="hidden text-muted-foreground sm:inline">/</span>
            <span className="font-medium">{section}</span>
          </div>
        </header>
        <BusinessConnectionStatus />
        <main
          id="marketplace-content"
          tabIndex={-1}
          className="mx-auto w-full max-w-[1600px] p-5 sm:p-6 lg:px-8"
        >
          <Outlet />
        </main>
      </SidebarInset>
    </>
  );
}

function MarketplaceSidebar({ section }: { section: string }) {
  const { isMobile, state, setOpenMobile } = useSidebar();
  const compact = !isMobile && state === "collapsed";
  const sections = [
    { to: "/guardrails" as const, label: "Profiles", icon: ShieldCheck },
    { to: "/policies" as const, label: "Guardrails", icon: FileText },
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
          title="Default Project"
        >
          <Folder className="size-4 shrink-0 text-muted-foreground" />
          {!compact && <span>Default Project</span>}
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
        <OwnerMenu compact={compact} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
