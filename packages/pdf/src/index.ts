import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { formatINR } from "@repo/utils";

// Quote and contract PDFs. One generator for the API (Node) and the demo mode (browser): callers pass the
// font bytes (Noto Sans, which has the ₹ sign) and the data. Customer-facing only — never internal costs.

export type PdfFonts = { regular: Uint8Array; bold: Uint8Array };

import type { Brand } from "./brand";

export { DEFAULT_BRAND, pdfFileName, type Brand } from "./brand";

export type PdfParty = { name: string; company?: string | null; gstin?: string | null; email?: string | null; phone?: string | null };
export type PdfEvent = { type: string; date: string; city: string; venue?: string | null; durationMins?: number | null; audienceSize?: number | null };
export type PdfLine = { description: string; amountPaise: string; taxRateBps: number };
export type PdfTotals = { subtotalPaise: string; taxPaise: string; totalPaise: string };

export type QuotePdfData = {
  brand: Brand;
  ref: string;
  version: number;
  status: string;
  issuedAt: string;
  validUntil: string;
  customer: PdfParty;
  event: PdfEvent;
  artist: { name: string; headline: string };
  lines: PdfLine[];
  totals: PdfTotals;
  /** e.g. [{ label: "Advance", percentBps: 5000 }, { label: "Balance", percentBps: 5000 }] */
  schedule: { label: string; percentBps: number }[];
};

export type ContractPdfData = {
  brand: Brand;
  ref: string;
  contractId: string;
  status: string;
  sentAt: string | null;
  signedAt: string | null;
  signedName: string | null;
  customer: PdfParty;
  event: PdfEvent;
  artist: { name: string; headline: string; representation: string };
  quoteVersion: number;
  lines: PdfLine[];
  totals: PdfTotals;
  milestones: { label: string; dueDate: string; amountPaise: string; status: string }[];
};

const INK = rgb(0.067, 0.094, 0.118);
const MUTED = rgb(0.4, 0.44, 0.47);
const GOLD = rgb(0.61, 0.42, 0.17);
const LINE = rgb(0.89, 0.88, 0.85);
const CREAM = rgb(0.98, 0.97, 0.945);

const A4 = { w: 595.28, h: 841.89 };
const M = 48;

const inr = (paise: string) => formatINR(BigInt(paise));
const percent = (bps: number) => `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 1)}%`;
const day = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
const dayTime = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
const date = (iso: string) => day.format(new Date(iso.length === 10 ? `${iso}T12:00:00+05:30` : iso));
const lineTax = (l: PdfLine) => (BigInt(l.amountPaise) * BigInt(l.taxRateBps)) / 10_000n;

/** A tiny layout helper: a cursor that wraps text and starts a new page when it runs out of room. */
class Writer {
  page!: PDFPage;
  y = 0;
  pages: PDFPage[] = [];
  constructor(
    readonly doc: PDFDocument,
    readonly regular: PDFFont,
    readonly bold: PDFFont,
    readonly footer: string,
  ) {
    this.newPage();
  }

  newPage() {
    this.page = this.doc.addPage([A4.w, A4.h]);
    this.pages.push(this.page);
    this.y = A4.h - M;
  }

  room(height: number) {
    if (this.y - height < M + 24) this.newPage();
  }

