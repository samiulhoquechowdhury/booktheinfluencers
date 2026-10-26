import { z } from "zod";

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string().url().default("redis://localhost:6392"),
    /** How notifications leave the building. Only "console" exists until a vendor is chosen. */
    NOTIFY_CHANNEL: z.enum(["console"]).default("console"),
  })
  .superRefine((env, ctx) => {
    // Runbook: dev-only adapters are refused in production.
    if (env.NODE_ENV === "production" && env.NOTIFY_CHANNEL === "console") {
      ctx.addIssue({ code: "custom", path: ["NOTIFY_CHANNEL"], message: "Configure an SMS/email provider before running in production" });
    }
  });

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Invalid environment:\n${parsed.error.issues.map((i) => `  ${i.path.join(".") || "env"}: ${i.message}`).join("\n")}`);
  }
  return parsed.data;
}
