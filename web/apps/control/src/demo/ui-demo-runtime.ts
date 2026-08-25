import type { Project } from "@/types/project";

declare const __TALI_UI_DEMO__: boolean | undefined;

export interface UiDemoAuthConfig {
  authRequired: boolean;
  developmentDefaults: boolean;
  localEnabled: boolean;
  mode: "local" | "local-sso";
  providerName: string;
  ssoEnabled: boolean;
}

export interface UiDemoAuthUser {
  displayName: string;
  email: string;
  id: string;
  provider: "local";
  systemRole: "super_administrator";
  username: string;
}

export interface UiDemoProfile extends UiDemoAuthUser {
  city: string;
  theme: "system" | "light" | "dark";
  timezone: string;
}

export interface UiDemoAgentResult {
  agentId: string;
  output: string;
  prompt: string;
  status: "completed";
  trace: string[];
}

const DEMO_TOKEN = "tali-ui-demo-admin";

const authConfig: UiDemoAuthConfig = {
  authRequired: true,
  developmentDefaults: true,
  localEnabled: true,
  mode: "local",
  providerName: "",
  ssoEnabled: false,
};

const user: UiDemoAuthUser = {
  displayName: "Local Administrator",
  email: "admin@demo.local",
  id: "demo-admin",
  provider: "local",
  systemRole: "super_administrator",
  username: "admin",
};

const project: Project = {
  id: "individual",
  memberCount: 1,
  name: "Demo Project",
  role: "admin",
  type: "personal",
};

const profile: UiDemoProfile = {
  ...user,
  city: "San Francisco",
  theme: "system",
  timezone: "America/Los_Angeles",
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

export function isUiDemoBuild(): boolean {
  return typeof __TALI_UI_DEMO__ !== "undefined" && __TALI_UI_DEMO__ === true;
}

export const uiDemoRuntime = {
  async authConfig(): Promise<UiDemoAuthConfig> {
    return clone(authConfig);
  },

  async currentUser(token: string): Promise<UiDemoAuthUser> {
    if (token !== DEMO_TOKEN) {
      throw new Error("Your session is no longer valid.");
    }
    return clone(user);
  },

  async getProfile(): Promise<UiDemoProfile> {
    return clone(profile);
  },

  async listProjects(): Promise<Project[]> {
    return [clone(project)];
  },

  async login(username: string, password: string): Promise<{ token: string }> {
    if (username !== "admin" || password !== "admin") {
      throw new Error("Sign in failed.");
    }
    return { token: DEMO_TOKEN };
  },

  async logout(): Promise<{ redirectUrl?: string }> {
    return {};
  },

  async tryAgent(agentId: string, promptText: string): Promise<UiDemoAgentResult> {
    const prompt = promptText.trim();
    if (!prompt) throw new Error("Enter a task for the demo Agent.");
    return {
      agentId,
      output:
        "The request completed using deterministic Demo data. No external system was read or changed.",
      prompt,
      status: "completed",
      trace: [
        "Validated request",
        "Applied Guardrails",
        "Ran Demo capability",
        "Recorded evidence",
      ],
    };
  },
};
