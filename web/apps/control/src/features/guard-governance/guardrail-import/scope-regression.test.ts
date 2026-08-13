import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const importedSource = readFileSync(
  resolve("src/features/guard-governance/guardrail-import/guardrails.tsx"),
  "utf8",
);

describe("Guardrail source import boundaries", () => {
  it("uses only typed project Guardrail routes", () => {
    expect(importedSource).toContain(
      'to="/$projectId/governance/guardrails/$guardrailId"',
    );
    expect(importedSource).toContain(
      'to="/$projectId/governance/guardrails"',
    );
    expect(importedSource).not.toContain('to="/guardrails"');
    expect(importedSource).not.toContain("<a href=");
  });

  it("does not import independent governance route pages", () => {
    expect(importedSource).not.toContain(
      'from "@/features/guard-governance/assignments',
    );
    expect(importedSource).not.toContain(
      'from "@/features/guard-governance/enforcements',
    );
    expect(importedSource).not.toContain(
      'from "@/features/guard-governance/integrations',
    );
    expect(importedSource).not.toContain(
      'from "@/features/guard-governance/evidence',
    );
  });
});
