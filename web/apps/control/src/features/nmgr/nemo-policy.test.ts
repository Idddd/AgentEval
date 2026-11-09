import { expect, it } from "vitest";
import { nemoPolicyError, parseNemoPolicy } from "./nemo-policy";

it.each(['Block secrets', 'null', '[]', '{}', '{"kind":"Policy","schema_version":1,"rules":[],"tests":[]}'])("rejects invalid Policy content: %s", content => {
  expect(nemoPolicyError(content)).toBeTruthy();
  expect(() => parseNemoPolicy(content)).toThrow();
});
it("allows an untested draft but requires embedded tests at evaluation time", () => {
  const definition = { kind: "Policy", schema_version: 1, rules: [{ id: "control" }], tests: [] };
  expect(parseNemoPolicy(JSON.stringify(definition))).toEqual(definition);
  expect(() => parseNemoPolicy(JSON.stringify(definition), true)).toThrow(/acceptance tests/);
  const tested = { ...definition, tests: [{ id: "acceptance" }] };
  expect(parseNemoPolicy(JSON.stringify(tested), true)).toEqual(tested);
});
