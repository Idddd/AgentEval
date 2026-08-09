import { describe, expect, it } from "vitest";

import {
  filterMultiSelectOptions,
  isMultiSelectOptionDisabled,
  type MultiSelectOption,
} from "./multi-select-options";

const options: MultiSelectOption[] = [
  { label: "Analytics", value: "analytics" },
  { label: "Code generation", meta: "Connected", metaTone: "success", value: "code-generation" },
  { label: "Artifact search", value: "artifact-search" },
];

describe("filterOptionsByPrefix", () => {
  it("lists every option for an empty query", () => {
    expect(filterMultiSelectOptions(options, "")).toEqual(options);
  });

  it("matches option labels by a case-insensitive substring", () => {
    expect(filterMultiSelectOptions(options, "  ART")).toEqual([options[2]]);
  });

  it("matches a query found in the middle of a label", () => {
    expect(filterMultiSelectOptions(options, "generation")).toEqual([options[1]]);
  });

  it("matches status labels without coupling filtering to their visual tone", () => {
    expect(filterMultiSelectOptions(options, "connected")).toEqual([options[1]]);
  });
});

describe("isMultiSelectOptionDisabled", () => {
  it("disables new selections at the configured limit", () => {
    expect(
      isMultiSelectOptionDisabled(options[2]!, ["analytics", "code-generation"], 2),
    ).toBe(true);
  });

  it("keeps selected options removable at the configured limit", () => {
    expect(
      isMultiSelectOptionDisabled(options[0]!, ["analytics", "code-generation"], 2),
    ).toBe(false);
  });

  it("keeps a selected disabled option removable", () => {
    const draft = { disabled: true, label: "Draft policy", value: "draft" };
    expect(isMultiSelectOptionDisabled(draft, ["draft"], 64)).toBe(false);
    expect(isMultiSelectOptionDisabled(draft, [], 64)).toBe(true);
  });
});
