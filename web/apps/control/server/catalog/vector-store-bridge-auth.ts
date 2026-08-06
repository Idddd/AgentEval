import { createHmac, timingSafeEqual } from "node:crypto";
import { getControlConfig } from "../config/control-config";

const bridgePurpose = "tasklattice:vector-store-bridge:v1";

export function vectorStoreBridgeApiKey(): string {
  return createHmac("sha256", getControlConfig().auth.session_signing_key)
    .update(bridgePurpose)
    .digest("hex");
}

export function vectorStoreBridgeApiBase(projectId: string): string {
  const config = getControlConfig();
  const controlUrl = config.server.internal_url ?? config.server.public_url;
  if (!controlUrl) {
    throw new Error(
      "The Vector Store bridge requires server.internal_url or server.public_url.",
    );
  }
  return `${controlUrl.replace(/\/+$/, "")}/api/internal/vector-stores/${encodeURIComponent(projectId)}`;
}

export function isVectorStoreBridgeAuthorized(authorization: string | null): boolean {
  const expected = Buffer.from(`Bearer ${vectorStoreBridgeApiKey()}`);
  const actual = Buffer.from(authorization ?? "");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
