import { ChevronDown, LogOut } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useBusinessDemo } from "./provider";

export function OwnerMenu({ compact = false }: { compact?: boolean }) {
  const { mode, currentOwner, owners, switchOwner, disconnect, busy, role, switchRole } =
    useBusinessDemo();
  const name = mode === "mock" ? (currentOwner ?? "Admin") : "Guard connection";
  const initials =
    mode === "live"
      ? "G"
      : name === "Admin"
        ? "A"
        : name.slice(0, 2).toUpperCase();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Open account menu for ${name}`}
          disabled={busy}
          className={`flex items-center rounded-md outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring/30 data-[state=open]:bg-accent ${compact ? "mx-auto size-11 justify-center" : "w-full gap-3 px-2 py-2"}`}
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
            {initials}
          </span>
          {!compact && (
            <>
              <span className="min-w-0 flex-1 text-left text-xs">
                <strong className="block truncate font-medium">{name}</strong>
                <span className="block text-[10px] text-muted-foreground">
                  {mode === "live" ? (disconnect ? "Personal access token" : "Local demo") : role ?? "User"}
                </span>
              </span>
              <ChevronDown className="size-3.5 text-muted-foreground" />
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side={compact ? "right" : "top"}
        align="start"
        className="w-56"
      >
        {mode === "mock" ? (
          <>
            <DropdownMenuLabel>Role</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={role ?? "User"} onValueChange={(value) => switchRole?.(value as "User" | "Agent Wizard")}>
              <DropdownMenuRadioItem value="User">User</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="Agent Wizard">Agent Wizard</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuLabel>Switch user</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={currentOwner ?? "Admin"}
              onValueChange={(owner) => switchOwner?.(owner)}
            >
              {(owners ?? []).map((owner) => (
                <DropdownMenuRadioItem key={owner} value={owner}>
                  {owner}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </>
        ) : disconnect ? (
          <DropdownMenuItem onSelect={() => disconnect?.()} disabled={!!busy}>
            <LogOut className="size-4" />
            Switch account
          </DropdownMenuItem>
        ) : <DropdownMenuLabel>Connected automatically</DropdownMenuLabel>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
