/** @vitest-environment jsdom */
import {
  cleanup,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CreateResourceDialog } from "./create-dialog";
import { createMarketplaceApi } from "./api";
import { MarketplaceProvider } from "./provider";
import { createFixtures } from "./fixtures";
import type {
  MarketplaceApi,
  MarketplaceResource,
  ResourceKind,
} from "./contracts";

afterEach(cleanup);
function renderForm(
  kind: ResourceKind,
  options: { template?: MarketplaceResource; api?: MarketplaceApi } = {},
) {
  const onCreated = vi.fn();
  const onClose = vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MarketplaceProvider client={options.api ?? createMarketplaceApi()}>
        <CreateResourceDialog
          kind={kind}
          {...(options.template ? { template: options.template } : {})}
          onCreated={onCreated}
          onClose={onClose}
        />
      </MarketplaceProvider>
    </QueryClientProvider>,
  );
  return {
    onCreated,
    onClose,
    user: userEvent.setup(),
    dialog: within(screen.getByRole("dialog")),
  };
}
describe("Business creation workflow", () => {
  it("creates a reusable template using business intent and normalizes blank topic lines", async () => {
    const { user, dialog, onCreated } = renderForm("templates");
    await user.type(
      dialog.getByRole("textbox", { name: "Template name *" }),
      " Support essentials ",
    );
    await user.type(
      dialog.getByRole("textbox", { name: "Business purpose *" }),
      " Keep customers safe. ",
    );
    await user.click(dialog.getByText("Business boundaries"));
    await user.type(
      dialog.getByRole("textbox", { name: /Topics your AI can help with/ }),
      "Orders\n\nReturns\n",
    );
    await user.click(dialog.getByRole("button", { name: "Create template" }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(onCreated.mock.calls[0]![0]).toMatchObject({
      source: "mock",
      data: {
        kind: "templates",
        name: "Support essentials",
        description: "Keep customers safe.",
        status: "available",
        allowedTopics: ["Orders", "Returns"],
      },
    });
  });

  it("creates from a template without changing the original template", async () => {
    const template = createFixtures().find(
      (item) => item.id === "template-customer-care",
    )!;
    const before = structuredClone(template);
    const { user, dialog, onCreated } = renderForm("guardrails", { template });
    expect(
      (
        dialog.getByRole("textbox", {
          name: "Guardrail Profile name *",
        }) as HTMLInputElement
      ).value,
    ).toBe("Customer care guardrail");
    await user.click(dialog.getByRole("checkbox", { name: /^User messages/ }));
    await user.click(dialog.getByRole("button", { name: "Create guardrail" }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(onCreated.mock.calls[0]![0].data).toMatchObject({
      templateId: template.id,
      status: "draft",
      checkpoints: ["output"],
      protections: template.protections,
    });
    expect(template).toEqual(before);
  });

  it("requires a protection and keeps form values after an uncertain live result", async () => {
    const api = createMarketplaceApi();
    const create = vi
      .fn()
      .mockRejectedValue(new Error("Could not confirm creation."));
    const { user, dialog, onCreated } = renderForm("guardrails", {
      api: { ...api, create },
    });
    await user.type(
      dialog.getByRole("textbox", { name: "Guardrail Profile name *" }),
      "My guardrail",
    );
    await user.type(
      dialog.getByRole("textbox", { name: "Business purpose *" }),
      "Help employees.",
    );
    for (const checkbox of dialog.getAllByRole("checkbox").slice(0, 6))
      if ((checkbox as HTMLInputElement).checked) await user.click(checkbox);
    await user.click(dialog.getByRole("button", { name: "Create guardrail" }));
    expect(dialog.getByRole("alert").textContent).toContain(
      "Choose at least one protection",
    );
    expect(create).not.toHaveBeenCalled();
    await user.click(
      dialog.getByRole("checkbox", { name: /^Personal information/ }),
    );
    await user.click(dialog.getByRole("button", { name: "Create guardrail" }));
    await waitFor(() =>
      expect(dialog.getByRole("alert").textContent).toContain(
        "Could not confirm creation",
      ),
    );
    expect(
      (
        dialog.getByRole("textbox", {
          name: "Guardrail Profile name *",
        }) as HTMLInputElement
      ).value,
    ).toBe("My guardrail");
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("cancels without creating an item", async () => {
    const { user, dialog, onCreated, onClose } = renderForm("templates");
    await user.click(dialog.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onCreated).not.toHaveBeenCalled();
  });
});
