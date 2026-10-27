import { Body, Controller, Get, Inject, Param, Patch, Post } from "@nestjs/common";
import { FollowUpInputSchema, FollowUpUpdateSchema } from "@repo/schemas";
import { parse } from "../common/validate";
import { CurrentUser, Roles, STAFF_ROLES, type AuthUser } from "../auth/guard";
import { FollowUpsService } from "./follow-ups.service";

@Controller("admin")
@Roles(...STAFF_ROLES)
export class FollowUpsController {
  constructor(@Inject(FollowUpsService) private readonly followUps: FollowUpsService) {}

  @Get("follow-ups/mine")
  mine(@CurrentUser() user: AuthUser) {
    return this.followUps.mine(user);
  }

  @Get("leads/:id/follow-ups")
  forLead(@Param("id") id: string) {
    return this.followUps.forLead(id);
  }

  @Post("leads/:id/follow-ups")
  create(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: unknown) {
    return this.followUps.create(user, id, parse(FollowUpInputSchema, body));
  }

  @Patch("follow-ups/:id")
  update(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: unknown) {
    return this.followUps.update(user, id, parse(FollowUpUpdateSchema, body));
  }
}
