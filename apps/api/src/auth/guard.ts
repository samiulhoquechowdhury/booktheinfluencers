import { CanActivate, Inject, Injectable, SetMetadata, createParamDecorator, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import type { Role } from "@repo/db";
import { forbidden, unauthenticated } from "../common/errors";
import { verifyAccessToken } from "./crypto";

export type AuthUser = { id: string; roles: Role[] };
export type AuthedRequest = Request & { user?: AuthUser };

const PUBLIC = "auth:public";
const ROLES = "auth:roles";
export const STAFF_ROLES: Role[] = ["SUPER_ADMIN", "SALES", "TALENT_MANAGER", "OPS", "ACCOUNTS"];

/** Opt out of sign-in. Every other route requires a valid access token (rules.md §3). */
export const Public = () => SetMetadata(PUBLIC, true);

/** Allowed roles; SUPER_ADMIN always passes. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<AuthedRequest>().user!);

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  async canActivate(ctx: ExecutionContext) {
    const targets = [ctx.getHandler(), ctx.getClass()];
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;

    if (token) {
      try {
        const claims = await verifyAccessToken(token);
        // Staff roles only count on an MFA session (runbook: security checklist).
        const roles = claims.mfa ? claims.roles : claims.roles.filter((r) => !STAFF_ROLES.includes(r));
        req.user = { id: claims.sub, roles };
      } catch {
        if (!this.reflector.getAllAndOverride<boolean>(PUBLIC, targets)) throw unauthenticated("Your session has expired");
      }
    }

    if (this.reflector.getAllAndOverride<boolean>(PUBLIC, targets)) return true;
    if (!req.user) throw unauthenticated();

    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES, targets);
    if (roles && !req.user.roles.includes("SUPER_ADMIN") && !roles.some((r) => req.user!.roles.includes(r))) {
      throw forbidden("Your role can't do that");
    }
    return true;
  }
}
