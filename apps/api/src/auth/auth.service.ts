import { randomBytes } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { hashPassword, verifyPassword, type Role, type User } from "@repo/db";
import { INDIAN_MOBILE } from "@repo/schemas";
import { env } from "../config/env";
import { DomainError, unauthenticated } from "../common/errors";
import { PrismaService } from "../prisma/prisma.service";
import { STAFF_ROLES } from "./guard";
import { FAILURE_DETAIL, recordLogin, type RequestMeta } from "./login-events";
import {
  hmac,
  newOtp,
  newRefreshToken,
  safeEqual,
  signAccessToken,
  newTotpSecret,
  otpauthUrl,
  signMfaChallenge,
  verifyMfaChallenge,
  verifyTotp,
} from "./crypto";

const OTP_TTL_MS = 5 * 60_000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_SENDS_PER_WINDOW = 3;
const OTP_WINDOW_MS = 10 * 60_000;
const OTP_RESEND_GAP_MS = 30_000;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60_000;

export type SessionUser = { id: string; name: string; phone: string | null; email: string | null; roles: Role[]; talentSlug: string | null; mustChangePassword: boolean };
export type IssuedSession = { accessToken: string; refreshToken: string; user: SessionUser };

@Injectable()
export class AuthService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** AUTH-1 + rate limits (OTP 3/10 min per phone, 30 s resend). */
  async sendOtp(phone: string) {
    if (!INDIAN_MOBILE.test(phone)) throw new DomainError("VALIDATION", "Enter a 10-digit Indian mobile number");
    const recent = await this.prisma.db.otpCode.findMany({
      where: { phone, createdAt: { gt: new Date(Date.now() - OTP_WINDOW_MS) } },
      orderBy: { createdAt: "desc" },
    });
    if (recent[0] && Date.now() - recent[0].createdAt.getTime() < OTP_RESEND_GAP_MS) {
      throw new DomainError("RATE_LIMITED", "Please wait a few seconds before asking for a new code", 429);
    }
    if (recent.length >= OTP_SENDS_PER_WINDOW) {
      throw new DomainError("RATE_LIMITED", "Too many codes requested. Try again in 10 minutes.", 429);
    }
    const code = newOtp();
    await this.prisma.db.otpCode.create({ data: { phone, codeHash: hmac(`${phone}:${code}`), expiresAt: new Date(Date.now() + OTP_TTL_MS) } });
    // SMS adapter goes here once a vendor is chosen; the console stands in outside production.
    if (env.NODE_ENV !== "production") console.info(`[otp] ${phone} → ${code}`);
    return { sentTo: phone, resendInSeconds: OTP_RESEND_GAP_MS / 1000 };
  }

  /** AUTH-1/AUTH-4: customers and artists are created on first verify. Blocked or deactivated accounts can't sign in. */
  async verifyOtp(input: { phone: string; code: string; name?: string; as: "customer" | "talent" }, meta: RequestMeta): Promise<IssuedSession> {
    try {
      const { session, created } = await this.verifyOtpInner(input);
      await recordLogin(this.prisma.db, meta, { audience: input.as, event: "sign_in", identifier: input.phone, userId: session.user.id, userName: session.user.name, detail: created ? "New account" : null });
      return session;
    } catch (error) {
      if (error instanceof DomainError) {
        const known = await this.prisma.db.user.findUnique({ where: { phone: input.phone }, select: { id: true, name: true } });
        await recordLogin(this.prisma.db, meta, { audience: input.as, event: "sign_in_failed", identifier: input.phone, userId: known?.id, userName: known?.name, detail: FAILURE_DETAIL[error.code] ?? error.message });
      }
      throw error;
    }
  }

  private async verifyOtpInner(input: { phone: string; code: string; name?: string; as: "customer" | "talent" }) {
    let created = false;
    const otp = await this.prisma.db.otpCode.findFirst({
      where: { phone: input.phone, usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
    if (!otp || otp.attempts >= OTP_MAX_ATTEMPTS) throw new DomainError("OTP_INVALID", "That code has expired. Ask for a new one.");
    if (!safeEqual(otp.codeHash, hmac(`${input.phone}:${input.code}`))) {
      await this.prisma.db.otpCode.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
      throw new DomainError("OTP_INVALID", "That code is not right. Try again.");
    }
    await this.prisma.db.otpCode.update({ where: { id: otp.id }, data: { usedAt: new Date() } });

    let user = await this.prisma.db.user.findUnique({ where: { phone: input.phone } });
    // Checked after the code, so only the owner of the number learns the account is restricted.
    if (user?.disabledAt) {
      if (user.disabledKind === "BLOCKED") throw new DomainError("ACCOUNT_BLOCKED", "This account has been blocked. Contact us if you think this is a mistake.", 403);
      throw new DomainError("ACCOUNT_DISABLED", "This account has been deactivated. Contact us to restore it.", 403);
    }
    if (input.as === "talent") {
      // Anyone can join as an artist: they get a private draft to complete, and nothing shows publicly until a
      // talent manager approves it (CRM → Verifications).
      if (!user) {
        user = await this.prisma.db.user.create({ data: { phone: input.phone, name: input.name?.trim() || "New artist", roles: ["TALENT"] } });
        created = true;
      } else if (!user.roles.includes("TALENT")) {
        user = await this.prisma.db.user.update({ where: { id: user.id }, data: { roles: { push: "TALENT" } } });
      }
      await this.ensureTalentDraft(user);
    } else if (!user) {
      user = await this.prisma.db.user.create({ data: { phone: input.phone, name: input.name?.trim() || "Guest", roles: ["CUSTOMER"] } });
      created = true;
    } else if (!user.roles.includes("CUSTOMER")) {
      user = await this.prisma.db.user.update({ where: { id: user.id }, data: { roles: { push: "CUSTOMER" } } });
    }
    await this.prisma.db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return { session: await this.issue(user, false), created };
  }

  /** A private profile to fill in. The temporary slug is replaced by the stage name on submit. */
  private async ensureTalentDraft(user: User) {
    const existing = await this.prisma.db.talent.findUnique({ where: { userId: user.id }, select: { id: true } });
    if (existing) return;
    await this.prisma.db.talent.create({
      data: {
        userId: user.id,
        slug: `artist-${randomBytes(5).toString("hex")}`,
        stageName: user.name === "New artist" ? "" : user.name,
        headline: "",
        bio: "",
        baseCity: "",
        photoUrl: "",
        representationType: "TALENT_MANAGED",
        status: "DRAFT",
        reviewStatus: "INCOMPLETE",
      },
    });
  }

  /**
   * AUTH-2 step 1. Same error for unknown email and wrong password. Staff without an authenticator
   * get a fresh secret to add to their app; it's saved only once a code from it is verified.
   */
  async staffPassword(email: string, password: string, meta: RequestMeta) {
    const user = await this.prisma.db.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    const ok = user?.passwordHash && user.roles.some((r) => STAFF_ROLES.includes(r)) && (await verifyPassword(password, user.passwordHash));
    const fail = async (code: string) =>
      recordLogin(this.prisma.db, meta, { audience: "staff", event: "sign_in_failed", identifier: email.trim().toLowerCase(), userId: user?.id, userName: user?.name, detail: FAILURE_DETAIL[code] });
    if (!user || !ok) {
      await fail("INVALID_LOGIN");
      throw new DomainError("INVALID_LOGIN", "Email or password is incorrect", 401);
    }
    if (user.disabledAt) {
      await fail("ACCOUNT_DISABLED");
      throw new DomainError("ACCOUNT_DISABLED", "This account has been deactivated. Ask a super admin to restore it.", 403);
    }
    if (user.mfaSecret) return { mfaToken: await signMfaChallenge(user.id) };
    const secret = newTotpSecret();
    return { mfaToken: await signMfaChallenge(user.id, secret), setup: { secret, uri: otpauthUrl(secret, user.email!) } };
  }

  /** AUTH-2 step 2: TOTP. MFA_DEMO_CODE only exists outside production (env.ts refuses it there). */
  async staffMfa(mfaToken: string, code: string, meta: RequestMeta): Promise<IssuedSession> {
    const challenge = await verifyMfaChallenge(mfaToken).catch(() => null);
    if (!challenge) {
      await recordLogin(this.prisma.db, meta, { audience: "staff", event: "sign_in_failed", identifier: "unknown", detail: FAILURE_DETAIL.MFA_EXPIRED });
      throw new DomainError("MFA_EXPIRED", "Sign-in timed out. Start again.", 401);
    }
    const { userId, enrol } = challenge;
    const user = await this.prisma.db.user.findUniqueOrThrow({ where: { id: userId } });
    const who = { audience: "staff" as const, identifier: user.email ?? user.id, userId: user.id, userName: user.name };
    if (user.disabledAt) {
      await recordLogin(this.prisma.db, meta, { ...who, event: "sign_in_failed", detail: FAILURE_DETAIL.ACCOUNT_DISABLED });
      throw new DomainError("ACCOUNT_DISABLED", "This account has been deactivated. Ask a super admin to restore it.", 403);
    }
    const secret = user.mfaSecret ?? enrol;
    const enrolled = Boolean(secret && verifyTotp(secret, code));
    const ok = enrolled || (env.MFA_DEMO_CODE !== undefined && safeEqual(code, env.MFA_DEMO_CODE));
    if (!ok) {
      await recordLogin(this.prisma.db, meta, { ...who, event: "sign_in_failed", detail: "Wrong authenticator code" });
      throw new DomainError("OTP_INVALID", "That code is not right", 401);
    }
    const setUp = !user.mfaSecret && Boolean(enrol) && enrolled;
    await recordLogin(this.prisma.db, meta, { ...who, event: "sign_in", detail: setUp ? "Authenticator set up" : user.mustChangePassword ? "Temporary password" : null });
    await this.prisma.db.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), ...(!user.mfaSecret && enrol && enrolled && { mfaSecret: enrol }) },
    });
    return this.issue(user, true);
  }

  /** Staff choose their own password (required after a temporary one). Other sessions are signed out. */
  async changeStaffPassword(userId: string, current: string, next: string, meta: RequestMeta) {
    const user = await this.prisma.db.user.findUnique({ where: { id: userId } });
    if (!user?.passwordHash || !(await verifyPassword(current, user.passwordHash))) throw new DomainError("INVALID_PASSWORD", "Your current password is not right", 400);
    if (current === next) throw new DomainError("VALIDATION", "Choose a password you haven't used here");
    await this.prisma.db.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(next), mustChangePassword: false } });
    await recordLogin(this.prisma.db, meta, { audience: "staff", event: "password_changed", identifier: user.email ?? user.id, userId, userName: user.name, detail: user.mustChangePassword ? "Replaced temporary password" : null });
  }

  /** AUTH-5: rotating refresh tokens; reuse of a rotated token revokes every session. */
  async refresh(refreshToken: string | undefined): Promise<IssuedSession> {
    if (!refreshToken) throw unauthenticated();
    const session = await this.prisma.db.session.findUnique({ where: { refreshTokenHash: hmac(refreshToken) }, include: { user: true } });
    if (!session || session.expiresAt < new Date()) throw unauthenticated("Your session has expired");
    if (session.user.disabledAt) throw unauthenticated("This account has been deactivated");
    if (session.revokedAt) {
      await this.prisma.db.session.updateMany({ where: { userId: session.userId, revokedAt: null }, data: { revokedAt: new Date() } });
      throw unauthenticated("Please sign in again");
    }
    await this.prisma.db.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
    const mfa = session.user.roles.some((r) => STAFF_ROLES.includes(r)) && session.mfa;
    return this.issue(session.user, mfa);
  }

  async logout(refreshToken: string | undefined, meta: RequestMeta, audience: "staff" | "customer") {
    if (!refreshToken) return;
    const session = await this.prisma.db.session.findUnique({ where: { refreshTokenHash: hmac(refreshToken) }, include: { user: true } });
    await this.prisma.db.session.updateMany({ where: { refreshTokenHash: hmac(refreshToken) }, data: { revokedAt: new Date() } });
    if (!session || session.revokedAt) return;
    const kind = audience === "staff" ? "staff" : session.user.roles.includes("TALENT") && !session.user.roles.includes("CUSTOMER") ? "talent" : "customer";
    await recordLogin(this.prisma.db, meta, { audience: kind, event: "sign_out", identifier: (audience === "staff" ? session.user.email : session.user.phone) ?? session.user.id, userId: session.user.id, userName: session.user.name });
  }

  async me(userId: string): Promise<SessionUser> {
    const user = await this.prisma.db.user.findUnique({ where: { id: userId }, include: { talent: { select: { slug: true } } } });
    if (!user || user.deletedAt || user.disabledAt) throw unauthenticated();
    return toSessionUser(user, user.talent?.slug ?? null);
  }

  async updateProfile(userId: string, input: { name: string; email: string }) {
    const name = input.name.trim();
    if (name.length < 2) throw new DomainError("VALIDATION", "Enter your name");
    const email = input.email.trim().toLowerCase() || null;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new DomainError("VALIDATION", "Enter a valid email");
    await this.prisma.db.user.update({ where: { id: userId }, data: { name, email } });
    return this.me(userId);
  }

  private async issue(user: User, mfa: boolean): Promise<IssuedSession> {
    const refreshToken = newRefreshToken();
    await this.prisma.db.session.create({
      data: { userId: user.id, refreshTokenHash: hmac(refreshToken), mfa, expiresAt: new Date(Date.now() + REFRESH_TTL_MS) },
    });
    const talent = await this.prisma.db.talent.findUnique({ where: { userId: user.id }, select: { slug: true } });
    return { accessToken: await signAccessToken({ sub: user.id, roles: user.roles, mfa }), refreshToken, user: toSessionUser(user, talent?.slug ?? null) };
  }
}

const toSessionUser = (user: User, talentSlug: string | null): SessionUser => ({
  id: user.id,
  name: user.name,
  phone: user.phone,
  email: user.email,
  roles: user.roles,
  talentSlug,
  mustChangePassword: user.mustChangePassword,
});
