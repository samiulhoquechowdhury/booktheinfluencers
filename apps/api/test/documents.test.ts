import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@repo/db";
import { randomPhone, signInCustomer, signInStaff, startApp } from "./helpers";

let app: INestApplication;
let db: PrismaClient;
let http: Awaited<ReturnType<typeof startApp>>["http"];
const tokens: Record<string, string> = {};
const as = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });

/** supertest buffers application/pdf as a Buffer with this parser. */
const binary = (res: NodeJS.ReadableStream, done: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on("data", (c: Buffer) => chunks.push(c));
  res.on("end", () => done(null, Buffer.concat(chunks)));
};

beforeAll(async () => {
  ({ app, db, http } = await startApp());
  tokens.sales = await signInStaff(app, "sales@demo.in");
  tokens.owner = await signInCustomer(app, "9876543210", "Neha Verma");
  tokens.stranger = await signInCustomer(app, randomPhone(), "Someone Else");
});
afterAll(async () => {
  await app?.close();
});

describe("quote and contract PDFs", () => {
  it("lets customers download their own sent quotes and agreements, and staff any", async () => {
    const owner = await db.user.findUniqueOrThrow({ where: { phone: "9876543210" } });
    const quote = await db.quote.findFirstOrThrow({ where: { status: { in: ["SENT", "ACCEPTED"] }, booking: { lead: { customerId: owner.id } } }, include: { booking: { include: { lead: true } } } });

    const mine = await http().get(`/v1/quotes/${quote.id}/pdf`).set(as("owner")).buffer(true).parse(binary).expect(200);
    expect(mine.headers["content-type"]).toBe("application/pdf");
    expect(mine.headers["content-disposition"]).toBe(`attachment; filename="Quotation-${quote.booking.lead.ref}-v${quote.version}.pdf"`);
    expect((mine.body as Buffer).subarray(0, 5).toString()).toBe("%PDF-");
    // No internal figures leak into the customer's document.
    expect((mine.body as Buffer).toString("latin1")).not.toMatch(/internal|margin/i);

    await http().get(`/v1/quotes/${quote.id}/pdf`).set(as("stranger")).expect(404);
    await http().get(`/v1/quotes/${quote.id}/pdf`).expect(401);
    await http().get(`/v1/admin/quotes/${quote.id}/pdf`).set(as("sales")).buffer(true).parse(binary).expect(200);

    const pending = await db.quote.findFirst({ where: { status: { in: ["DRAFT", "PENDING_APPROVAL"] }, booking: { lead: { customerId: owner.id } } } });
    if (pending) await http().get(`/v1/quotes/${pending.id}/pdf`).set(as("owner")).expect(404);

    const contract = await db.contract.findFirst({ where: { status: { not: "DRAFT" }, booking: { lead: { customerId: owner.id }, quotes: { some: { status: "ACCEPTED" } } } }, include: { booking: { include: { lead: true } } } });
    if (contract) {
      const pdf = await http().get(`/v1/contracts/${contract.id}/pdf`).set(as("owner")).buffer(true).parse(binary).expect(200);
      expect(pdf.headers["content-disposition"]).toBe(`attachment; filename="Booking-agreement-${contract.booking.lead.ref}.pdf"`);
      await http().get(`/v1/contracts/${contract.id}/pdf`).set(as("stranger")).expect(404);
      await http().get(`/v1/admin/contracts/${contract.id}/pdf`).set(as("sales")).buffer(true).parse(binary).expect(200);
    }
  });
});