  wrap(text: string, font: PDFFont, size: number, width: number) {
    const out: string[] = [];
    for (const para of text.split("\n")) {
      let line = "";
      for (const word of para.split(/\s+/)) {
        const next = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(next, size) > width && line) {
          out.push(line);
          line = word;
        } else line = next;
      }
      out.push(line);
    }
    return out;
  }

  text(text: string, opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; x?: number; width?: number; gap?: number } = {}) {
    const size = opts.size ?? 10;
    const font = opts.bold ? this.bold : this.regular;
    const x = opts.x ?? M;
    const lines = this.wrap(text, font, size, opts.width ?? A4.w - x - M);
    for (const l of lines) {
      this.room(size * 1.45);
      this.page.drawText(l, { x, y: this.y - size, size, font, color: opts.color ?? INK });
      this.y -= size * 1.45;
    }
    this.y -= opts.gap ?? 0;
  }

  /** Text at a fixed spot on the current line, without moving the cursor. */
  at(text: string, x: number, opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; right?: boolean } = {}) {
    const size = opts.size ?? 10;
    const font = opts.bold ? this.bold : this.regular;
    const dx = opts.right ? font.widthOfTextAtSize(text, size) : 0;
    this.page.drawText(text, { x: x - dx, y: this.y - size, size, font, color: opts.color ?? INK });
  }

  rule(gap = 10) {
    this.room(gap * 2);
    this.y -= gap;
    this.page.drawLine({ start: { x: M, y: this.y }, end: { x: A4.w - M, y: this.y }, thickness: 0.6, color: LINE });
    this.y -= gap;
  }

  heading(text: string) {
    this.room(40);
    this.y -= 5;
    this.text(text.toUpperCase(), { size: 8.5, bold: true, color: GOLD, gap: 2 });
  }

  /** Label: value pairs in two columns. */
  facts(rows: [string, string | null | undefined][]) {
    const shown = rows.filter((r): r is [string, string] => Boolean(r[1]));
    const colW = (A4.w - 2 * M) / 2;
    for (let i = 0; i < shown.length; i += 2) {
      this.room(30);
      const top = this.y;
      let low = top;
      for (const [j, [label, value]] of shown.slice(i, i + 2).entries()) {
        this.y = top;
        this.text(label, { size: 8, color: MUTED, x: M + j * colW, width: colW - 12 });
        this.text(value, { size: 10, x: M + j * colW, width: colW - 12 });
        low = Math.min(low, this.y);
      }
      this.y = low - 2;
    }
  }

  /** Line items with GST, then subtotal / GST / total. */
  items(lines: PdfLine[], totals: PdfTotals) {
    const cols = { desc: M, gst: A4.w - M - 190, tax: A4.w - M - 95, amount: A4.w - M };
    this.room(28);
    this.page.drawRectangle({ x: M, y: this.y - 20, width: A4.w - 2 * M, height: 20, color: CREAM });
    this.y -= 5;
    this.at("Item", cols.desc + 6, { size: 8.5, bold: true, color: MUTED });
    this.at("GST", cols.gst, { size: 8.5, bold: true, color: MUTED, right: true });
    this.at("Tax", cols.tax, { size: 8.5, bold: true, color: MUTED, right: true });
    this.at("Amount", cols.amount - 6, { size: 8.5, bold: true, color: MUTED, right: true });
    this.y -= 22;
    for (const l of lines) {
      const wrapped = this.wrap(l.description, this.regular, 10, cols.gst - cols.desc - 70);
      this.room(wrapped.length * 14.5 + 8);
      const top = this.y;
      this.at(percent(l.taxRateBps), cols.gst, { right: true });
      this.at(inr(String(lineTax(l))), cols.tax, { right: true });
      this.at(inr(l.amountPaise), cols.amount - 6, { right: true });
      this.y = top;
      this.text(l.description, { x: cols.desc + 6, width: cols.gst - cols.desc - 70 });
      this.y -= 4;
      this.page.drawLine({ start: { x: M, y: this.y }, end: { x: A4.w - M, y: this.y }, thickness: 0.4, color: LINE });
      this.y -= 6;
    }
    for (const [label, value, strong] of [
      ["Subtotal", totals.subtotalPaise, false],
      ["GST", totals.taxPaise, false],
      ["Total", totals.totalPaise, true],
    ] as const) {
      this.room(18);
      this.at(label, cols.tax, { right: true, bold: strong, size: strong ? 11 : 10, color: strong ? INK : MUTED });
      this.at(inr(value), cols.amount - 6, { right: true, bold: strong, size: strong ? 11 : 10 });
      this.y -= strong ? 18 : 15;
    }
  }

  finish() {
    this.pages.forEach((p, i) => {
      p.drawLine({ start: { x: M, y: M + 6 }, end: { x: A4.w - M, y: M + 6 }, thickness: 0.4, color: LINE });
      p.drawText(this.footer, { x: M, y: M - 8, size: 7.5, font: this.regular, color: MUTED });
      const n = `Page ${i + 1} of ${this.pages.length}`;
      p.drawText(n, { x: A4.w - M - this.regular.widthOfTextAtSize(n, 7.5), y: M - 8, size: 7.5, font: this.regular, color: MUTED });
    });
  }
}

