/** @vitest-environment jsdom */
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { BrandMark } from "./brand-logo";

afterEach(cleanup);
it("loads the runtime asset with containment and falls back when decoding fails", () => {
  const { container } = render(<BrandMark className="size-8" />);
  const image = container.querySelector("img")!;
  expect(image.getAttribute("src")).toBe("/api/branding/logo");
  expect(image.className).toContain("object-contain");
  fireEvent.error(image);
  expect(container.querySelector("img")).toBeNull();
  expect(container.querySelector("svg")).not.toBeNull();
});
