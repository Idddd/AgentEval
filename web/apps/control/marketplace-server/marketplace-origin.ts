import { DeploymentError } from "./diagnostics";

export function parseHttpOrigin(value: string): URL | undefined {
  try {
    const url = new URL(value);
    if (["http:", "https:"].includes(url.protocol) && url.origin === value) return url;
  } catch { /* An invalid or non-canonical origin is not trusted. */ }
  return undefined;
}

export function configuredMarketplaceOrigin(env: NodeJS.ProcessEnv): string | undefined {
  const value = env.MARKETPLACE_PUBLIC_ORIGIN || undefined;
  if (value && !parseHttpOrigin(value)) {
    throw new DeploymentError(
      "origin", "public_origin_invalid",
      "MARKETPLACE_PUBLIC_ORIGIN must be the browser HTTP(S) origin without a path or trailing slash.",
      ["MARKETPLACE_PUBLIC_ORIGIN"],
    );
  }
  return value;
}
