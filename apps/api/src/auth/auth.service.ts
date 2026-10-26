import { Inject, Injectable } from "@nestjs/common";
import { verifyPassword, type Role, type User } from "@repo/db";
import { INDIAN_MOBILE } from "@repo/schemas";
import { env } from "../config/env";
import { DomainError, unauthenticated } from "../common/errors";
import { PrismaService } from "../prisma/prisma.service";
import { STAFF_ROLES } from "./guard";
import {
  hmac,
  newOtp,
  newRefreshToken,
  safeEqual,
  signAccessToken,
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

export type SessionUser = { id: string; name: string; phone: string | null; email: string | null; roles: Role[]; talentSlug: string | null };
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

  /** AUTH-1/AUTH-4: customers are created on first verify. AUTH-3: talent accounts exist only by invite. */
  async verifyOtp(input: { phone: string; code: string; name?: string; as: "customer" | "talent" }): Promise<IssuedSession> {
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
    if (input.as === "talent") {
      if (!user?.roles.includes("TALENT")) {
        throw new DomainError("NOT_INVITED", "This number has no talent account. Talent accounts are created by invite.", 403);
      }
    } else if (!user) {
      user = await this.prisma.db.user.create({ data: { phone: input.phone, name: input.name?.trim() || "Guest", roles: ["CUSTOMER"] } });
    } else if (!user.roles.includes("CUSTOMER")) {
      user = await this.prisma.db.user.update({ where: { id: user.id }, data: { roles: { push: "CUSTOMER" } } });
    }
    return this.issue(user, false);
  }

  /** AUTH-2 step 1. Same error for unknown email and wrong password. */
  async staffPassword(email: string, password: string) {
    const user = await this.prisma.db.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    const ok = user?.passwordHash && user.roles.some((r) => STAFF_ROLES.includes(r)) && (await verifyPassword(password, user.passwordHash));
    if (!user || !ok) throw new DomainError("INVALID_LOGIN", "Email or password is incorrect", 401);
    return { mfaToken: await signMfaChallenge(user.id) };
  }

  /** AUTH-2 step 2: TOTP. MFA_DEMO_CODE only exists outside production (env.ts refuses it there). */
  async staffMfa(mfaToken: string, code: string): Promise<IssuedSession> {
    const userId = await verifyMfaChallenge(mfaToken).catch(() => {
      throw new DomainError("MFA_EXPIRED", "Sign-in timed out. Start again.", 401);
    });
    const user = await this.prisma.db.user.findUniqueOrThrow({ where: { id: userId } });
    const ok = (user.mfaSecret && verifyTotp(user.mfaSecret, code)) || (env.MFA_DEMO_CODE !== undefined && safeEqual(code, env.MFA_DEMO_CODE));
    if (!ok) throw new DomainError("OTP_INVALID", "That code is not right", 401);
    return this.issue(user, true);
  }

  /** AUTH-5: rotating refresh tokens; reuse of a rotated token revokes every session. */
  async refresh(refreshToken: string | undefined): Promise<IssuedSession> {
    if (!refreshToken) throw unauthenticated();
    const session = await this.prisma.db.session.findUnique({ where: { refreshTokenHash: hmac(refreshToken) }, include: { user: true } });
    if (!session || session.expiresAt < new Date()) throw unauthenticated("Your session has expired");
    if (session.revokedAt) {
      await this.prisma.db.session.updateMany({ where: { userId: session.userId, revokedAt: null }, data: { revokedAt: new Date() } });
      throw unauthenticated("Please sign in again");
    }
    await this.prisma.db.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
    const mfa = session.user.roles.some((r) => STAFF_ROLES.includes(r)) && session.mfa;
    return this.issue(session.user, mfa);
  }

  async logout(refreshToken: string | undefined) {
    if (!refreshToken) return;
    await this.prisma.db.session.updateMany({ where: { refreshTokenHash: hmac(refreshToken) }, data: { revokedAt: new Date() } });
  }

  async me(userId: string): Promise<SessionUser> {
    const user = await this.prisma.db.user.findUnique({ where: { id: userId }, include: { talent: { select: { slug: true } } } });
    if (!user || user.deletedAt) throw unauthenticated();
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
});
