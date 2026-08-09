import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  Check,
  CircleUserRound,
  Clock3,
  FolderKanban,
  KeyRound,
  MapPin,
  Monitor,
  Moon,
  ShieldCheck,
  Sun,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { ProjectAvatar } from "@/components/project/project-item";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { useProject } from "@/hooks/use-project";
import {
  applyPlatformPreferences,
  detectedTimezone,
} from "@/lib/platform-preferences";
import { cn } from "@/lib/utils";
import {
  getPersonalProfile,
  personalProfileQueryKey,
  resetLocalPassword,
  updatePersonalProfile,
  type ThemePreference,
} from "@/services/personal-profile";

export const Route = createFileRoute("/$projectId/profile")({
  component: MyAccountPage,
});

const fallbackTimezones = [
  "UTC",
  "Asia/Shanghai",
  "Asia/Hong_Kong",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Europe/Berlin",
  "Europe/London",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Australia/Sydney",
];

function getSupportedTimezones(): string[] {
  const supportedValuesOf = (
    Intl as typeof Intl & {
      supportedValuesOf?: (key: "timeZone") => string[];
    }
  ).supportedValuesOf;
  const values = supportedValuesOf?.("timeZone") ?? fallbackTimezones;
  return Array.from(new Set(["UTC", detectedTimezone(), ...values])).sort();
}

