import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import type { Role } from "@repo/db";
import { env } from "../config/env";

const jwtKey = new TextEncoder().encode(env.JWT_SECRET);

/** Stored form of refresh tokens and OTP codes — never the raw value (rules.md §6). */
export const hmac = (value: string) => createHmac("sha256", env.TOKEN_HASH_SECRET).update(value).digest("hex");

export const newRefreshToken = () => randomBytes(32).toString("base64url");

export const newOtp = () => env.OTP_DEMO_CODE ?? String(randomInt(0, 1_000_000)).padStart(6, "0");

export const safeEqual = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export type AccessClaims = { sub: string; roles: Role[]; mfa: boolean };

/** AUTH-5: 15-minute access tokens. */
export async function signAccessToken(claims: AccessClaims) {
  return new SignJWT({ roles: claims.roles, mfa: claims.mfa })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime("15m")
    .setAudience("access")
    .sign(jwtKey);
}

export async function verifyAccessToken(token: string): Promise<AccessClaims> {
  const { payload } = await jwtVerify(token, jwtKey, { audience: "access", algorithms: ["HS256"] });
  return { sub: payload.sub!, roles: (payload.roles as Role[]) ?? [], mfa: Boolean(payload.mfa) };
}

/** Step 1 of staff sign-in proves the password; this short-lived token carries that into the MFA step. */
/** `enrol` carries a new authenticator secret for staff who haven't set one up; it's saved once a code proves it. */
export async function signMfaChallenge(userId: string, enrol?: string) {
  return new SignJWT(enrol ? { enrol } : {}).setProtectedHeader({ alg: "HS256" }).setSubject(userId).setIssuedAt().setExpirationTime("10m").setAudience("mfa").sign(jwtKey);
}

export async function verifyMfaChallenge(token: string) {
  const { payload } = await jwtVerify(token, jwtKey, { audience: "mfa", algorithms: ["HS256"] });
  return { userId: payload.sub!, enrol: typeof payload.enrol === "string" ? payload.enrol : undefined };
}

/** One-time passwords handed to staff by a super admin; they choose their own at first sign-in. */
export function newTemporaryPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const pick = () => alphabet[randomInt(0, alphabet.length)];
  const body = Array.from({ length: 12 }, pick).join("");
  return `${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8)}${randomInt(2, 10)}`;
}

// ---------- TOTP (RFC 6238): SHA-1, 30-second steps, 6 digits, ±1 step of clock drift ----------

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(bytes: Buffer) {
  let bits = "";
  for (const byte of bytes) bits += byte.toString(2).padStart(8, "0");
  return (bits.match(/.{1,5}/g) ?? []).map((chunk) => BASE32[Number.parseInt(chunk.padEnd(5, "0"), 2)]).join("");
}

export const newTotpSecret = () => base32Encode(randomBytes(20));

export const otpauthUrl = (secret: string, account: string) =>
  `otpauth://totp/${encodeURIComponent(`Book The Influencers:${account}`)}?secret=${secret}&issuer=${encodeURIComponent("Book The Influencers")}&algorithm=SHA1&digits=6&period=30`;

export function base32Decode(input: string): Buffer {
  const clean = input.replace(/=+$/, "").replace(/\s/g, "").toUpperCase();
  let bits = "";
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index === -1) throw new Error("Invalid base32");
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes = bits.match(/.{8}/g) ?? [];
  return Buffer.from(bytes.map((b) => Number.parseInt(b, 2)));
}

export function totp(secretBase32: string, at = Date.now(), step = 30) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / step)));
  const digest = createHmac("sha1", base32Decode(secretBase32)).update(counter).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const code = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(code).padStart(6, "0");
}

export function verifyTotp(secretBase32: string, code: string, at = Date.now()) {
  return [-1, 0, 1].some((drift) => safeEqual(totp(secretBase32, at + drift * 30_000), code));
}
