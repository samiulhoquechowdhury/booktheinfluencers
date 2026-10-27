// Lightweight entry (no pdf-lib): the letterhead and file names, for code that only prepares PDF data.

export type Brand = { name: string; email: string; phone: string; website: string };

/** Letterhead until the brand, domain and contact details are decided (docs/memory.md → open questions). */
export const DEFAULT_BRAND: Brand = {
  name: "BookTheInfluencer",
  website: "booktheinfluencer.in",
  email: "bookings@booktheinfluencer.in",
  phone: "+91 90000 12345",
};

export const pdfFileName = (kind: "quote" | "contract", ref: string, version?: number) =>
  kind === "quote" ? `Quotation-${ref}-v${version}.pdf` : `Booking-agreement-${ref}.pdf`;
