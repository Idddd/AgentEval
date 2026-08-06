import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "smol-toml";
import { z } from "zod";

const enabledOidcSchema = z.object({
  enabled: z.literal(true),
  display_name: z.string().trim().min(1).default("SSO"),
  issuer: z.string().url(),
  client_id: z.string().trim().min(1),
  client_secret: z.string().default(""),
});

const disabledOidcSchema = z.object({
  enabled: z.literal(false),
  display_name: z.string().trim().min(1).default("SSO"),
  issuer: z.string().default(""),
  client_id: z.string().default(""),
  client_secret: z.string().default(""),
});

const disabledSmtpConfig = {
  enabled: false as const,
  host: "",
  port: 587,
  secure: false,
  username: "",
  password: "",
  from_address: "",
  from_name: "TaskLattice",
  reply_to: "",
};

const smtpConfigSchema = z.object({
  enabled: z.boolean(),
  host: z.string().trim(),
  port: z.number().int().min(1).max(65_535),
  secure: z.boolean(),
  username: z.string(),
  password: z.string(),
  from_address: z.string().trim(),
  from_name: z.string().trim().min(1),
  reply_to: z.string().trim(),
}).superRefine((value, context) => {
  if (!value.enabled) return;
  if (!value.host) {
    context.addIssue({
      code: "custom",
      path: ["host"],
      message: "smtp.host is required when SMTP invitations are enabled.",
    });
  }
  if (!z.email().safeParse(value.from_address).success) {
    context.addIssue({
      code: "custom",
      path: ["from_address"],
      message: "smtp.from_address must be a valid email address.",
    });
  }
  if (value.reply_to && !z.email().safeParse(value.reply_to).success) {
    context.addIssue({
      code: "custom",
      path: ["reply_to"],
      message: "smtp.reply_to must be a valid email address when configured.",
    });
  }
  if (Boolean(value.username) !== Boolean(value.password)) {
    context.addIssue({
      code: "custom",
      path: [value.username ? "password" : "username"],
      message: "smtp.username and smtp.password must be configured together.",
    });
  }
});

const controlConfigSchema = z.object({
  schema_version: z.literal(1),
  server: z.object({
    public_url: z.string().url().optional(),
    internal_url: z.string().url().optional(),
  }),
  database: z.object({
    url: z.string().trim().min(1),
  }),
  auth: z.object({
    session_signing_key: z.string().min(24),
    local: z.object({
      enabled: z.boolean(),
      initial_super_admin_username: z.string().trim().min(1).optional(),
      initial_super_admin_password_hash: z.string().trim().min(1).optional(),
    }).superRefine((value, context) => {
      const usernameConfigured = Boolean(value.initial_super_admin_username);
      const passwordConfigured = Boolean(value.initial_super_admin_password_hash);
      if (usernameConfigured !== passwordConfigured) {
        context.addIssue({
          code: "custom",
          message:
            "initial_super_admin_username and initial_super_admin_password_hash must be configured together.",
        });
      }
      if (
        value.initial_super_admin_password_hash &&
        !/^\$2[aby]\$\d{2}\$/.test(value.initial_super_admin_password_hash)
      ) {
        context.addIssue({
          code: "custom",
          path: ["initial_super_admin_password_hash"],
          message: "The initial Super Administrator password must be a bcrypt hash.",
        });
      }
    }),
    oidc: z.discriminatedUnion("enabled", [
      enabledOidcSchema,
      disabledOidcSchema,
    ]),
  }).superRefine((value, context) => {
    if (!value.local.enabled && !value.oidc.enabled) {
      context.addIssue({
        code: "custom",
        message: "At least one authentication provider must be enabled.",
      });
    }
  }),
  runner: z.object({
    url: z.string().url(),
    token: z.string().min(1),
  }),
  litellm: z.object({
    url: z.string().url(),
    master_key: z.string(),
  }),
  smtp: smtpConfigSchema.default(disabledSmtpConfig),
}).superRefine((value, context) => {
  if (value.auth.oidc.enabled && !value.server.public_url) {
    context.addIssue({
      code: "custom",
      path: ["server", "public_url"],
      message: "server.public_url is required when OIDC authentication is enabled.",
    });
  }
  if (value.smtp.enabled && !value.server.public_url) {
    context.addIssue({
      code: "custom",
      path: ["server", "public_url"],
      message: "server.public_url is required when SMTP invitations are enabled.",
    });
  }
});

export type ControlConfig = z.infer<typeof controlConfigSchema>;

declare global {
  var tasklatticeControlConfig: ControlConfig | undefined;
}

const developmentConfig: ControlConfig = {
  schema_version: 1,
  server: {
    public_url: "http://127.0.0.1:8080",
  },
  database: {
    url: "postgresql://tasklattice:development@127.0.0.1:5432/tasklattice",
  },
  auth: {
    session_signing_key: "tasklattice-local-development-secret",
    local: {
      enabled: true,
      initial_super_admin_username: "admin",
      initial_super_admin_password_hash:
        "$2b$12$Zx2mCLJZ0n/iY4Tq.Z3eXu0O.z5SHM.pKJyNNurKX/Z7CD5HHOg.e",
    },
    oidc: {
      enabled: false,
      display_name: "SSO",
      issuer: "",
      client_id: "",
      client_secret: "",
    },
  },
  runner: {
    url: "http://127.0.0.1:9090",
    token: "local-dev-token",
  },
  litellm: {
    url: "http://127.0.0.1:4000",
    master_key: "",
  },
  smtp: disabledSmtpConfig,
};

export function getControlConfig(): ControlConfig {
  if (globalThis.tasklatticeControlConfig) {
    return globalThis.tasklatticeControlConfig;
  }
  const configuredPath = process.env.TASKLATTICE_CONFIG;
  if (!configuredPath) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "TASKLATTICE_CONFIG must point to the Control Plane TOML file in production.",
      );
    }
    globalThis.tasklatticeControlConfig = developmentConfig;
    return developmentConfig;
  }
  const path = resolve(configuredPath);
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (error) {
    throw new Error(
      `Unable to read TaskLattice configuration at ${path}: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
  }
  const result = controlConfigSchema.safeParse(parse(raw));
  if (!result.success) {
    throw new Error(
      `Invalid TaskLattice configuration at ${path}: ${z.prettifyError(result.error)}`,
    );
  }
  globalThis.tasklatticeControlConfig = result.data;
  return result.data;
}

export function setControlConfigForTests(
  config: ControlConfig | undefined,
): void {
  globalThis.tasklatticeControlConfig = config;
}

export function developmentControlConfig(): ControlConfig {
  return structuredClone(developmentConfig);
}
