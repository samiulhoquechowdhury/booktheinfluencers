import { Body, Controller, Get, HttpCode, Inject, Param, Post, Res } from "@nestjs/common";
import type { Response } from "express";
import { ReviewRejectSchema } from "@repo/schemas";
import { parse } from "../common/validate";
import { CurrentUser, Roles, type AuthUser } from "../auth/guard";
import { VerificationsService } from "./verifications.service";

@Controller("admin/verifications")
@Roles("TALENT_MANAGER")
export class VerificationsController {
  constructor(@Inject(VerificationsService) private readonly verifications: VerificationsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.verifications.list(user);
  }

  @Get("documents/:id")
  async document(@CurrentUser() user: AuthUser, @Param("id") id: string, @Res() res: Response) {
    const doc = await this.verifications.document(user, id);
    res.setHeader("Content-Type", doc.mime);
    res.setHeader("Content-Disposition", `inline; filename="${doc.fileName}"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.end(Buffer.from(doc.bytes));
  }

  @Get(":slug")
  detail(@CurrentUser() user: AuthUser, @Param("slug") slug: string) {
    return this.verifications.detail(user, slug);
  }

  @Post(":slug/approve")
  @HttpCode(204)
  approve(@CurrentUser() user: AuthUser, @Param("slug") slug: string) {
    return this.verifications.approve(user, slug);
  }

  @Post(":slug/reject")
  @HttpCode(204)
  reject(@CurrentUser() user: AuthUser, @Param("slug") slug: string, @Body() body: unknown) {
    return this.verifications.reject(user, slug, parse(ReviewRejectSchema, body).reason);
  }
}
