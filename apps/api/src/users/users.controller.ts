import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { AccountRestrictSchema } from "@repo/schemas";
import { parse } from "../common/validate";
import { CurrentUser, Roles, type AuthUser } from "../auth/guard";
import { UsersService } from "./users.service";

const Filters = z.object({
  q: z.string().max(120).optional(),
  type: z.enum(["customer", "artist"]).optional(),
  status: z.enum(["ACTIVE", "DEACTIVATED", "BLOCKED"]).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});

/** Customers and artists (CRM → Users). The super admin only. */
@Controller("admin/users")
@Roles("SUPER_ADMIN")
export class UsersController {
  constructor(@Inject(UsersService) private readonly users: UsersService) {}

  @Get()
  list(@Query() query: unknown) {
    return this.users.list(parse(Filters, query));
  }

  @Get(":id")
  detail(@Param("id") id: string) {
    return this.users.detail(id);
  }

  @Post(":id/restrict")
  @HttpCode(200)
  restrict(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: unknown) {
    return this.users.restrict(user, id, parse(AccountRestrictSchema, body));
  }

  @Post(":id/restore")
  @HttpCode(200)
  restore(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.users.restore(user, id);
  }

  @Post(":id/sign-out")
  @HttpCode(200)
  signOut(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.users.signOut(user, id);
  }
}
