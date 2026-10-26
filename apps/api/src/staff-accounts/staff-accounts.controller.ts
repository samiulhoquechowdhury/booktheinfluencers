import { Body, Controller, Get, HttpCode, Inject, Param, Post, Put } from "@nestjs/common";
import { z } from "zod";
import { StaffCreateSchema, StaffUpdateSchema } from "@repo/schemas";
import { parse } from "../common/validate";
import { CurrentUser, Roles, STAFF_ROLES, type AuthUser } from "../auth/guard";
import { StaffAccountsService } from "./staff-accounts.service";

const Active = z.object({ active: z.boolean() });

/** Staff accounts. Super admins only, except the directory of active names used by owner pickers. */
@Controller("admin")
export class StaffAccountsController {
  constructor(@Inject(StaffAccountsService) private readonly staff: StaffAccountsService) {}

  @Get("staff-directory")
  @Roles(...STAFF_ROLES)
  directory() {
    return this.staff.directory();
  }

  @Get("staff")
  @Roles("SUPER_ADMIN")
  list(@CurrentUser() user: AuthUser) {
    return this.staff.list(user);
  }

  @Post("staff")
  @Roles("SUPER_ADMIN")
  create(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.staff.create(user, parse(StaffCreateSchema, body));
  }

  @Put("staff/:id")
  @Roles("SUPER_ADMIN")
  update(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: unknown) {
    return this.staff.update(user, id, parse(StaffUpdateSchema, body));
  }

  @Post("staff/:id/active")
  @Roles("SUPER_ADMIN")
  @HttpCode(200)
  setActive(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: unknown) {
    return this.staff.setActive(user, id, parse(Active, body).active);
  }

  @Post("staff/:id/reset-password")
  @Roles("SUPER_ADMIN")
  @HttpCode(200)
  resetPassword(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.staff.resetPassword(user, id);
  }

  @Post("staff/:id/reset-mfa")
  @Roles("SUPER_ADMIN")
  @HttpCode(200)
  resetMfa(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.staff.resetMfa(user, id);
  }
}