async function start(fonts: PdfFonts, title: string, brand: Brand, footer: string) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(title);
  doc.setAuthor(brand.name);
  doc.setCreator(brand.name);
  const [regular, bold] = await Promise.all([doc.embedFont(fonts.regular, { subset: true }), doc.embedFont(fonts.bold, { subset: true })]);
  return { doc, w: new Writer(doc, regular, bold, footer) };
}

function letterhead(w: Writer, brand: Brand, title: string, right: [string, string][]) {
  w.text(brand.name, { size: 18, bold: true });
  w.text(`${brand.website} · ${brand.email} · ${brand.phone}`, { size: 8.5, color: MUTED, gap: 10 });
  const top = w.y;
  w.text(title, { size: 22, bold: true });
  const after = w.y;
  w.y = top;
  for (const [label, value] of right) {
    w.at(label, A4.w - M - 150, { size: 8.5, color: MUTED });
    w.at(value, A4.w - M, { size: 9.5, bold: true, right: true });
    w.y -= 14;
  }
  w.y = Math.min(after, w.y);
  w.rule(8);
}

function eventFacts(w: Writer, event: PdfEvent, artist: { name: string; headline: string }) {
  w.facts([
    ["Artist", `${artist.name} — ${artist.headline}`],
    ["Event", event.type],
    ["Date", date(event.date)],
    ["City", event.city],
    ["Venue", event.venue],
    ["Performance length", event.durationMins ? `${event.durationMins} minutes` : null],
    ["Audience", event.audienceSize ? `About ${event.audienceSize.toLocaleString("en-IN")} guests` : null],
  ]);
}

const partyFacts = (p: PdfParty): [string, string | null | undefined][] => [
  ["Name", p.name],
  ["Company", p.company],
  ["GSTIN", p.gstin],
  ["Email", p.email],
  ["Phone", p.phone ? `+91 ${p.phone}` : null],
];

export async function buildQuotePdf(data: QuotePdfData, fonts: PdfFonts): Promise<Uint8Array> {
  const { doc, w } = await start(fonts, `Quotation ${data.ref} v${data.version}`, data.brand, `${data.brand.name} · Quotation ${data.ref} v${data.version}`);
  letterhead(w, data.brand, "Quotation", [
    ["Reference", data.ref],
    ["Version", `v${data.version}`],
    ["Issued", date(data.issuedAt)],
    ["Valid until", date(data.validUntil)],
  ]);

  w.heading("Prepared for");
  w.facts(partyFacts(data.customer));
  w.heading("Booking");
  eventFacts(w, data.event, data.artist);
  w.heading("Price");
  w.items(data.lines, data.totals);

  w.heading("Payment schedule");
  const total = BigInt(data.totals.totalPaise);
  for (const s of data.schedule) {
    w.room(16);
    w.at(`${s.label} (${percent(s.percentBps)})`, M);
    w.at(inr(String((total * BigInt(s.percentBps)) / 10_000n)), A4.w - M - 6, { right: true, bold: true });
    w.y -= 15;
  }
  w.text("The advance is due within 3 days of signing; the balance a week before the event. Payment links come from your booking page.", { size: 8.5, color: MUTED, gap: 4 });

  w.heading("What happens next");
  w.text(
    `1. Accept this quote on your booking page before ${date(data.validUntil)}.\n2. We send the booking agreement for e-signature.\n3. Pay the advance. The booking is confirmed once the contract is signed, the advance is received and the artist's team has accepted.`,
    { size: 9.5 },
  );
  w.text("Prices include the artist's fee and the items listed above. Anything not listed (stage, sound, light, hospitality) is the organiser's, unless agreed in writing. Cancellations follow our cancellation policy.", { size: 8.5, color: MUTED });
  w.finish();
  return doc.save();
}

