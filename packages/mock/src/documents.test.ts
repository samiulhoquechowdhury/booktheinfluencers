import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildContractPdf, buildQuotePdf } from "@repo/pdf";
import { buildSeed } from "./seed";
import { contractPdfData, quotePdfData } from "./documents";

const font = (n: string) => new Uint8Array(readFileSync(new URL(`../../pdf/fonts/${n}`, import.meta.url)));
const fonts = { regular: font("NotoSans-Regular.ttf"), bold: font("NotoSans-Bold.ttf") };

describe("mock documents", () => {
  it("builds PDFs for seeded quotes and contracts, and hides other customers'", async () => {
    const db = buildSeed();
    const quote = db.quotes.find((q) => q.status === "SENT" || q.status === "ACCEPTED")!;
    const booking = db.bookings.find((b) => b.id === quote.bookingId)!;
    const owner = db.leads.find((l) => l.id === booking.leadId)!.customerId;
    const data = quotePdfData(db, quote.id, owner);
    expect(JSON.stringify(data)).not.toMatch(/internalCost/);
    expect((await buildQuotePdf(data, fonts)).length).toBeGreaterThan(1000);
    expect(() => quotePdfData(db, quote.id, "usr_someone_else")).toThrow(/not found/);

    const contract = db.contracts.find((c) => db.quotes.some((q) => q.bookingId === c.bookingId && q.status === "ACCEPTED"));
    if (contract) expect((await buildContractPdf(contractPdfData(db, contract.id), fonts)).length).toBeGreaterThan(1000);
  });
});
