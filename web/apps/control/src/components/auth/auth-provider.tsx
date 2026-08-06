import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  clearAuthToken,
  getAuthToken,
  storeAuthToken,
} from "@/lib/auth-token";
import { getStoredProjectId, projectPath } from "@/lib/project-storage";

export interface AuthConfig {
  authRequired: boolean;
  developmentDefaults: boolean;
  localEnabled: boolean;
  mode: "local" | "local-sso";
  providerName: string;
  ssoEnabled: boolean;
}

export interface AuthUser {
  displayName: string;
  email: string;
  id: string;
  provider: "local" | "sso";
  systemRole: "user" | "super_administrator";
  username: string;
}

interface AuthContextValue {
  config: AuthConfig | null;
  error: string;
  loading: boolean;
  loginWithToken: (token: string, remember?: boolean, redirect?: string) => Promise<void>;
  logout: () => Promise<void>;
  user: AuthUser | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function jsonRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const payload = (await response.json()) as T & {
    message?: string;
  };
  if (!response.ok) {
    throw new Error(payload.message ?? `Request failed (${response.status}).`);
  }
  return payload;
}

async function loadUser(token: string): Promise<AuthUser> {
  const response = await jsonRequest<{ user: AuthUser }>("/api/v1/auth/me", {
    headers: { authorization: `Bearer ${token}` },
  });
  return response.user;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    let disposed = false;
    const bootstrap = async () => {
      setLoading(true);
      setError("");
      try {
        const nextConfig = await jsonRequest<AuthConfig>("/api/v1/auth/config");
        if (disposed) return;
        setConfig(nextConfig);
        const token = getAuthToken();
        if (!token) {
          setUser(null);
          return;
        }
        try {
          const nextUser = await loadUser(token);
          if (!disposed) setUser(nextUser);
        } catch (reason) {
          clearAuthToken();
          if (!disposed) {
            setUser(null);
            setError(
              reason instanceof Error
                ? reason.message
                : "Your session is no longer valid.",
            );
          }
        }
      } catch (reason) {
        if (!disposed) {
          setError(
            reason instanceof Error
              ? reason.message
              : "Unable to load authentication configuration.",
          );
        }
      } finally {
        if (!disposed) setLoading(false);
      }
    };
    void bootstrap();
    return () => {
      disposed = true;
    };
  }, []);

  const loginWithToken = useCallback(
    async (token: string, remember = false, redirect = "") => {
      storeAuthToken(token, remember);
      try {
        setUser(await loadUser(token));
      } catch (error) {
        clearAuthToken();
        throw error;
      }
      const returnPath =
        redirect.startsWith("/") && !redirect.startsWith("//")
          ? redirect
          : projectPath(getStoredProjectId() ?? "individual");
      window.location.assign(returnPath);
    },
    [navigate],
  );

  const logout = useCallback(async () => {
    const token = getAuthToken();
    let redirectUrl = "";
    try {
      if (token) {
        const response = await jsonRequest<{ redirectUrl?: string }>(
          "/api/v1/auth/logout",
          {
            headers: { authorization: `Bearer ${token}` },
            method: "POST",
          },
        );
        redirectUrl = response.redirectUrl ?? "";
      }
    } catch {
      // Clearing local credentials is sufficient for local logout.
    } finally {
      clearAuthToken();
      setUser(null);
      if (redirectUrl) window.location.assign(redirectUrl);
      else await navigate({ to: "/login" });
    }
  }, [navigate]);

  const value = useMemo(
    () => ({ config, error, loading, loginWithToken, logout, user }),
    [config, error, loading, loginWithToken, logout, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider.");
  return value;
}
