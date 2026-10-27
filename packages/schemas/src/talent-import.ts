import { RateCardSchema, RepSchema, TalentInputSchema, type RateCardInput, type RepInput, type TalentInput } from "./talent-admin";

// Bulk talent import (CRM → Talents → Import CSV). One row per artist; lists use ";". Amounts are whole rupees.
// Shared by apps/api and the demo store so the preview and the import agree on every row.

export const IMPORT_MAX_ROWS = 500;

export const IMPORT_COLUMNS = [
  { key: "stage_name", required: true, hint: "Name shown on the site" },
  { key: "headline", required: true, hint: "One line, e.g. Live & playback singer" },
  { key: "bio", required: true, hint: "A few sentences" },
  { key: "base_city", required: true, hint: "e.g. Mumbai" },
  { key: "categories", required: true, hint: "Up to 3, separated by ; e.g. Singers; DJs" },
  { key: "languages", required: true, hint: "Separated by ; e.g. Hindi; English" },
  { key: "event_types", required: false, hint: "Separated by ; e.g. Wedding; Corporate event" },
  { key: "travels_to", required: false, hint: "Separated by ; e.g. Pan-India" },
  { key: "tags", required: false, hint: "Separated by ; e.g. bollywood; live band" },
  { key: "tier", required: false, hint: "standard or premium (default standard)" },
  { key: "representation", required: false, hint: "agency, self or platform (default agency)" },
  { key: "featured", required: false, hint: "yes or no (default no)" },
  { key: "fee_from_inr", required: false, hint: "Public fee band from, in rupees" },
  { key: "fee_to_inr", required: false, hint: "Public fee band to, in rupees" },
  { key: "photo_url", required: true, hint: "https link to the profile photo" },
  { key: "gallery_urls", required: false, hint: "https links separated by ;" },
  { key: "rep_name", required: false, hint: "Representative's name (added as KYC pending)" },
  { key: "rep_phone", required: false, hint: "Representative's 10-digit mobile" },
  { key: "rep_agency", required: false, hint: "Agency name" },
  { key: "rep_email", required: false, hint: "Representative's email" },
  { key: "standard_rate_inr", required: false, hint: "Internal rate card: standard rate in rupees" },
  { key: "minimum_rate_inr", required: false, hint: "Internal rate card: minimum rate in rupees" },
  { key: "payout_percent", required: false, hint: "Internal rate card: share paid to the artist, e.g. 80" },
] as const;

export const IMPORT_EXAMPLE_ROW: Record<(typeof IMPORT_COLUMNS)[number]["key"], string> = {
  stage_name: "Noor Band",
  headline: "Sufi and Bollywood live act",
  bio: "A seven-piece live band playing weddings and corporate nights across India.",
  base_city: "Pune",
  categories: "Singers",
  languages: "Hindi; Urdu; English",
  event_types: "Wedding; Sangeet; Corporate event",
  travels_to: "Pan-India",
  tags: "sufi; live band",
  tier: "standard",
  representation: "agency",
  featured: "no",
  fee_from_inr: "150000",
  fee_to_inr: "300000",
  photo_url: "https://images.unsplash.com/photo-1501386761578-eac5c94b800a",
  gallery_urls: "",
  rep_name: "Asha Rao",
  rep_phone: "9876500001",
  rep_agency: "Spotlight Artists",
  rep_email: "asha@spotlight.example",
  standard_rate_inr: "250000",
  minimum_rate_inr: "200000",
  payout_percent: "80",
};

export type ImportRow = {
  line: number;
  stageName: string;
  errors: string[];
  /** Present only when the row has no errors. */
  input?: TalentInput;
  rep?: RepInput;
  rateCard?: RateCardInput;
};

export type ImportResult = {
  rows: { line: number; stageName: string; errors: string[]; slug?: string }[];
  valid: number;
  created: number;
};

const list = (v: string | undefined) => (v ?? "").split(";").map((s) => s.trim()).filter(Boolean);
const rupeesToPaise = (v: string) => {
  const clean = v.replace(/[₹,\s]/g, "").replace(/^rs\.?/i, "");
  return /^\d+$/.test(clean) ? String(BigInt(clean) * 100n) : null;
};

const TIERS: Record<string, TalentInput["tier"]> = { standard: "STANDARD", premium: "PREMIUM" };
const REPRESENTATION: Record<string, TalentInput["representationType"]> = {
  agency: "AGENCY_MANAGED",
  "agency managed": "AGENCY_MANAGED",
  self: "TALENT_MANAGED",
  "self managed": "TALENT_MANAGED",
  talent: "TALENT_MANAGED",
  platform: "PLATFORM_COORDINATED",
  "platform coordinated": "PLATFORM_COORDINATED",
};

const issuesOf = (error: { issues: { path: PropertyKey[]; message: string }[] }, columns: Record<string, string>) =>
  error.issues.map((i) => `${columns[String(i.path[0])] ?? String(i.path[0])}: ${i.message}`);

const PROFILE_COLUMN: Record<string, string> = {
  stageName: "stage_name",
  headline: "headline",
  bio: "bio",
  baseCity: "base_city",
  travelsTo: "travels_to",
  languages: "languages",
  eventTypes: "event_types",
  tags: "tags",
  categories: "categories",
  tier: "tier",
  representationType: "representation",
  featured: "featured",
  feeBandMinPaise: "fee_from_inr",
  feeBandMaxPaise: "fee_to_inr",
  photoUrl: "photo_url",
  galleryUrls: "gallery_urls",
};

