/** @vitest-environment jsdom */
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { TechnicalConfigForm, defaultTechnicalConfig, technicalConfigError } from "./technical-config";
afterEach(cleanup);
it("uses the F5 type-specific API fields and keeps both directions", () => {
  let saved = "";
  function Harness() { const [value, setValue] = useState(defaultTechnicalConfig("F5")); return <TechnicalConfigForm source="F5" value={value} onChange={(v) => { saved = v; setValue(v); }} />; }
  render(<Harness />);
  fireEvent.change(screen.getByRole("combobox", { name: "Scanner type" }), { target: { value: "keyword" } });
  expect(screen.queryByRole("textbox", { name: "Detection description (GenAI)" })).toBeNull();
  fireEvent.change(screen.getByRole("textbox", { name: "Keywords (comma separated)" }), { target: { value: "secret,private" } });
  expect(JSON.parse(saved)).toMatchObject({ direction: "both", config: { type: "keyword", words: ["secret", "private"] } });
  expect(technicalConfigError("F5", saved)).toBeNull();
  fireEvent.change(screen.getByRole("combobox", { name: "Scanner type" }), { target: { value: "regex" } });
  expect(JSON.parse(saved).config).toEqual({ type: "regex", pattern: "" });
  expect(technicalConfigError("F5", saved)).toContain("pattern");
});
it("requires Nemo source and rail fields and enforces the backend timeout range", () => {
  const cfg = JSON.parse(defaultTechnicalConfig("Guard"));
  expect(technicalConfigError("Guard", JSON.stringify(cfg))).not.toBeNull();
  cfg.sources[0].content = "flow protect_input\n  pass";
  cfg.rail_bindings[0].flow_name = "protect_input";
  expect(technicalConfigError("Guard", JSON.stringify(cfg))).toBeNull();
  cfg.rail_bindings[0].timeout_ms = 120001;
  expect(technicalConfigError("Guard", JSON.stringify(cfg))).toContain("timeout_ms");
  expect(technicalConfigError("Guard", "old free-text notes")).not.toBeNull();
});
it("restores structured Nemo fields and locks completed configuration", () => {
  const cfg = JSON.parse(defaultTechnicalConfig("Guard")); cfg.rail_bindings[0].flow_name = "privacy_check";
  render(<TechnicalConfigForm source="Guard" value={JSON.stringify(cfg)} disabled onChange={() => {}} />);
  expect((screen.getByRole("textbox", { name: "Flow name" }) as HTMLInputElement).value).toBe("privacy_check");
  expect(screen.getByRole("group", { name: "Nemo configuration" }).hasAttribute("disabled")).toBe(true);
});
