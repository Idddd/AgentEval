import { Link } from "@tanstack/react-router";
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
