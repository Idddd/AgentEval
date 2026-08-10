import type { ThemePreference } from "@/services/personal-profile";

const themeKey = "tasklattice.account.theme";
const timezoneKey = "tasklattice.account.timezone";
export const PREFERENCES_CHANGED_EVENT = "tasklattice:preferences-changed";

export function detectedTimezone(): string {
  if (typeof Intl === "undefined") return "UTC";
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export function getPlatformTheme(): ThemePreference {
  return "light";
}

export function getPlatformTimezone(): string {
  if (typeof window === "undefined") return "UTC";
  return window.localStorage.getItem(timezoneKey) || detectedTimezone();
}

export function applyPlatformPreferences(input: {
  theme: ThemePreference;
  timezone: string;
}): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(themeKey, "light");
  window.localStorage.setItem(timezoneKey, input.timezone);
  document.documentElement.classList.remove("dark");
  document.documentElement.style.colorScheme = "light";
  window.dispatchEvent(
    new CustomEvent(PREFERENCES_CHANGED_EVENT, {
      detail: { ...input, theme: "light" },
    }),
  );
}

export function formatPlatformDate(
  value: string | number | Date,
  options: Intl.DateTimeFormatOptions = {},
): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "–";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: getPlatformTimezone(),
    ...options,
  }).format(date);
}

export function formatPlatformDateTime(
  value: string | number | Date,
  options: Intl.DateTimeFormatOptions = {},
): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "–";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: getPlatformTimezone(),
    ...options,
  }).format(date);
}