const STANDARD_TERMS = [
  ["Booking", "The booking is confirmed only when this agreement is signed, the advance is received and the artist's representative has accepted. Until then the date is not held."],
  ["Payments", "The customer pays the amounts and due dates in the payment schedule through the payment links on their booking page. Late balance payment may release the date."],
  ["Performance", "The artist performs for the agreed length at the agreed event, date and city. The organiser provides the stage, sound, light, power, green room and safe access, unless stated otherwise in the price."],
  ["Changes", "Changes to the date, city, length or line-up need written agreement and may change the price."],
  ["Cancellation", "Cancellation by the customer follows the cancellation policy published on the website at the time of booking. If the artist cancels, the platform refunds amounts paid or offers an agreed replacement."],
  ["Force majeure", "Neither side is liable for failure caused by events outside reasonable control, such as natural disasters, government orders or serious illness. Amounts paid are then refunded less costs already incurred."],
  ["Conduct and content", "Recording and broadcast of the performance need the artist's written consent. Both sides keep each other's personal data confidential."],
  ["Disputes", "The parties try to resolve disputes in good faith first. Indian law applies."],
] as const;

export async function buildContractPdf(data: ContractPdfData, fonts: PdfFonts): Promise<Uint8Array> {
  const { doc, w } = await start(fonts, `Booking agreement ${data.ref}`, data.brand, `${data.brand.name} · Booking agreement ${data.ref}`);
  letterhead(w, data.brand, "Booking agreement", [
    ["Reference", data.ref],
    ["Agreement", data.contractId.slice(-10).toUpperCase()],
    ["Sent", data.sentAt ? date(data.sentAt) : "—"],
    ["Status", data.signedAt ? "Signed" : "Awaiting signature"],
  ]);

  w.text(
    `This agreement is between ${data.brand.name} (“the platform”), which manages the booking, and the customer named below, for a performance by ${data.artist.name}, represented by ${data.artist.representation}.`,
    { size: 9.5, gap: 4 },
  );
  w.heading("Customer");
  w.facts(partyFacts(data.customer));
  w.heading("Performance");
  eventFacts(w, data.event, data.artist);
  w.heading(`Price (quote v${data.quoteVersion})`);
  w.items(data.lines, data.totals);

  w.heading("Payment schedule");
  for (const m of data.milestones) {
    w.room(16);
    w.at(m.label, M);
    w.at(`due ${date(m.dueDate)}`, M + 150, { color: MUTED });
    w.at(m.status === "PAID" ? "Paid" : "", A4.w - M - 110, { color: GOLD, bold: true });
    w.at(inr(m.amountPaise), A4.w - M - 6, { right: true, bold: true });
    w.y -= 15;
  }

  w.heading("Terms");
  STANDARD_TERMS.forEach(([title, body], i) => {
    w.room(56); // keep each heading with its text
    w.text(`${i + 1}. ${title}`, { size: 9.5, bold: true });
    w.text(body, { size: 9, color: rgb(0.19, 0.21, 0.23), gap: 4 });
  });
  w.text("Standard terms, pending final legal review.", { size: 7.5, color: MUTED, gap: 6 });

  w.heading("Signature");
  w.room(70);
  if (data.signedAt && data.signedName) {
    w.text(`Signed electronically by ${data.signedName}`, { size: 11, bold: true });
    w.text(dayTime.format(new Date(data.signedAt)), { size: 9, color: MUTED });
  } else {
    w.text("Awaiting the customer's e-signature.", { size: 10, color: MUTED });
  }
  w.text(`For ${data.brand.name}: issued electronically on ${data.sentAt ? date(data.sentAt) : "—"}.`, { size: 9, color: MUTED });
  w.finish();
  return doc.save();
}
