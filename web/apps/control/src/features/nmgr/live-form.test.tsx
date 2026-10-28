/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { LiveForm, toDraft } from "./live-form";
import type { Entity, Kind, State } from "./model";

afterEach(cleanup);
const state: State = { entities: [], audit: [] };
const props = { state, sources: ["NeMo"] as Array<"NeMo" | "F5">, controlUnit: "ISS", busy: false, onCancel: () => {} };
it.each(["Guardrail", "Profile"] as Kind[])("does not let User choose or submit a Source for %s", kind => {
  const onSave = vi.fn(async (_draft: ReturnType<typeof toDraft>) => {});
  render(<LiveForm {...props} sources={["NeMo", "F5"]} kind={kind} mode="create" onSave={onSave} />);
  expect(screen.queryByLabelText("Source")).toBeNull();
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "New request" } });
  fireEvent.change(screen.getByLabelText(kind === "Guardrail" ? "Control intent" : "Use case"), { target: { value: "Secret protection" } });
  fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));
  expect(onSave.mock.calls[0]?.[0]).not.toHaveProperty("provider");
});

it.each(["Guardrail", "Profile"] as Kind[])("allocates a different ID for each new %s form", kind => {
  const onSave = vi.fn(async (_draft: ReturnType<typeof toDraft>) => {});
  const mount = () => render(<LiveForm {...props} kind={kind} mode="create" onSave={onSave} />);
  const submit = () => {
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Same name" } });
    fireEvent.change(screen.getByLabelText(kind === "Guardrail" ? "Control intent" : "Use case"), { target: { value: "Same intent" } });
    fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));
  };
  const first = mount(); submit(); first.unmount();
  mount(); submit();
  expect(onSave).toHaveBeenCalledTimes(2);
  expect(onSave.mock.calls[0]![0]).toHaveProperty("id", expect.stringMatching(/^[a-z][a-z0-9-]{2,63}$/));
  expect(onSave.mock.calls[0]![0].id).not.toBe(onSave.mock.calls[1]![0].id);
});

it.each([ ["Guardrail", "edit"], ["Guardrail", "revise"], ["Profile", "edit"], ["Profile", "revise"] ] as const)("preserves the existing %s ID when opening %s", (kind, mode) => {
  const initial = { id: "existing-record", kind, provider: "NeMo", name: "Existing", description: "Intent", location: "ALL", mandatory: false, refs: [], attributes: { bu: "", agent: "", data: "" }, threshold: 5, version: 1 } as unknown as Entity;
  const onSave = vi.fn(async (_draft: ReturnType<typeof toDraft>) => {});
  render(<LiveForm {...props} kind={kind} mode={mode} initial={initial} onSave={onSave} />);
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Renamed" } });
  fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ id: "existing-record", name: "Renamed" }));
});
