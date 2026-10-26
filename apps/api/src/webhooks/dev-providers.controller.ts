import { randomBytes } from "node:crypto";
import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { z } from "zod";
import { notFound } from "../common/errors";
import { paise, parse } from "../common/validate";
import { CurrentUser, Roles, type AuthUser } from "../auth/guard";
import { PrismaService } from "../prisma/prisma.service";
import { customerLeadInclude, toCustomerLead } from "../bookings/customer-serializer";
import { applyEsignEvent, applyGatewayEvent } from "../bookings/domain";

const Pay = z.object({ method: z.string().min(2).max(40), outcome: z.enum(["success", "failure"]) });
const Sign = z.object({ signedName: z.string().trim().min(2, "Type your full name to sign").max(120) });

const eventId = () => `evt_${randomBytes(8).toString("hex")}`;

/**
 * Development stand-ins for the gateway's hosted checkout and the e-sign vendor's signing page.
 * Registered only outside production (app.module.ts). They raise the same events the real
 * providers' webhooks would, through the same handlers.
 */
@Controller("dev")
@Roles("CUSTOMER")
export class DevProvidersController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get("checkout/:milestoneId")
  async checkout(@CurrentUser() user: AuthUser, @Param("milestoneId") id: string) {
    const m = await this.prisma.db.paymentMilestone.findFirst({
      where: { id, booking: { lead: { customerId: user.id } } },
      include: { booking: { include: { lead: true } } },
    });
    if (!m) throw notFound("Payment link");
    const payer = await this.prisma.db.user.findUniqueOrThrow({ where: { id: user.id } });
    return {
      milestoneId: m.id,
      label: m.label,
      amountPaise: paise(m.amountPaise),
      status: m.status,
      ref: m.booking.lead.ref,
      leadId: m.booking.leadId,
      payerName: payer.name,
      payerPhone: payer.phone,
    };
  }

  @Post("checkout/:milestoneId/pay")
  @HttpCode(200)
  async pay(@CurrentUser() user: AuthUser, @Param("milestoneId") id: string, @Body() body: unknown) {
    const { method, outcome } = parse(Pay, body);
    const m = await this.prisma.db.paymentMilestone.findFirst({ where: { id, booking: { lead: { customerId: user.id } } } });
    if (!m) throw notFound("Payment link");
    const gatewayPaymentId = `pay_${randomBytes(7).toString("hex")}`;
    await this.prisma.db.$transaction((tx) =>
      applyGatewayEvent(tx, {
        eventId: eventId(),
        milestoneId: m.id,
        gatewayPaymentId,
        amountPaise: m.amountPaise.toString(),
        method,
        status: outcome === "success" ? "captured" : "failed",
      }),
    );
    return { gatewayPaymentId, outcome };
  }

  @Get("esign/:contractId")
  async contract(@CurrentUser() user: AuthUser, @Param("contractId") id: string) {
    const contract = await this.prisma.db.contract.findFirst({ where: { id, booking: { lead: { customerId: user.id } } }, include: { booking: true } });
    if (!contract) throw notFound("Document");
    const lead = await this.prisma.db.lead.findUniqueOrThrow({ where: { id: contract.booking.leadId }, include: customerLeadInclude });
    const signer = await this.prisma.db.user.findUniqueOrThrow({ where: { id: user.id } });
    const dto = toCustomerLead(lead);
    return { contractId: contract.id, status: contract.status, signerName: signer.name, lead: dto, booking: dto.bookings.find((b) => b.id === contract.bookingId)! };
  }

  @Post("esign/:contractId/sign")
  @HttpCode(204)
  async sign(@CurrentUser() user: AuthUser, @Param("contractId") id: string, @Body() body: unknown) {
    const { signedName } = parse(Sign, body);
    const contract = await this.prisma.db.contract.findFirst({ where: { id, booking: { lead: { customerId: user.id } } } });
    if (!contract) throw notFound("Document");
    await this.prisma.db.$transaction((tx) => applyEsignEvent(tx, { eventId: eventId(), contractId: contract.id, signedName }));
  }
}
