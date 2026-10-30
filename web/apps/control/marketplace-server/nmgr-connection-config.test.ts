import { expect, it } from "vitest";
import { connectionEnvironment } from "./nmgr-connection-config";
import { nmgrConfiguration } from "./nmgr-api";
import { rootCertificates } from "node:tls";
import { databaseConfig } from "./storage/config";

const settings = {
  GUARD_API_URL: "https://nemo.internal/api/v1",
  GUARD_API_TOKEN: "business-token",
  MARKETPLACE_DATABASE_URL: "postgres://app:password@db.internal/marketplace",
};
it("uses only three inputs despite obsolete V1/V2 authoring, local actor and CRUD flags", () => {
  const effective = connectionEnvironment(
    new Request("https://ui.internal/api/nmgr/workspace"),
    {
      ...settings,
      MARKETPLACE_CRUD_ONLY: "true",
      MARKETPLACE_V2_LOCAL_ACCESS: "true",
      MARKETPLACE_DEMO_TOKEN: "obsolete-local-token",
      GUARD_POLICY_AUTHORING_URL: "invalid",
      MARKETPLACE_NEMO_AUTH_MODE: "invalid",
      GUARD_API_TOKEN_FILE: "/missing/old-token",
      MARKETPLACE_DATABASE_PASSWORD_REQUIRED: "true",
      MARKETPLACE_DATABASE_PASSWORD: "stale-password",
    },
  );
  expect(() => nmgrConfiguration(effective)).not.toThrow();
  expect(effective.MARKETPLACE_CRUD_ONLY).toBe("false");
  expect(databaseConfig(effective).password).toBe("password");
});
it("repairs optional workspace, database TLS and F5 settings from the same saved configuration", () => {
  const effective = connectionEnvironment(
    new Request("https://ui.internal/api/nmgr/workspace"),
    {
      ...settings,
      MARKETPLACE_WORKSPACE_ID: "invalid space",
      MARKETPLACE_DB_TLS: "true",
      MARKETPLACE_DB_CA_FILE: "/missing/ca.crt",
      MARKETPLACE_F5_ENABLED: "true",
      F5_API_URL: "invalid",
    },
    {
      workspaceId: "uat-fixed",
      databaseTls: "url",
      caMode: "system",
      f5Mode: "disabled",
    },
  );
  expect(() => nmgrConfiguration(effective)).not.toThrow();
  expect(databaseConfig(effective).ssl).toBeUndefined();
  expect(effective.MARKETPLACE_WORKSPACE_ID).toBe("uat-fixed");
  expect(effective.MARKETPLACE_DB_CA_FILE).toBeUndefined();
});
it("applies trusted CA contents to verified database TLS without requiring a server file", () => {
  const effective = connectionEnvironment(
    new Request("https://ui.internal/api/nmgr/workspace"),
    settings,
    {
      databaseTls: "true",
      caMode: "custom",
      caPem: rootCertificates[0]!,
    },
  );
  expect(databaseConfig(effective).ssl).toEqual({
    rejectUnauthorized: true,
    ca: rootCertificates[0],
  });
});
it("needs only three connection inputs for the V3 demo and derives origin without an account mapping", () => {
  const effective = connectionEnvironment(
    new Request("https://ui.internal/api/nmgr/workspace"),
    settings,
  );
  expect(effective).toMatchObject({
    MARKETPLACE_DATA_MODE: "live",
    MARKETPLACE_V3_DEMO: "true",
    MARKETPLACE_PUBLIC_ORIGIN: "https://ui.internal",
  });
  expect(() => nmgrConfiguration(effective)).not.toThrow();
});
it("accepts a matching browser HTTPS origin behind TLS termination without trusting a different host", () => {
  expect(
    connectionEnvironment(
      new Request("http://ui.internal/api/nmgr/connection", {
        headers: { Origin: "https://ui.internal" },
      }),
      settings,
    ).MARKETPLACE_PUBLIC_ORIGIN,
  ).toBe("https://ui.internal");
  expect(() =>
    connectionEnvironment(
      new Request("http://ui.internal/api/nmgr/connection", {
        headers: { Origin: "https://other.internal" },
      }),
      settings,
    ),
  ).toThrow(/origin/i);
  expect(() =>
    connectionEnvironment(
      new Request("https://ui.internal/api/nmgr/connection", {
        headers: { "sec-fetch-site": "cross-site" },
      }),
      settings,
    ),
  ).toThrow(/origin/i);
});
it.each(["invalid", "https://stale.internal"])(
  "derives demo origin instead of requiring the old publicOrigin setting: %s",
  (configured) => {
    expect(
      connectionEnvironment(
        new Request("https://ui.internal/api/nmgr/workspace"),
        { ...settings, MARKETPLACE_PUBLIC_ORIGIN: configured },
      ).MARKETPLACE_PUBLIC_ORIGIN,
    ).toBe("https://ui.internal");
  },
);
it("preserves explicitly configured public origin and strict identity mode", () => {
  const effective = connectionEnvironment(
    new Request("https://proxy.internal/api/nmgr/workspace"),
    {
      ...settings,
      MARKETPLACE_DATA_MODE: "live",
      MARKETPLACE_PUBLIC_ORIGIN: "https://public.internal",
      MARKETPLACE_V3_DEMO: "false",
    },
  );
  expect(effective.MARKETPLACE_PUBLIC_ORIGIN).toBe("https://public.internal");
  expect(() => nmgrConfiguration(effective)).toThrow(
    /account.*role|account.*mapping/i,
  );
});
it("does not bypass a strict deployment's mode or origin requirements", () => {
  const request = new Request("https://ui.internal/api/nmgr/workspace");
  expect(() =>
    nmgrConfiguration(
      connectionEnvironment(request, {
        ...settings,
        MARKETPLACE_V3_DEMO: "false",
        MARKETPLACE_DATA_MODE: "mock",
      }),
    ),
  ).toThrow(/live/i);
  expect(() =>
    nmgrConfiguration(
      connectionEnvironment(request, {
        ...settings,
        MARKETPLACE_V3_DEMO: "false",
        MARKETPLACE_DATA_MODE: "live",
      }),
    ),
  ).toThrow(/PUBLIC_ORIGIN/i);
});
it("can replace failed deployment inputs without mixing stale alternate credentials", () => {
  const effective = connectionEnvironment(
    new Request("https://ui.internal/api/nmgr/workspace"),
    {
      ...settings,
      MARKETPLACE_NEMO_AUTH_MODE: "password",
      GUARD_API_TOKEN_FILE: "/missing/token",
      GUARD_PASSWORD: "old-password",
      MARKETPLACE_DATABASE_PASSWORD_REQUIRED: "true",
      MARKETPLACE_DATABASE_PASSWORD: "old-db-password",
    },
    {
      nemoUrl: "https://new.internal/api/v1",
      nemoToken: "replacement-token",
      databaseUrl: "mariadb://app:new-password@new-db.internal/marketplace",
    },
  );
  expect(effective).toMatchObject({
    GUARD_API_URL: "https://new.internal/api/v1",
    GUARD_API_TOKEN: "replacement-token",
    MARKETPLACE_DATABASE_URL:
      "mariadb://app:new-password@new-db.internal/marketplace",
    MARKETPLACE_NEMO_AUTH_MODE: "token",
  });
  expect(effective.GUARD_API_TOKEN_FILE).toBeUndefined();
  expect(effective.GUARD_PASSWORD).toBeUndefined();
  expect(effective.MARKETPLACE_DATABASE_PASSWORD).toBeUndefined();
  expect(effective.MARKETPLACE_DATABASE_PASSWORD_REQUIRED).toBeUndefined();
});
