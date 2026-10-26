import { createHmac } from "node:crypto";
import { Body, Controller, Headers, HttpCode, Inject, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import { env } from "../config/env";
import { DomainError } from "../common/errors";
import { parse } from "../common/validate";
import { safeEqual } from "../auth/crypto";
import { Public } from "../auth/guard";
import { PrismaService } from "../prisma/prisma.service";
import { applyEsignEvent, applyGatewayEvent } from "../bookings/domain";

const PaymentEvent = z.object({
  eventId: z.string().min(4),
  milestoneId: z.string().min(4),
  gatewayPaymentId: z.string().min(4),
  amountPaise: z.string().regex(/^\d+$/),
  method: z.string().min(2).max(40),
  status: z.enum(["captured", "failed"]),
});

const EsignEvent = z.object({ eventId: z.string().min(4), contractId: z.string().min(4), signedName: z.string().trim().min(2).max(120) });

/** HMAC-SHA256 of the raw body with WEBHOOK_SECRET, hex — the shape most gateways and e-sign vendors use. */
export const signWebhook = (rawBody: string | Buffer) => createHmac("sha256", env.WEBHOOK_SECRET).update(rawBody).digest("hex");

function verify(req: Request & { rawBody?: Buffer }, signature: string | undefined) {
  if (!req.rawBody || !signature || !safeEqual(signature, signWebhook(req.rawBody))) {
    throw new DomainError("BAD_SIGNATURE", "Invalid webhook signature", 401);
  }
}

/**
 * PAY-3 / CON-2: verify signature → idempotent insert → apply → 200 (rules.md §3).
 * Once the worker exists, "apply" moves to a queue; the contract stays the same.
 */
@Public()
@Controller("webhooks")
export class WebhooksController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Post("payments")
  @HttpCode(200)
  async payments(@Req() req: Request & { rawBody?: Buffer }, @Headers("x-signature") signature: string | undefined, @Body() body: unknown) {
    verify(req, signature);
    const event = parse(PaymentEvent, body);
    return this.prisma.db.$transaction((tx) => applyGatewayEvent(tx, event));
  }

  @Post("esign")
  @HttpCode(200)
  async esign(@Req() req: Request & { rawBody?: Buffer }, @Headers("x-signature") signature: string | undefined, @Body() body: unknown) {
    verify(req, signature);
    const event = parse(EsignEvent, body);
    return this.prisma.db.$transaction((tx) => applyEsignEvent(tx, event));
  }
}
