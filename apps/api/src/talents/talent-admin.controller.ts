import { Body, Controller, Get, HttpCode, Inject, Param, Post, Put } from "@nestjs/common";
import { ProfileStatusSchema, RateCardSchema, RepSchema, TalentInputSchema, VerificationStatusSchema } from "@repo/schemas";
import { z } from "zod";
import { parse } from "../common/validate";
import { CurrentUser, Roles, STAFF_ROLES, type AuthUser } from "../auth/guard";
import { TalentAdminService } from "./talent-admin.service";

const Status = z.object({ status: ProfileStatusSchema });
const Import = z.object({ csv: z.string().min(1, "Choose a CSV file").max(1_000_000, "Keep the file under 1 MB"), commit: z.boolean().default(false) });
const SelfEdit = z.object({ selfEdit: z.boolean() });
const Verification = z.object({ verification: VerificationStatusSchema });

/** ADM-1…5. Reads for any staff role; changes are role-checked in TalentAdminService. */
@Controller("admin")
@Roles(...STAFF_ROLES)
export class TalentAdminController {
  constructor(@Inject(TalentAdminService) private readonly talents: TalentAdminService) {}

  @Get("talents/:slug")
  get(@CurrentUser() user: AuthUser, @Param("slug") slug: string) {
    return this.talents.get(user, slug);
  }

  @Post("talents")
  create(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.talents.create(user, parse(TalentInputSchema, body));
  }

  /** Bulk CSV import: check first (commit: false), then import the valid rows as drafts. */
  @Post("talents/import")
  @HttpCode(200)
  importCsv(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const { csv, commit } = parse(Import, body);
    return this.talents.importCsv(user, csv, commit);
  }

  @Put("talents/:slug")
  @HttpCode(204)
  update(@CurrentUser() user: AuthUser, @Param("slug") slug: string, @Body() body: unknown) {
    return this.talents.update(user, slug, parse(TalentInputSchema, body));
  }

  @Post("talents/:slug/status")
  @HttpCode(204)
  status(@CurrentUser() user: AuthUser, @Param("slug") slug: string, @Body() body: unknown) {
    return this.talents.setStatus(user, slug, parse(Status, body).status);
  }

  @Put("talents/:slug/rate-card")
  @HttpCode(204)
  rateCard(@CurrentUser() user: AuthUser, @Param("slug") slug: string, @Body() body: unknown) {
    return this.talents.setRateCard(user, slug, parse(RateCardSchema, body));
  }

  @Post("talents/:slug/reps")
  @HttpCode(204)
  addRep(@CurrentUser() user: AuthUser, @Param("slug") slug: string, @Body() body: unknown) {
    return this.talents.addRep(user, slug, parse(RepSchema, body));
  }

  @Put("talents/:slug/calendar")
  @HttpCode(204)
  calendar(@CurrentUser() user: AuthUser, @Param("slug") slug: string, @Body() body: unknown) {
    return this.talents.setSelfEdit(user, slug, parse(SelfEdit, body).selfEdit);
  }

  @Post("reps/:id/verification")
  @HttpCode(204)
  verification(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: unknown) {
    return this.talents.setRepVerification(user, id, parse(Verification, body).verification);
  }
}
