import type { Request } from "express";
import type { PrismaClient } from "@repo/db";
import type { LoginAudience, LoginEventKind } from "@repo/schemas";

// Sign-in history. Writing it must never block or break a sign-in, so failures are only logged.

export type RequestMeta = { ip: string | null; userAgent: string | null };

export const requestMeta = (req: Request): RequestMeta => ({
  ip: req.ip ?? null,
  userAgent: req.headers["user-agent"]?.slice(0, 300) ?? null,
});

export type LoginEntry = {
  audience: LoginAudience;
  event: LoginEventKind;
  identifier: string;
  userId?: string | null;
  userName?: string | null;
  detail?: string | null;
};

export async function recordLogin(db: PrismaClient, meta: RequestMeta, entry: LoginEntry) {
  try {
    await db.loginEvent.create({
      data: {
        audience: entry.audience,
        event: entry.event,
        identifier: entry.identifier.slice(0, 120),
        userId: entry.userId ?? null,
        userName: entry.userName ?? null,
        detail: entry.detail ?? null,
        ip: meta.ip,
        userAgent: meta.userAgent,
      },
    });
  } catch (error) {
    console.error("[login-events] could not record", error);
  }
}

/** Plain-language reasons for failed attempts, keyed by the DomainError code. */
export const FAILURE_DETAIL: Record<string, string> = {
  INVALID_LOGIN: "Wrong email or password",
  ACCOUNT_DISABLED: "Account deactivated",
  ACCOUNT_BLOCKED: "Account blocked",
  OTP_INVALID: "Wrong or expired code",
  MFA_EXPIRED: "Sign-in timed out",
  NOT_INVITED: "No artist account for this number",
  INVALID_PASSWORD: "Wrong current password",
};
