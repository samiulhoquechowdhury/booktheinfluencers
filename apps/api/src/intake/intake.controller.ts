import { Body, Controller, HttpCode, Inject, Post } from "@nestjs/common";
import { z } from "zod";
import { INDIAN_MOBILE } from "@repo/schemas";
import { DomainError } from "../common/errors";
import { parse } from "../common/validate";
import { Public } from "../auth/guard";
import { PrismaService } from "../prisma/prisma.service";
import { nextRef } from "../bookings/domain";

const Phone = z.string().regex(INDIAN_MOBILE, "Enter a 10-digit Indian mobile number");

const Contact = z.object({
  name: z.string().trim().min(2, "Enter your name").max(80),
  phone: Phone,
  email: z.email("Enter a valid email").optional().or(z.literal("")),
  topic: z.string().trim().min(2).max(60),
  message: z.string().trim().min(10, "Tell us a little more").max(2000),
});

const Application = z.object({
  stageName: z.string().trim().min(2, "Enter your stage name").max(80),
  category: z.string().trim().min(2, "Choose a category").max(60),
  city: z.string().trim().min(2, "Choose your base city").max(60),
  phone: Phone,
  email: z.email("Enter a valid email"),
  representation: z.string().trim().min(2).max(80),
  links: z.string().trim().min(8, "Add at least one link to your work").max(1000),
  about: z.string().trim().min(20, "Tell us a little more about your act").max(2000),
});

const Newsletter = z.object({ email: z.email("Enter a valid email") });

/** Public forms on the website. No account needed. */
@Public()
@Controller()
export class IntakeController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Post("contact")
  async contact(@Body() body: unknown) {
    const input = parse(Contact, body);
    return this.prisma.db.$transaction(async (tx) => {
      const ref = await nextRef(tx, "contact", "CR-");
      await tx.contactRequest.create({ data: { ...input, email: input.email || null, ref } });
      return { ref };
    });
  }

  @Post("talent-applications")
  async apply(@Body() body: unknown) {
    const input = parse(Application, body);
    return this.prisma.db.$transaction(async (tx) => {
      const existing = await tx.talentApplication.findFirst({ where: { phone: input.phone, status: { not: "DECLINED" } } });
      if (existing) throw new DomainError("DUPLICATE", `We already have your application (${existing.ref}). Our team will be in touch.`, 409);
      const ref = await nextRef(tx, "application", "AP-");
      await tx.talentApplication.create({ data: { ...input, ref } });
      return { ref };
    });
  }

  @Post("newsletter")
  @HttpCode(200)
  async subscribe(@Body() body: unknown) {
    const email = parse(Newsletter, body).email.trim().toLowerCase();
    const created = await this.prisma.db.newsletterSubscriber.createMany({ data: [{ email }], skipDuplicates: true });
    return { alreadySubscribed: created.count === 0 };
  }
}
