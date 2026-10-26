import { Body, Controller, Get, HttpCode, Inject, Patch, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { z } from "zod";
import { INDIAN_MOBILE } from "@repo/schemas";
import { env } from "../config/env";
import { parse } from "../common/validate";
import { AuthService, type IssuedSession } from "./auth.service";
import { CurrentUser, Public, type AuthUser } from "./guard";

const REFRESH_COOKIE = "refresh_token";

const Phone = z.object({ phone: z.string().regex(INDIAN_MOBILE, "Enter a 10-digit Indian mobile number") });
const Verify = Phone.extend({
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code"),
  name: z.string().trim().max(80).optional(),
  as: z.enum(["customer", "talent"]).default("customer"),
});
const StaffLogin = z.object({ email: z.string().email(), password: z.string().min(1).max(200) });
const StaffMfa = z.object({ mfaToken: z.string().min(10), code: z.string().regex(/^\d{6}$/) });
const Profile = z.object({ name: z.string(), email: z.string().max(200).default("") });

@Controller("auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Public()
  @Post("otp/send")
  @HttpCode(200)
  sendOtp(@Body() body: unknown) {
    return this.auth.sendOtp(parse(Phone, body).phone);
  }

  @Public()
  @Post("otp/verify")
  @HttpCode(200)
  async verifyOtp(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    return this.respond(res, await this.auth.verifyOtp(parse(Verify, body)));
  }

  @Public()
  @Post("staff/login")
  @HttpCode(200)
  staffLogin(@Body() body: unknown) {
    const { email, password } = parse(StaffLogin, body);
    return this.auth.staffPassword(email, password);
  }

  @Public()
  @Post("staff/mfa")
  @HttpCode(200)
  async staffMfa(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const { mfaToken, code } = parse(StaffMfa, body);
    return this.respond(res, await this.auth.staffMfa(mfaToken, code));
  }

  @Public()
  @Post("refresh")
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.respond(res, await this.auth.refresh(req.cookies?.[REFRESH_COOKIE]));
  }

  @Public()
  @Post("logout")
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE]);
    res.clearCookie(REFRESH_COOKIE, { path: "/v1/auth" });
  }

  @Get("me")
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }

  @Patch("me")
  updateMe(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.auth.updateProfile(user.id, parse(Profile, body));
  }

  /** Refresh token lives in an httpOnly cookie scoped to /v1/auth; the access token goes in the body. */
  private respond(res: Response, session: IssuedSession) {
    res.cookie(REFRESH_COOKIE, session.refreshToken, {
      httpOnly: true,
      sameSite: "strict",
      secure: env.NODE_ENV === "production",
      path: "/v1/auth",
      maxAge: 30 * 24 * 60 * 60_000,
    });
    return { accessToken: session.accessToken, user: session.user };
  }
}
