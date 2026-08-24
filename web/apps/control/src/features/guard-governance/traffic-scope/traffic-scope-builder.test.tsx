/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { useState } from "react";
import type {
  TrafficScopeExpression,
  TrafficScopeFieldDefinition,
} from "../model";
import { TrafficScopeBuilder } from "./traffic-scope-builder";

const definitions: TrafficScopeFieldDefinition[] = [
  {
    id: "environment",
    group: "request",
    source: "field",
    key: "environment",
    operators: ["equals", "glob"],
    values: ["production", "staging"],
  },
  {
    id: "http_path",
    group: "http",
    source: "field",
    key: "path",
    operators: ["equals", "starts_with", "glob"],
    values: [],
  },
  {
    id: "auth_jwt_claim",
    group: "authentication",
    source: "jwt_claim",
    key: "",
    operators: ["equals", "contains"],
    values: [],
    customKey: true,
  },
];

function Harness() {
  const [value, setValue] = useState<TrafficScopeExpression>({
    combinator: "and",
    rules: [
      { field: "environment", operator: "equals", value: "production" },
    ],
  });
  return (
    <>
      <TrafficScopeBuilder definitions={definitions} value={value} onChange={setValue} />
      <output>{JSON.stringify(value)}</output>
    </>
  );
}

afterEach(cleanup);

describe("TrafficScopeBuilder", () => {
  it("emits complete expressions while rules and combinator change", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.selectOptions(screen.getByLabelText("Rule 1 field"), "http_path");
    await user.selectOptions(
      screen.getByLabelText("Rule 1 operator"),
      "starts_with",
    );
    await user.clear(screen.getByLabelText("Rule 1 value"));
    await user.type(screen.getByLabelText("Rule 1 value"), "/support");
    await user.click(screen.getByRole("button", { name: "Add rule" }));
    await user.click(screen.getByRole("button", { name: "Match any rule" }));

    expect(screen.getByText(/"combinator":"or"/).textContent).toBe(
      '{"combinator":"or","rules":[{"field":"http_path","operator":"starts_with","value":"/support"},{"field":"environment","operator":"equals","value":""}]}',
    );

    await user.click(screen.getByRole("button", { name: "Remove rule 2" }));
    expect(screen.queryByLabelText("Rule 2 value")).toBeNull();
  });

  it("does not allow the final rule to be removed", () => {
    render(<Harness />);
    expect(
      (screen.getByRole("button", {
        name: "Remove rule 1",
      }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("adds nested groups and custom JWT claim keys", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "Add group" }));
    await user.selectOptions(screen.getByLabelText("Group 2 rule 1 field"), "auth_jwt_claim");
    await user.type(screen.getByLabelText("Group 2 rule 1 key"), "department");
    await user.type(screen.getByLabelText("Group 2 rule 1 value"), "finance");
    await user.click(screen.getByRole("button", { name: "Group 2 match any rule" }));

    expect(screen.getByText(/"key":"department"/)).not.toBeNull();
    expect(screen.getByText(/"combinator":"or","rules":\[\{"field":"auth_jwt_claim"/)).not.toBeNull();
  });
});
