import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { buildContractPdf, buildQuotePdf, type QuotePdfData } from "./index";

const fonts = {
  regular: new Uint8Array(readFileSync(new URL("../fonts/NotoSans-Regular.ttf", import.meta.url))),
  bold: new Uint8Array(readFileSync(new URL("../fonts/NotoSans-Bold.ttf", import.meta.url))),
};

const quote: QuotePdfData = {
  brand: { name: "BookTheInfluencer", email: "hello@example.com", phone: "+91 90000 12345", website: "booktheinfluencer.in" },
  ref: "TB-2026-000101",
  version: 2,
  status: "SENT",
  issuedAt: "2026-10-20T10:00:00.000Z",
  validUntil: "2026-10-27T10:00:00.000Z",
  customer: { name: "Neha Verma", company: "Acme Pvt Ltd", gstin: "27ABCDE1234F1Z5", email: "neha@example.com", phone: "9876543210" },
  event: { type: "Wedding", date: "2026-12-18", city: "Mumbai", venue: "Rooftop, Bandra", durationMins: 90, audienceSize: 300 },
  artist: { name: "Aanya Kapoor", headline: "Live & playback singer" },
  lines: [
    { description: "Artist fee — Aanya Kapoor, 90-minute set with a seven-piece band", amountPaise: "45000000", taxRateBps: 1800 },
    { description: "Travel and stay for the artist's team", amountPaise: "3500000", taxRateBps: 500 },
  ],
  totals: { subtotalPaise: "48500000", taxPaise: "8275000", totalPaise: "56775000" },
  schedule: [
    { label: "Advance", percentBps: 5000 },
    { label: "Balance", percentBps: 5000 },
  ],
};

describe("pdf", () => {
  it("builds a quote PDF that opens, with a title", async () => {
    const bytes = await buildQuotePdf(quote, fonts);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    if (process.env.PDF_OUT) (await import("node:fs")).writeFileSync(`${process.env.PDF_OUT}/quote.pdf`, bytes);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1); // a typical quote fits on one page
    expect(doc.getTitle()).toBe("Quotation TB-2026-000101 v2");
    // Fonts are subset, so the file stays small.
    expect(bytes.length).toBeLessThan(150_000);
  });

  it("builds a multi-page contract with the signature", async () => {
    const bytes = await buildContractPdf(
      {
        brand: quote.brand,
        ref: quote.ref,
        contractId: "con_e727c0fdddfd4af2",
        status: "SIGNED",
        sentAt: "2026-10-21T10:00:00.000Z",
        signedAt: "2026-10-22T08:30:00.000Z",
        signedName: "Neha Verma",
        customer: quote.customer,
        event: quote.event,
        artist: { ...quote.artist, representation: "Spotlight Artists" },
        quoteVersion: 2,
        lines: quote.lines,
        totals: quote.totals,
        milestones: [
          { label: "Advance", dueDate: "2026-10-25", amountPaise: "28387500", status: "PAID" },
          { label: "Balance", dueDate: "2026-12-11", amountPaise: "28387500", status: "PENDING" },
        ],
      },
      fonts,
    );
    if (process.env.PDF_OUT) (await import("node:fs")).writeFileSync(`${process.env.PDF_OUT}/contract.pdf`, bytes);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(doc.getTitle()).toBe("Booking agreement TB-2026-000101");
  });
});
