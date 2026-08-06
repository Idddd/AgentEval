import { useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Eye, EyeOff, KeyRound, LoaderCircle, LockKeyhole, UserRound } from "lucide-react";
import { z } from "zod";
import { useAuth } from "@/components/auth/auth-provider";
import { BrandLogo } from "@/components/brand/brand-logo";
import { getStoredProjectId, projectPath } from "@/lib/project-storage";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  validateSearch: z.object({
    error: z.string().optional(),
    redirect: z.string().optional(),
  }),
});

function LoginPage() {
  const search = Route.useSearch();
  const { config, error: configError, loading, loginWithToken } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(search.error ?? "");
  const redirect =
    search.redirect?.startsWith("/") && !search.redirect.startsWith("//")
      ? search.redirect
      : projectPath(getStoredProjectId() ?? "individual");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/v1/auth/local", {
        body: JSON.stringify({ password, remember, username }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json()) as { message?: string; token?: string };
      if (!response.ok || !payload.token) throw new Error(payload.message ?? "Sign in failed.");
      await loginWithToken(payload.token, remember, redirect);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Sign in failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="grid min-h-svh bg-background text-foreground lg:grid-cols-[0.9fr_1.1fr]">
      <section className="login-visual relative hidden overflow-hidden border-r border-border p-12 lg:flex lg:flex-col lg:justify-between">
        <Link to="/" className="relative z-10 flex min-h-11 items-center gap-3 text-sm font-semibold">
          <BrandLogo />
        </Link>
        <div className="relative z-10 max-w-xl pb-8">
          <p className="font-mono text-xs uppercase tracking-[0.08em] text-primary">Authenticated operations</p>
          <h1 className="mt-7 text-6xl leading-[0.98] tracking-[-0.035em]">A clear boundary<br />before the work.</h1>
          <p className="mt-7 max-w-md text-base leading-7 text-muted-foreground">Local operators and your OIDC identity provider enter the same inspectable Project context.</p>
        </div>
        <div className="relative z-10 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground"><LockKeyhole className="size-4" />Session-protected control plane</div>
      </section>

      <section className="flex min-h-svh items-center justify-center px-5 py-12 sm:px-8 lg:px-16">
        <div className="w-full max-w-md">
          <Link to="/" className="mb-14 flex min-h-11 items-center gap-3 text-sm font-semibold lg:hidden">
            <BrandLogo />
          </Link>
          <p className="font-mono text-xs uppercase tracking-[0.08em] text-primary">Project access</p>
          <h2 className="mt-4 text-4xl tracking-[-0.025em]">Welcome back</h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">Sign in to create and operate isolated agents.</p>

          {error || configError ? (
            <div role="alert" className="mt-7 border-l-2 border-destructive bg-destructive/5 px-4 py-3 text-sm text-destructive">
              <strong className="block font-semibold">Sign in failed</strong>
              <span className="mt-1 block">{error || configError}</span>
            </div>
          ) : null}
          {config?.developmentDefaults ? (
            <div className="mt-7 border-l-2 border-primary bg-primary/5 px-4 py-3 text-sm text-foreground">
              The initial local account is <strong>admin / admin</strong>. Its
              password is written to the database on first sign-in and can be
              reset from My Account.
            </div>
          ) : null}

          <form onSubmit={submit} className="mt-8 space-y-5">
            <label className="block text-sm font-medium">
              Username
              <span className="mt-2 flex min-h-12 items-center gap-3 border border-input bg-background px-4 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15">
                <UserRound className="size-4 text-muted-foreground" />
                <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="Enter your username" required />
              </span>
            </label>
            <label className="block text-sm font-medium">
              Password
              <span className="mt-2 flex min-h-12 items-center gap-3 border border-input bg-background px-4 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15">
                <KeyRound className="size-4 text-muted-foreground" />
                <input value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="Enter your password" required type={showPassword ? "text" : "password"} />
                <button type="button" onClick={() => setShowPassword((value) => !value)} className="grid size-11 place-items-center text-muted-foreground hover:bg-muted focus-visible:outline-2" aria-label={showPassword ? "Hide password" : "Show password"}>
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </span>
            </label>
            <label className="flex min-h-11 items-center gap-3 text-sm text-muted-foreground">
              <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} className="size-4 accent-[#4339ff]" />
              Keep me signed in on this device
            </label>
            <button disabled={submitting || loading} type="submit" className="flex min-h-12 w-full items-center justify-center gap-2 bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60">
              {submitting ? <LoaderCircle className="size-4 animate-spin" /> : null}
              {submitting ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <div className="mt-8">
            <div className="flex items-center gap-4 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              or
              <span className="h-px flex-1 bg-border" />
            </div>
            <button
              type="button"
              aria-describedby="sso-login-description"
              disabled={loading || !config?.ssoEnabled}
              onClick={() => {
                if (!config?.ssoEnabled) return;
                window.location.assign(
                  `/api/v1/auth/sso/start?redirect=${encodeURIComponent(redirect)}`,
                );
              }}
              className="mt-6 flex min-h-12 w-full items-center justify-center gap-2 border border-input bg-background px-6 text-sm font-medium transition-colors hover:border-foreground focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:bg-muted/50 disabled:text-muted-foreground"
            >
              <LockKeyhole className="size-4" />
              SSO login
            </button>
            <p
              id="sso-login-description"
              className="mt-3 text-center text-xs leading-5 text-muted-foreground"
            >
              {config?.ssoEnabled
                ? `Continue with ${config.providerName}.`
                : "SSO is not configured for this deployment."}
            </p>
          </div>
          <p className="mt-10 text-center text-xs leading-5 text-muted-foreground">Access is limited to configured operators. Authentication events may be audited.</p>
        </div>
      </section>
    </main>
  );
}
