import { getAuthToken } from "@/lib/auth-token";

export interface PersonalProfile {
  city: string;
  displayName: string;
  email: string;
  provider: "local" | "sso";
  systemRole: "user" | "super_administrator";
  theme: ThemePreference;
  timezone: string;
  username: string;
}

export type ThemePreference = "system" | "light" | "dark";

export const personalProfileQueryKey = ["personal-profile"] as const;

async function profileRequest<T = PersonalProfile>(
  path = "/api/v1/profile",
  init?: RequestInit,
): Promise<T> {
  const token = getAuthToken();
  const response = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  const text = await response.text();
  const payload = (text ? JSON.parse(text) : undefined) as T & {
    error?: string;
    message?: string;
  };
  if (!response.ok) {
    throw new Error(
      payload.message ?? payload.error ?? `Request failed (${response.status}).`,
    );
  }
  return payload as T;
}

export function getPersonalProfile(): Promise<PersonalProfile> {
  return profileRequest();
}

export function updatePersonalProfile(input: {
  city: string;
  theme: ThemePreference;
  timezone: string;
}): Promise<PersonalProfile> {
  return profileRequest("/api/v1/profile", {
    body: JSON.stringify(input),
    method: "PATCH",
  });
}

export async function resetLocalPassword(input: {
  currentPassword: string;
  newPassword: string;
}): Promise<void> {
  await profileRequest<void>("/api/v1/profile/password", {
    body: JSON.stringify(input),
    method: "POST",
  });
}
