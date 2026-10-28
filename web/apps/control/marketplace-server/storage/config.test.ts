import { expect, it } from "vitest";
import { databaseConfig, databaseCacheKey } from "./config";

it.each([
  ["postgresql://app@db/marketplace", "postgresql", 5432],
  ["postgres://app@db/marketplace", "postgresql", 5432],
  ["mariadb://app@db/marketplace", "mariadb", 3306],
  ["mysql://app@db/marketplace", "mariadb", 3306],
])("selects the SQL driver for %s", (url, dialect, port) => {
  expect(databaseConfig({ MARKETPLACE_DATABASE_URL: url })).toMatchObject({ dialect, port, database: "marketplace", user: "app" });
});
it("uses the separate Secret password verbatim over an embedded URL password", () => {
  const env = { MARKETPLACE_DATABASE_URL: "postgresql://app:old@db/marketplace", MARKETPLACE_DATABASE_PASSWORD: "p@ss:/?#% 中文" };
  expect(databaseConfig(env).password).toBe("p@ss:/?#% 中文");
  expect(databaseCacheKey(env)).not.toBe(databaseCacheKey({ ...env, MARKETPLACE_DATABASE_PASSWORD: "changed" }));
  expect(databaseCacheKey(env)).not.toContain("old");
  expect(databaseConfig({ MARKETPLACE_DATABASE_URL: "mysql://app:p%40ss%25@db/marketplace" }).password).toBe("p@ss%");
});
it("accepts verified TLS and PostgreSQL schema options without silently disabling TLS", () => {
  expect(databaseConfig({ MARKETPLACE_DATABASE_URL: "postgresql://app@db/marketplace?schema=public&sslmode=require" }).ssl).toEqual({ rejectUnauthorized: true });
  expect(() => databaseConfig({ MARKETPLACE_DATABASE_URL: "postgresql://app@db/marketplace?sslmode=disable", MARKETPLACE_DB_TLS: "true" })).toThrow();
});
it.each(["sqlite://app@db/test", "postgresql://db/test", "mysql://app@db/", "postgresql://app:do-not-leak@db/test?sslmode=prefer", "postgresql://app@db/test?schema=x%3Bdrop", "postgresql://app@db/test?schema=UpperCase", "postgresql://app@db/test?unknown=true"])("rejects unsafe or unsupported configuration without exposing credentials", url => {
  expect(() => databaseConfig({ MARKETPLACE_DATABASE_URL: url })).toThrow("Invalid Marketplace database configuration");
});
