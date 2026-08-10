/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from "vitest";
import {
  applyPlatformPreferences,
  getPlatformTheme,
} from "./platform-preferences";

describe("platform theme", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.className = "dark";
    document.documentElement.style.colorScheme = "dark";
  });

  it("always applies and stores the light theme", () => {
    applyPlatformPreferences({ theme: "dark", timezone: "UTC" });

    expect(getPlatformTheme()).toBe("light");
    expect(window.localStorage.getItem("tasklattice.account.theme")).toBe(
      "light",
    );
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.documentElement.style.colorScheme).toBe("light");
  });
});
