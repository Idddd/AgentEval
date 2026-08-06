const persistentKey = "tasklattice.auth.token";
const sessionKey = "tasklattice.auth.session-token";

export function getAuthToken(): string {
  if (typeof window === "undefined") return "";
  return (
    window.sessionStorage.getItem(sessionKey) ??
    window.localStorage.getItem(persistentKey) ??
    ""
  );
}

export function storeAuthToken(token: string, remember: boolean): void {
  clearAuthToken();
  if (remember) window.localStorage.setItem(persistentKey, token);
  else window.sessionStorage.setItem(sessionKey, token);
}

export function clearAuthToken(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(persistentKey);
  window.sessionStorage.removeItem(sessionKey);
}