function MyAccountPage() {
  const queryClient = useQueryClient();
  const { availableProjects, currentProject } = useProject();
  const profile = useQuery({
    queryKey: personalProfileQueryKey,
    queryFn: getPersonalProfile,
  });
  const [city, setCity] = useState("");
  const [theme, setTheme] = useState<ThemePreference>("system");
  const [timezone, setTimezone] = useState(detectedTimezone);
  const [now, setNow] = useState(() => new Date());
  const timezones = useMemo(getSupportedTimezones, []);

  useEffect(() => {
    if (!profile.data) return;
    setCity(profile.data.city);
    setTheme(profile.data.theme);
    setTimezone(profile.data.timezone);
  }, [profile.data]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const preferences = useMutation({
    mutationFn: () =>
      updatePersonalProfile({
        city: city.trim(),
        theme,
        timezone,
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(personalProfileQueryKey, data);
      applyPlatformPreferences(data);
    },
  });

  const chooseTheme = (nextTheme: ThemePreference) => {
    setTheme(nextTheme);
    applyPlatformPreferences({ theme: nextTheme, timezone });
  };

  const chooseTimezone = (nextTimezone: string) => {
    setTimezone(nextTimezone);
    applyPlatformPreferences({ theme, timezone: nextTimezone });
  };

  if (profile.isPending) {
    return (
      <div className="grid min-h-72 place-items-center text-sm text-muted-foreground">
        <Spinner />
        <span className="sr-only">Loading My Account…</span>
      </div>
    );
  }

  if (profile.error || !profile.data) {
    return (
      <div
        role="alert"
        className="border-l-2 border-destructive bg-destructive/5 p-4 text-sm text-destructive"
      >
        {profile.error?.message ?? "My Account is unavailable."}
      </div>
    );
  }

  const current = profile.data;
  const dirty =
    city.trim() !== current.city ||
    theme !== current.theme ||
    timezone !== current.timezone;
  const localTime = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(now);

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Account"
        description="Manage your identity, Project access, and platform preferences."
      />

      <Card className="py-0">
        <div className="flex min-h-24 flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center">
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
            <CircleUserRound className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate font-heading text-xl">
                {current.displayName}
              </h2>
              <Badge variant="outline">
                {current.systemRole === "super_administrator"
                  ? "Super Administrator"
                  : current.provider === "sso"
                    ? "SSO account"
                    : "Local account"}
              </Badge>
            </div>
            <p className="mt-1 truncate text-sm text-muted-foreground">
              {current.email || current.username}
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm sm:text-right">
            <dt className="text-muted-foreground">Username</dt>
            <dd className="font-medium">{current.username}</dd>
            <dt className="text-muted-foreground">Projects</dt>
            <dd className="font-medium">{availableProjects.length}</dd>
          </dl>
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(22rem,0.85fr)]">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Platform preferences</CardTitle>
              <CardDescription>
                These choices follow your account and apply across Projects.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                className="space-y-6"
                onSubmit={(event: FormEvent<HTMLFormElement>) => {
                  event.preventDefault();
                  if (dirty) preferences.mutate();
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="account-city">City</Label>
                  <div className="relative max-w-xl">
                    <MapPin
                      className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <Input
                      id="account-city"
                      className="h-11 pl-9"
                      maxLength={120}
                      placeholder="Your city"
                      value={city}
                      onChange={(event) => setCity(event.target.value)}
                    />
                  </div>
                  <p className="text-xs leading-5 text-muted-foreground">
                    Personal information only; it does not change Project
                    settings.
                  </p>
                </div>

                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium">Theme</legend>
                  <div className="grid max-w-xl gap-2 sm:grid-cols-3">
                    {([
                      ["system", Monitor, "System"],
                      ["light", Sun, "Light"],
                      ["dark", Moon, "Dark"],
                    ] as const).map(([value, Icon, label]) => (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={theme === value}
                        className={cn(
                          "flex min-h-12 items-center gap-2 rounded-md border px-3 text-sm outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/35",
                          theme === value &&
                            "border-primary/40 bg-primary/[0.07] text-primary",
                        )}
                        onClick={() => chooseTheme(value)}
                      >
                        <Icon className="size-4" />
                        <span>{label}</span>
                        {theme === value ? (
                          <Check className="ml-auto size-4" />
                        ) : null}
                      </button>
                    ))}
                  </div>
                </fieldset>

                <div className="space-y-2">
                  <Label htmlFor="account-timezone">Local time zone</Label>
                  <select
                    id="account-timezone"
                    className="flex h-11 w-full max-w-xl rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                    value={timezone}
                    onChange={(event) => chooseTimezone(event.target.value)}
                  >
                    {timezones.map((value) => (
                      <option key={value} value={value}>
                        {value.replaceAll("_", " ")}
                      </option>
                    ))}
                  </select>
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock3 className="size-3.5" />
                    {localTime} · {timezone.replaceAll("_", " ")}
                  </p>
                </div>

                {preferences.error ? (
                  <p className="text-sm text-destructive" role="alert">
                    {preferences.error.message}
                  </p>
                ) : null}
                {preferences.isSuccess && !dirty ? (
                  <p className="text-sm text-emerald-700 dark:text-emerald-300" role="status">
                    Account preferences saved.
                  </p>
                ) : null}

                <Button
                  className="h-11"
                  type="submit"
                  disabled={preferences.isPending || !dirty}
                >
                  {preferences.isPending ? <Spinner /> : null}
                  Save account preferences
                </Button>
              </form>
            </CardContent>
          </Card>

          <PasswordCard provider={current.provider} />
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FolderKanban className="size-4" />
              Your Projects
            </CardTitle>
            <CardDescription>
              Projects you can access and your role in each one.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {availableProjects.length ? (
              <div className="divide-y rounded-md border">
                {availableProjects.map((project) => {
                  const active = project.id === currentProject?.id;
                  return (
                    <div
                      key={project.id}
                      className="flex min-h-16 items-center gap-3 px-3 py-2"
                    >
                      <ProjectAvatar project={project} />
                      <span className="min-w-0 flex-1">
                        <strong className="block truncate text-sm">
                          {project.name}
                        </strong>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {project.role === "admin" ? "Administrator" : "Member"} ·{" "}
                          {project.type === "personal" ? "Personal" : "Team"}
                        </span>
                      </span>
                      {active ? (
                        <Badge variant="secondary">Current</Badge>
                      ) : (
                        <Button asChild size="sm" variant="ghost">
                          <Link
                            to="/$projectId"
                            params={{ projectId: project.id }}
                            aria-label={`Open ${project.name}`}
                          >
                            Open
                            <ArrowUpRight />
                          </Link>
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="rounded-md border border-dashed p-5 text-sm text-muted-foreground">
                No Project access is available for this account.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function PasswordCard({
  provider,
}: {
  provider: "local" | "sso";
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const reset = useMutation({
    mutationFn: () =>
      resetLocalPassword({
        currentPassword,
        newPassword,
      }),
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    },
  });

  if (provider === "sso") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4" />
            Password & security
          </CardTitle>
          <CardDescription>
            This is an SSO account. Password and sign-in security are managed
            by your identity provider.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const matches = newPassword === confirmPassword;
  const valid =
    currentPassword.length > 0 &&
    newPassword.length >= 12 &&
    matches &&
    currentPassword !== newPassword;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="size-4" />
          Reset local password
        </CardTitle>
        <CardDescription>
          Choose at least 12 characters. The password is stored only as a
          bcrypt hash.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (valid) reset.mutate();
          }}
        >
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="current-password">Current password</Label>
            <Input
              id="current-password"
              autoComplete="current-password"
              className="h-11"
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              autoComplete="new-password"
              className="h-11"
              minLength={12}
              maxLength={128}
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm new password</Label>
            <Input
              id="confirm-password"
              autoComplete="new-password"
              aria-invalid={Boolean(confirmPassword) && !matches}
              className="h-11"
              minLength={12}
              maxLength={128}
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          </div>
          {confirmPassword && !matches ? (
            <p className="text-sm text-destructive sm:col-span-2" role="alert">
              New passwords do not match.
            </p>
          ) : null}
          {reset.error ? (
            <p className="text-sm text-destructive sm:col-span-2" role="alert">
              {reset.error.message}
            </p>
          ) : null}
          {reset.isSuccess ? (
            <p className="text-sm text-emerald-700 dark:text-emerald-300 sm:col-span-2" role="status">
              Password reset. Use the new password the next time you sign in.
            </p>
          ) : null}
          <div className="sm:col-span-2">
            <Button
              className="h-11"
              type="submit"
              variant="outline"
              disabled={reset.isPending || !valid}
            >
              {reset.isPending ? <Spinner /> : <KeyRound />}
              Reset password
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
