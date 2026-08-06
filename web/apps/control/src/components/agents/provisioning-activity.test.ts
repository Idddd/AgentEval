import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProvisioningActivity } from "./provisioning-activity";

describe("ProvisioningActivity", () => {
  it("shows the creation log when the user opens the provisioning detail", () => {
    const markup = renderToStaticMarkup(createElement(ProvisioningActivity, {
      status: "PROVISIONING",
      stage: "POD",
      logs: ["Sandbox accepted.", "Pod is starting."],
    }));

    expect(markup).toContain("58%");
    expect(markup).toContain("Initialization log");
    expect(markup).toContain("Pod is starting.");
    expect(markup).not.toContain("Provisioning milestones");
  });

  it("shows the failure summary together with its creation log", () => {
    const markup = renderToStaticMarkup(createElement(ProvisioningActivity, {
      status: "FAILED",
      stage: "RUNTIME",
      error: "Runtime startup failed.",
      logs: ["Sensitive diagnostic detail"],
    }));

    expect(markup).toContain("Provisioning failed");
    expect(markup).toContain("Runtime startup failed.");
    expect(markup).toContain("Sensitive diagnostic detail");
  });
});
