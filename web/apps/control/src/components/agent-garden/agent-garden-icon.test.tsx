/** @vitest-environment jsdom */
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AgentGardenIcon } from "./agent-garden-icon";

describe("AgentGardenIcon", () => {
  it("gives the onboarding user-plus icon a prominent accent", () => {
    const { container } = render(
      <AgentGardenIcon type="custom" catalogIcon="user-plus" />,
    );

    expect(container.firstElementChild?.className).toContain("bg-cyan");
    expect(container.querySelector("svg")?.className.baseVal).toContain(
      "text-cyan",
    );
  });
});
