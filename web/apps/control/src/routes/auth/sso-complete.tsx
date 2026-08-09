import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { LoaderCircle } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { getStoredProjectId, projectPath } from "@/lib/project-storage";

export const Route = createFileRoute("/auth/sso-complete")({
  component: SsoComplete,
});

function SsoComplete() {
  const { loginWithToken } = useAuth();
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const token = params.get("token");
    const redirect = params.get("redirect") ?? projectPath(getStoredProjectId() ?? "individual");
    if (!token) {
      window.location.replace("/login?error=SSO%20did%20not%20return%20a%20session.");
      return;
    }
    window.history.replaceState(null, "", "/auth/sso-complete");
    void loginWithToken(token, false, redirect).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "SSO session validation failed.";
      window.location.replace(`/login?error=${encodeURIComponent(message)}`);
    });
  }, [loginWithToken]);

  return (
    <main className="grid min-h-svh place-items-center bg-background p-6 text-foreground">
      <div className="text-center"><LoaderCircle className="mx-auto size-6 animate-spin text-primary" /><p className="mt-4 text-sm text-muted-foreground">Completing secure sign in…</p></div>
    </main>
  );
}
