import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { z } from "zod";
import { BlackoutNoteSchema, LineItemTypeSchema } from "@repo/schemas";
import { LEAD_STAGES } from "@repo/utils";
import { jsonSafe } from "../common/json";
import { parse } from "../common/validate";
import { CurrentUser, Roles, STAFF_ROLES, type AuthUser } from "../auth/guard";
import { toMessage } from "../me/me.controller";
import { BOOKING_ACTIONS, StaffService, type BookingAction } from "./staff.service";

const Assign = z.object({ ownerId: z.string().min(1) });
const Move = z.object({ to: z.enum(LEAD_STAGES), reason: z.string().trim().max(500).optional() });
const AddTalent = z.object({ slug: z.string().min(1).max(80) });
const Text = z.object({ text: z.string().trim().min(1, "Write something first").max(2000) });
const Action = z.object({
  action: z.enum(Object.keys(BOOKING_ACTIONS) as [BookingAction, ...BookingAction[]]),
  note: z.string().trim().max(500).optional(),
});
const Paise = z.string().regex(/^\d+$/, "Amounts must be whole paise");
const Draft = z.object({
  lines: z
    .array(
      z.object({
        type: LineItemTypeSchema,
        description: z.string().trim().min(1, "Every line needs a description").max(200),
        customerAmountPaise: Paise,
        internalCostPaise: Paise,
        taxRateBps: z.number().int(),
      }),
    )
    .min(1, "Add at least one line")
    .max(20),
  validDays: z.number().int().min(1).max(30),
  advanceBps: z.number().int().min(1000).max(10_000),
});
const Reason = z.object({ reason: z.string().trim().min(1, "Give a reason so sales can revise it").max(500) });
const Utr = z.object({ reference: z.string().trim().min(4, "Enter the bank transfer reference (UTR)").max(40) });
const MessageText = z.object({ body: z.string().trim().min(1, "Write a message first").max(2000) });
const AppStatus = z.object({ status: z.enum(["NEW", "REVIEWING", "INVITED", "DECLINED"]) });
const DateParam = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date");

/** Staff CRM API (apps/admin). Every route needs a staff role on an MFA session; finer roles in StaffService. */
@Controller("admin")
@Roles(...STAFF_ROLES)
export class StaffController {
  constructor(@Inject(StaffService) private readonly staff: StaffService) {}

  @Get("analytics")
  async analytics(@CurrentUser() user: AuthUser) {
    return jsonSafe(await this.staff.analytics(user));
  }

  @Get("leads")
  async leads() {
    return jsonSafe(await this.staff.listLeads());
  }

  @Get("leads/:id")
  async lead(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return jsonSafe(await this.staff.getLead(user, id));
  }

  @Post("leads/:id/assign")
  @HttpCode(204)
  assign(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: unknown) {
    return this.staff.assignOwner(user, id, parse(Assign, body).ownerId);
  }

  @Post("leads/:id/transition")
  @HttpCode(204)
  transition(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: unknown) {
    const { to, reason } = parse(Move, body);
    return this.staff.moveStage(user, id, to, reason);
  }

  @Post("leads/:id/talents")
  @HttpCode(204)
  addTalent(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: unknown) {
    return this.staff.addTalent(user, id, parse(AddTalent, body).slug);
  }

  @Post("leads/:id/notes")
  @HttpCode(204)
  note(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: unknown) {
    return this.staff.addNote(user, id, parse(Text, body).text);
  }

  @Post("bookings/:id/actions")
  @HttpCode(204)
  action(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: unknown) {
    const { action, note } = parse(Action, body);
    return this.staff.bookingAction(user, id, action, note);
  }

  @Get("bookings/:id/quote-draft")
  async draft(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.staff.draftQuote(user, id);
  }

  @Post("bookings/:id/quotes")
  createQuote(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: unknown) {
    return this.staff.createQuote(user, id, parse(Draft, body));
  }

  @Post("quotes/:id/approve")
  @HttpCode(204)
  approve(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.staff.approveQuote(user, id);
  }

  @Post("quotes/:id/reject")
  @HttpCode(204)
  reject(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: unknown) {
    return this.staff.rejectQuote(user, id, parse(Reason, body).reason);
  }

  @Get("payments")
  async payments() {
    return jsonSafe(await this.staff.listPayments());
  }

  @Post("milestones/:id/link")
  @HttpCode(204)
  link(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.staff.sendPaymentLink(user, id);
  }

  @Post("milestones/:id/manual-payment")
  @HttpCode(204)
  manual(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: unknown) {
    return this.staff.recordManualPayment(user, id, parse(Utr, body).reference);
  }

  @Get("payouts")
  async payouts(@CurrentUser() user: AuthUser) {
    return jsonSafe(await this.staff.listPayouts(user));
  }

  @Get("talents")
  async talents(@CurrentUser() user: AuthUser) {
    return jsonSafe(await this.staff.listTalents(user));
  }

  @Get("talents/:slug/blackouts")
  blackouts(@Param("slug") slug: string) {
    return this.staff.blackouts(slug);
  }

  @Post("talents/:slug/blackouts/:date")
  @HttpCode(204)
  block(@CurrentUser() user: AuthUser, @Param("slug") slug: string, @Param("date") date: string, @Body() body: unknown) {
    return this.staff.setBlackout(user, slug, parse(DateParam, date), true, parse(BlackoutNoteSchema, body ?? {}).note);
  }

  @Delete("talents/:slug/blackouts/:date")
  @HttpCode(204)
  unblock(@CurrentUser() user: AuthUser, @Param("slug") slug: string, @Param("date") date: string) {
    return this.staff.setBlackout(user, slug, parse(DateParam, date), false);
  }

  @Post("leads/:id/messages")
  async replyToCustomer(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: unknown) {
    return toMessage(await this.staff.replyToCustomer(user, id, parse(MessageText, body).body));
  }

  @Get("bookings/:id/messages")
  async talentThread(@Param("id") id: string) {
    return (await this.staff.talentThread(id)).map(toMessage);
  }

  @Post("bookings/:id/messages")
  async replyToTalent(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: unknown) {
    return toMessage(await this.staff.replyToTalent(user, id, parse(MessageText, body).body));
  }

  @Get("inbox")
  async inbox() {
    return jsonSafe(await this.staff.inbox());
  }

  @Post("applications/:id/status")
  @HttpCode(204)
  applicationStatus(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: unknown) {
    return this.staff.setApplicationStatus(user, id, parse(AppStatus, body).status);
  }

  @Get("audit")
  async audit(@CurrentUser() user: AuthUser) {
    return jsonSafe(await this.staff.auditLog(user));
  }
}
