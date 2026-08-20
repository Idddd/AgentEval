import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronDown, CircleUserRound, LogOut } from "lucide-react";

import type { AuthUser } from "@/components/auth/auth-provider";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { DEMO_PERSONAS, useDemoRole } from "@/hooks/use-demo-role";

type AccountMenuProps = {
  collapsed?: boolean;
  onLogout: () => void | Promise<void>;
  projectId: string;
  user: AuthUser | null;
};

function getInitials(user: AuthUser | null) {
  return (user?.displayName || user?.username || "User")
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function UserAvatar({
  user,
  size = "default",
}: {
  user: AuthUser | null;
  size?: "default" | "large";
}) {
  return (
    <Avatar
      className={cn(
        size === "large" ? "size-10" : "size-7",
        "ring-1 ring-border",
      )}
    >
      <AvatarFallback className="bg-primary text-[11px] font-bold text-primary-foreground">
        {getInitials(user)}
      </AvatarFallback>
    </Avatar>
  );
}

export function AccountMenu({
  collapsed = false,
  onLogout,
  projectId,
  user,
}: AccountMenuProps) {
  const { persona, setPersona } = useDemoRole();
  const navigate = useNavigate();
  const displayName = user?.displayName || user?.username || "User";
  const accountLabel =
    user?.provider === "sso" ? "SSO account" : "Local account";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Open account menu for ${displayName}`}
          className={cn(
            "group flex items-center rounded-md outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring/30 data-[state=open]:bg-accent",
            collapsed
              ? "mx-auto size-11 justify-center"
              : "h-9 w-full gap-2.5 px-3",
          )}
        >
          <UserAvatar user={user} />
          {collapsed ? null : (
            <>
              <span className="min-w-0 flex-1 text-left">
                <strong className="block truncate text-xs">{displayName}</strong>
                <span className="block truncate text-[10px] text-muted-foreground">
                  {accountLabel}
                </span>
              </span>
              <ChevronDown className="size-3.5 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={collapsed ? "start" : "center"}
        side={collapsed ? "right" : "top"}
        className="w-64"
      >
        <DropdownMenuLabel className="flex items-center gap-3 py-2 font-normal">
          <UserAvatar user={user} size="large" />
          <span className="min-w-0">
            <strong className="block truncate text-sm font-semibold">
              {displayName}
            </strong>
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
              {user?.email || user?.username}
            </span>
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="px-2 py-2">
          <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
            View as
            <select
              aria-label="View as"
              value={persona}
              className="h-9 rounded-md border bg-background px-2 text-sm text-foreground"
              onChange={(event) => {
                const nextPersona = event.target.value as typeof persona;
                setPersona(nextPersona);
                void navigate({
                  to:
                    nextPersona === "end-user"
                      ? "/$projectId/agent-garden"
                      : nextPersona === "agent-wizard"
                        ? "/$projectId/create"
                      : "/$projectId/evaluation/catalog",
                  params: { projectId },
                });
              }}
            >
              {DEMO_PERSONAS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/$projectId/profile" params={{ projectId }}>
            <CircleUserRound className="size-4" />
            My Account
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive focus:bg-destructive/10 focus:text-destructive"
          onSelect={() => void onLogout()}
        >
          <LogOut className="size-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