/**
 * Checks every row. `categories` maps names and slugs (any case) to slugs; `existingNames` are stage names already
 * on the roster (lower-cased) so the same artist isn't imported twice.
 */
export function checkImportRows(
  records: { line: number; values: Record<string, string> }[],
  headers: string[],
  categories: { slug: string; name: string }[],
  existingNames: Set<string>,
): ImportRow[] {
  const missingColumns = IMPORT_COLUMNS.filter((c) => c.required && !headers.includes(c.key)).map((c) => c.key);
  const categoryBySlugOrName = new Map(categories.flatMap((c) => [[c.slug.toLowerCase(), c.slug] as const, [c.name.toLowerCase(), c.slug] as const]));
  const seen = new Map<string, number>();

  return records.map(({ line, values: v }) => {
    const stageName = v.stage_name ?? "";
    const errors: string[] = missingColumns.map((c) => `${c}: column missing from the file`);

    const cats = list(v.categories).map((c) => ({ raw: c, slug: categoryBySlugOrName.get(c.toLowerCase()) }));
    for (const c of cats) if (!c.slug) errors.push(`categories: “${c.raw}” isn't a category (use ${categories.map((x) => x.name).join(", ")})`);

    const tier = v.tier ? TIERS[v.tier.toLowerCase()] : "STANDARD";
    if (!tier) errors.push("tier: use standard or premium");
    const representationType = v.representation ? REPRESENTATION[v.representation.toLowerCase()] : "AGENCY_MANAGED";
    if (!representationType) errors.push("representation: use agency, self or platform");
    const featuredRaw = (v.featured ?? "").toLowerCase();
    if (featuredRaw && !["yes", "no", "y", "n", "true", "false", "1", "0"].includes(featuredRaw)) errors.push("featured: use yes or no");

    const feeFrom = v.fee_from_inr ? rupeesToPaise(v.fee_from_inr) : null;
    const feeTo = v.fee_to_inr ? rupeesToPaise(v.fee_to_inr) : null;
    if (v.fee_from_inr && !feeFrom) errors.push("fee_from_inr: whole rupees only, e.g. 150000");
    if (v.fee_to_inr && !feeTo) errors.push("fee_to_inr: whole rupees only, e.g. 300000");

    const profile = TalentInputSchema.safeParse({
      stageName,
      headline: v.headline ?? "",
      bio: v.bio ?? "",
      baseCity: v.base_city ?? "",
      travelsTo: list(v.travels_to),
      languages: list(v.languages),
      eventTypes: list(v.event_types),
      tags: list(v.tags),
      categories: cats.flatMap((c) => (c.slug ? [c.slug] : [])),
      tier: tier ?? "STANDARD",
      representationType: representationType ?? "AGENCY_MANAGED",
      featured: ["yes", "y", "true", "1"].includes(featuredRaw),
      feeBandMinPaise: feeFrom,
      feeBandMaxPaise: feeTo,
      photoUrl: v.photo_url ?? "",
      galleryUrls: list(v.gallery_urls),
    });
    if (!profile.success) errors.push(...issuesOf(profile.error, PROFILE_COLUMN).filter((e) => !(cats.some((c) => !c.slug) && e.startsWith("categories:"))));

    const key = stageName.trim().toLowerCase();
    if (key && existingNames.has(key)) errors.push("stage_name: already on the roster");
    if (key && seen.has(key)) errors.push(`stage_name: also on line ${seen.get(key)} of this file`);
    if (key && !seen.has(key)) seen.set(key, line);

    let rep: RepInput | undefined;
    if (v.rep_name || v.rep_phone || v.rep_agency || v.rep_email) {
      const parsed = RepSchema.safeParse({ name: v.rep_name ?? "", agencyName: v.rep_agency ?? "", phone: (v.rep_phone ?? "").replace(/\D/g, "").slice(-10), email: v.rep_email ?? "" });
      if (parsed.success) rep = parsed.data;
      else errors.push(...issuesOf(parsed.error, { name: "rep_name", agencyName: "rep_agency", phone: "rep_phone", email: "rep_email" }));
    }

    let rateCard: RateCardInput | undefined;
    if (v.standard_rate_inr || v.minimum_rate_inr || v.payout_percent) {
      const selling = rupeesToPaise(v.standard_rate_inr ?? "");
      const minimum = rupeesToPaise(v.minimum_rate_inr ?? "");
      const payout = Number(v.payout_percent);
      if (!selling || !minimum || !v.payout_percent || !Number.isFinite(payout)) {
        errors.push("rate card: fill standard_rate_inr, minimum_rate_inr and payout_percent together, or leave all three empty");
      } else {
        const parsed = RateCardSchema.safeParse({ sellingRatePaise: selling, minimumRatePaise: minimum, payoutBps: Math.round(payout * 100) });
        if (parsed.success) rateCard = parsed.data;
        else errors.push(...issuesOf(parsed.error, { sellingRatePaise: "standard_rate_inr", minimumRatePaise: "minimum_rate_inr", payoutBps: "payout_percent" }));
      }
    }

    return errors.length || !profile.success ? { line, stageName, errors } : { line, stageName, errors, input: profile.data, rep, rateCard };
  });
}
