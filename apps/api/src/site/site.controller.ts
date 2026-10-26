import { Body, Controller, Delete, Get, Headers, HttpCode, Inject, Param, Post, Put, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { z } from "zod";
import { HeroSlideInputSchema } from "@repo/schemas";
import { parse } from "../common/validate";
import { CurrentUser, Public, Roles, type AuthUser } from "../auth/guard";
import { SiteService } from "./site.service";

const Order = z.object({ ids: z.array(z.string().min(1)).min(1).max(20) });

@Controller()
export class SiteController {
  constructor(@Inject(SiteService) private readonly site: SiteService) {}

  @Public()
  @Get("site/hero")
  hero() {
    return this.site.publicHero();
  }

  /** Uploaded images never change (a new upload gets a new id), so browsers may cache them for a year. */
  @Public()
  @Get("media/:id")
  async media(@Param("id") id: string, @Res() res: Response) {
    const media = await this.site.media(id);
    res.setHeader("Content-Type", media.mime);
    res.setHeader("Content-Length", String(media.size));
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.end(Buffer.from(media.bytes));
  }

  @Get("admin/site/hero")
  @Roles("SUPER_ADMIN")
  list(@CurrentUser() user: AuthUser) {
    return this.site.listHero(user);
  }

  @Post("admin/site/hero")
  @Roles("SUPER_ADMIN")
  create(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.site.createHero(user, parse(HeroSlideInputSchema, body));
  }

  @Put("admin/site/hero/:id")
  @Roles("SUPER_ADMIN")
  update(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: unknown) {
    return this.site.updateHero(user, id, parse(HeroSlideInputSchema, body));
  }

  @Delete("admin/site/hero/:id")
  @Roles("SUPER_ADMIN")
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.site.deleteHero(user, id);
  }

  @Post("admin/site/hero-order")
  @Roles("SUPER_ADMIN")
  @HttpCode(204)
  reorder(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.site.reorderHero(user, parse(Order, body).ids);
  }

  /** Body is the raw image bytes; the browser resizes first and sends the final dimensions. */
  @Post("admin/media")
  @Roles("SUPER_ADMIN")
  upload(@CurrentUser() user: AuthUser, @Body() body: unknown, @Headers("content-type") type: string | undefined, @Query("width") width: string, @Query("height") height: string) {
    return this.site.upload(user, body, type?.split(";")[0]?.trim(), Number(width), Number(height));
  }
}
