import { formatINR, formatINRCompact } from "@repo/utils";
import type { RepresentationType, TalentSummary } from "@repo/schemas";

/** Money arrives as paise strings (wire format). All display goes through formatINR. */
export const inr = (paise: string) => formatINR(BigInt(paise));
export const inrCompact = (paise: string) => formatINRCompact(BigInt(paise));

/** CAT-7: a range or "On request" — never a single final price. */
export function feeBand(talent: Pick<TalentSummary, "feeBandMinPaise" | "feeBandMaxPaise">) {
  if (!talent.feeBandMinPaise || !talent.feeBandMaxPaise) return "On request";
  return `${inrCompact(talent.feeBandMinPaise)} – ${inrCompact(talent.feeBandMaxPaise)}`;
}

export const REPRESENTATION_LABELS: Record<RepresentationType, string> = {
  TALENT_MANAGED: "Talent-managed",
  AGENCY_MANAGED: "Agency-managed",
  PLATFORM_COORDINATED: "Platform-coordinated",
};

export const REPRESENTATION_HELP: Record<RepresentationType, string> = {
  TALENT_MANAGED: "The artist manages their own bookings and confirms dates directly with us.",
  AGENCY_MANAGED: "An authorised agency represents this artist. We confirm everything with them.",
  PLATFORM_COORDINATED: "Our team coordinates this artist's bookings under an agreement with them.",
};

/** CAT-6: premium talent gets "Check availability"; others "Request to book". Never "Book now". */
export const ctaLabel = (talent: Pick<TalentSummary, "tier">) =>
  talent.tier === "PREMIUM" ? "Check availability" : "Request to book";

export function durationLabel(mins: number | null) {
  if (!mins) return null;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return [h ? `${h} hr` : "", m ? `${m} min` : ""].filter(Boolean).join(" ");
}

export function enquiryHref(slugs: string[] = []) {
  return slugs.length ? `/enquiry?talent=${slugs.join(",")}` : "/enquiry";
}
