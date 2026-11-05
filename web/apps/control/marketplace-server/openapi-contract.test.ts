import { expect, it } from "vitest";
import Ajv2020 from "ajv/dist/2020";
import { createOpenApi, commandExamples, apiInventory } from "./openapi";
import { workbenchNavigation } from "../src/features/nmgr/workbench";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { assertOpenApiSchema } from "./test-utils/openapi";
const contract = () => createOpenApi() as any;
function validator(name: string) {
  const schemas = contract().components.schemas;
  const ajv = new Ajv2020({ strict: false, validateFormats: false, allErrors: true });
  return ajv.compile({ ...schemas[name], components: { schemas } });
}
it("describes actual nested bindings, imported provenance and evaluation evidence instead of free-form objects", () => {
  const schemas = contract().components.schemas;
  for (const name of ["Binding", "PolicyBinding", "F5Binding", "ImportedResource", "EvaluationRun", "EvaluationEvidence", "Actor", "AuditEntry", "Readiness", "RuntimeStatus", "ApiInventory"])
    expect(schemas[name], name).toBeTruthy();
  expect(schemas.Entity.properties.imported.$ref).toContain("ImportedResource");
  expect(schemas.Workspace.properties.bindings.additionalProperties.$ref).toContain("Binding");
  expect(schemas.Entity.required).toEqual(expect.arrayContaining(["unit", "refs", "deployed", "runs", "updated"]));
});
it("rejects incorrect nested binding versions and missing actor fields", () => {
  const validate = validator("Workspace");
  const snapshot = { revision: 1, actor: { id: "u", name: "User", role: "User", unit: "ISS" }, sources: ["NeMo"], state: { entities: [], audit: [] }, jobs: {}, bindings: { "guard@1": { policyId: "remote", revision: 0, publishedVersion: "1.0", released: true, ruleIds: ["rule"], rails: ["input"] } } };
  expect(validate(snapshot), JSON.stringify(validate.errors)).toBe(true);
  expect(validate({ ...snapshot, bindings: { "guard@1": { publishedVersion: 17 } } })).toBe(false);
  expect(validate({ ...snapshot, actor: { role: "User" } })).toBe(false);
});
it("compiles all component schemas and validates every command example", () => {
  for (const name of Object.keys(contract().components.schemas)) expect(() => validator(name), name).not.toThrow();
  const validate = validator("Command");
  for (const example of Object.values(commandExamples)) expect(validate(example.value), JSON.stringify(validate.errors)).toBe(true);
});
it("documents strict-mode bearer authentication and every visible live navigation view", () => {
  const spec = contract(), inventory = apiInventory() as any;
  expect(spec.components.securitySchemes?.bearerAuth).toMatchObject({ type: "http", scheme: "bearer" });
  expect(spec.paths["/api/nmgr/commands"].post.security).toContainEqual({ bearerAuth: [] });
  expect(inventory.pages).toBeInstanceOf(Array);
  for (const item of Object.values(workbenchNavigation).flat().filter(item => item.view !== "enforce")) {
    expect(inventory.pages.some((page: any) => page.kind === item.kind && page.view === item.view && page.availability === "live"), `${item.kind}/${item.view}`).toBe(true);
  }
  for (const page of inventory.pages) for (const operationId of page.operationIds) expect(inventory.items.some((operation: any) => operation.operationId === operationId), `${page.page}: ${operationId}`).toBe(true);
  expect(inventory.pages.find((page: any) => page.view === "measure").availability).toBe("mock-only");
});
it("covers every NMGR browser API call and resolves component references and unique operation IDs", () => {
  const spec = contract();
  const directory = fileURLToPath(new URL("../src/features/nmgr", import.meta.url));
  const visit = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? visit(join(directory, entry.name)) : entry.name.endsWith(".tsx") && !entry.name.includes(".test.") ? [readFileSync(join(directory, entry.name), "utf8")] : []);
  const paths = new Set(visit(directory).flatMap(source => [...source.matchAll(/runtimeRequest(?:<[^;]*?>)?\(["`](\/api\/[^"`?]+)/g)].map(match => match[1]!)));
  expect(paths.size).toBeGreaterThan(3);
  for (const path of paths) expect(spec.paths[path], path).toBeTruthy();
  const ids = Object.values(spec.paths).flatMap((path: any) => Object.values(path).map((operation: any) => operation.operationId));
  expect(new Set(ids).size).toBe(ids.length);
  for (const match of JSON.stringify(spec).matchAll(/"\$ref":"#\/components\/schemas\/([^"/]+)"/g)) expect(spec.components.schemas[match[1]!], match[1]).toBeTruthy();
  expect(() => assertOpenApiSchema("ApiInventory", apiInventory())).not.toThrow();
});
