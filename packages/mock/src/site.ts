import { HeroSlideInputSchema, MAX_MEDIA_BYTES, type HeroSlideRecord, type PublicHeroSlide } from "@repo/schemas";
import type { StaffUser } from "./internal";
import { ApiError, newId, nowIso } from "./server";
import { audit, can } from "./staff";
import type { HeroSlideRec, MockDb } from "./types";

// Website content for the in-browser mock. Mirrors apps/api/src/site: same schema, same rules.

/** The built-in slides (photos in apps/web/public/images); the API migrations seed the same two. */
export const DEFAULT_HERO_SLIDES: HeroSlideRec[] = [
  {
    id: "hero_default",
    position: 0,
    active: true,
    imagePath: "/images/hero-main.jpg",
    imageId: null,
    imageAlt: "A singer silhouetted against an orange and purple stage light, pointing to a cheering crowd",
    eyebrow: "Managed talent booking · India",
    title: "Book the talent.",
    accent: "We handle the rest.",
    body: "Singers, DJs, comedians, anchors and creators for weddings, corporate nights and campus fests. We confirm availability with their representatives, then take care of the quote, contract and payments.",
    ctaLabel: "Explore talent",
    ctaHref: "#talent",
    textPosition: "left",
    updatedAt: "2026-10-27T00:00:00.000Z",
  },
  {
    id: "hero_stage",
    position: 1,
    active: true,
    imagePath: "/images/hero.jpg",
    imageId: null,
    imageAlt: "Singer with a microphone on stage, flanked by three performers under warm stage lights",
    eyebrow: "Live acts · weddings · corporate nights",
    title: "Singers, DJs and comedians",
    accent: "for every stage.",
    body: "From a sangeet to an annual day, we confirm the artist's date with their own team and handle the quote, contract and payments.",
    ctaLabel: "Explore talent",
    ctaHref: "#talent",
    textPosition: "left",
    updatedAt: "2026-10-27T00:00:00.000Z",
  },
];

const MAX_SLIDES = 6;

type HeroStore = Pick<MockDb, "heroSlides" | "media">;

const imageUrl = (db: HeroStore, s: HeroSlideRec) => (s.imageId ? (db.media[s.imageId] ?? null) : s.imagePath);
const toRecord = (db: MockDb, s: HeroSlideRec): HeroSlideRecord => {
  const { imagePath: _, ...rest } = s;
  return { ...rest, imageUrl: imageUrl(db, s) };
};

function requireAdmin(actor: StaffUser) {
  if (!can(actor, "SUPER_ADMIN")) throw new ApiError("FORBIDDEN", "Only super admins edit the website");
}

function parseSlide(raw: unknown) {
  const result = HeroSlideInputSchema.safeParse(raw);
  if (!result.success) throw new ApiError("VALIDATION", result.error.issues[0]?.message ?? "Please check the form");
  return result.data;
}

const sorted = (db: HeroStore) => db.heroSlides.toSorted((a, b) => a.position - b.position);

export function publicHero(db: HeroStore): PublicHeroSlide[] {
  return sorted(db).flatMap((s) => {
    const url = imageUrl(db, s);
    if (!s.active || !url) return [];
    return [{ id: s.id, eyebrow: s.eyebrow, title: s.title, accent: s.accent, body: s.body, ctaLabel: s.ctaLabel, ctaHref: s.ctaHref, imageAlt: s.imageAlt, textPosition: s.textPosition, imageUrl: url }];
  });
}

export function listHero(db: MockDb, actor: StaffUser) {
  requireAdmin(actor);
  return sorted(db).map((s) => toRecord(db, s));
}

function assertImage(db: MockDb, input: { imageId: string | null; active: boolean }, imagePath: string | null) {
  if (input.imageId && !db.media[input.imageId]) throw new ApiError("VALIDATION", "Upload the photo again");
  if (input.active && !input.imageId && !imagePath) throw new ApiError("NO_IMAGE", "Add a photo before showing this slide");
}

function keepOneLive(db: MockDb, id: string, staysActive: boolean) {
  if (!staysActive && !db.heroSlides.some((s) => s.id !== id && s.active)) throw new ApiError("LAST_SLIDE", "Keep at least one slide showing on the home page");
}

export function createHero(db: MockDb, actor: StaffUser, raw: unknown) {
  requireAdmin(actor);
  const input = parseSlide(raw);
  if (db.heroSlides.length >= MAX_SLIDES) throw new ApiError("LIMIT", `Keep the carousel to ${MAX_SLIDES} slides or fewer`);
  assertImage(db, input, null);
  const slide: HeroSlideRec = { ...input, id: newId("hero"), position: Math.max(-1, ...db.heroSlides.map((s) => s.position)) + 1, imagePath: null, updatedAt: nowIso() };
  db.heroSlides.push(slide);
  audit(db, actor, "hero.create", "Website", slide.id, `Slide “${slide.title}” added${slide.active ? "" : " (hidden)"}`);
  return toRecord(db, slide);
}

export function updateHero(db: MockDb, actor: StaffUser, id: string, raw: unknown) {
  requireAdmin(actor);
  const input = parseSlide(raw);
  const slide = db.heroSlides.find((s) => s.id === id);
  if (!slide) throw new ApiError("NOT_FOUND", "Slide not found");
  assertImage(db, input, slide.imagePath);
  keepOneLive(db, id, input.active);
  const toggled = slide.active !== input.active;
  Object.assign(slide, input, { updatedAt: nowIso() });
  audit(db, actor, "hero.update", "Website", id, `Slide “${slide.title}” edited${toggled ? (slide.active ? ", now shown" : ", now hidden") : ""}`);
  return toRecord(db, slide);
}

export function deleteHero(db: MockDb, actor: StaffUser, id: string) {
  requireAdmin(actor);
  const slide = db.heroSlides.find((s) => s.id === id);
  if (!slide) throw new ApiError("NOT_FOUND", "Slide not found");
  keepOneLive(db, id, false);
  db.heroSlides = db.heroSlides.filter((s) => s.id !== id);
  audit(db, actor, "hero.delete", "Website", id, `Slide “${slide.title}” removed`);
}

export function reorderHero(db: MockDb, actor: StaffUser, ids: string[]) {
  requireAdmin(actor);
  if (ids.length !== db.heroSlides.length || !db.heroSlides.every((s) => ids.includes(s.id))) throw new ApiError("VALIDATION", "The slide list changed — reload and try again");
  for (const s of db.heroSlides) s.position = ids.indexOf(s.id);
  audit(db, actor, "hero.reorder", "Website", "hero", "Slides reordered");
}

/** Demo uploads are kept as data URLs in the browser store. */
export function uploadMedia(db: MockDb, actor: StaffUser, dataUrl: string, width: number, height: number) {
  requireAdmin(actor);
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(dataUrl)) throw new ApiError("VALIDATION", "That file isn't a JPEG, PNG or WebP image");
  if ((dataUrl.length * 3) / 4 > MAX_MEDIA_BYTES) throw new ApiError("TOO_LARGE", "Images must be 4 MB or smaller");
  if (width < 800 || height < 300) throw new ApiError("VALIDATION", "Use a landscape photo at least 800 × 300 pixels");
  const id = newId("media");
  db.media[id] = dataUrl;
  return { id, url: dataUrl, width, height };
}
