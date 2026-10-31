import { z } from "zod";

const DEV_SECRET = "dev-only-secret-change-me-0123456789abcdef";
const DEV_DOCUMENT_KEY = "ZGV2LW9ubHktaWQta2V5LW5vdC1mb3ItcHJvZC11c2U=";
const DEV_SETTINGS_KEY = "ZGV2LW9ubHktc2V0dGluZ3Mta2V5LW5vdC1wcm9kISE=";

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(4100), // 4000 clashes with another local project
    DATABASE_URL: z.string().url(),
    /** Signs 15-minute access tokens and the staff MFA challenge. */
    JWT_SECRET: z.string().min(32).default(DEV_SECRET),
    /** HMAC key for refresh tokens and OTP codes at rest. */
    TOKEN_HASH_SECRET: z.string().min(32).default(DEV_SECRET),
    /** Shared secret the payment gateway / e-sign provider sign webhooks with. */
    WEBHOOK_SECRET: z.string().min(16).default(DEV_SECRET),
    /** 32 random bytes, base64 (`openssl rand -base64 32`). Encrypts ID documents. Losing it loses every stored ID. */
    ID_DOCUMENT_KEY: z
      .string()
      .default(DEV_DOCUMENT_KEY)
      .refine((v) => Buffer.from(v, "base64").length === 32, "Must be 32 bytes, base64 encoded"),
    /** 32 random bytes, base64. Encrypts API keys saved in the CRM. Losing it only means saving them again. */
    SETTINGS_KEY: z
      .string()
      .default(DEV_SETTINGS_KEY)
      .refine((v) => Buffer.from(v, "base64").length === 32, "Must be 32 bytes, base64 encoded"),
    /** Grok's API. Only changed in tests. */
    XAI_BASE_URL: z.string().url().default("https://api.x.ai/v1"),
    /** Comma-separated browser origins allowed by CORS. */
    CORS_ORIGINS: z.string().default("http://localhost:3000,http://localhost:3001"),
    /** Demo shortcuts — never in production (docs/runbook.md). */
    OTP_DEMO_CODE: z.string().regex(/^\d{6}$/).optional(),
    MFA_DEMO_CODE: z.string().regex(/^\d{6}$/).optional(),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== "production") return;
    if (env.OTP_DEMO_CODE || env.MFA_DEMO_CODE) {
      ctx.addIssue({ code: "custom", message: "Demo OTP/MFA codes are not allowed in production" });
    }
    for (const key of ["JWT_SECRET", "TOKEN_HASH_SECRET", "WEBHOOK_SECRET"] as const) {
      if (env[key] === DEV_SECRET) ctx.addIssue({ code: "custom", path: [key], message: `${key} must be set in production` });
    }
    if (env.ID_DOCUMENT_KEY === DEV_DOCUMENT_KEY) ctx.addIssue({ code: "custom", path: ["ID_DOCUMENT_KEY"], message: "ID_DOCUMENT_KEY must be set in production" });
    if (env.SETTINGS_KEY === DEV_SETTINGS_KEY) ctx.addIssue({ code: "custom", path: ["SETTINGS_KEY"], message: "SETTINGS_KEY must be set in production" });
  });

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join(".") || "env"}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment:\n${issues}`);
  }
  return parsed.data;
}

export const env: Env = loadEnv();
