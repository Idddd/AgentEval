/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { EvaluationStepper } from "./evaluation-stepper";

it("allows completed stages and blocks future stages", async () => {
  const onStageChange = vi.fn();
  render(
    <EvaluationStepper
      active="report"
      stages={[
        { id: "setup", enabled: true, complete: true },
        { id: "evaluate", enabled: true, complete: true },
        { id: "report", enabled: true, complete: false },
        { id: "reflect", enabled: false, complete: false },
        { id: "complete", enabled: false, complete: false },
      ]}
      onStageChange={onStageChange}
    />,
  );
  await userEvent.click(screen.getByRole("button", { name: "Evaluate" }));
  expect(onStageChange).toHaveBeenCalledWith("evaluate");
  expect(screen.getByRole("button", { name: "Reflect" })).toHaveProperty(
    "disabled",
    true,
  );
});
