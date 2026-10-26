import type { MetadataRoute } from "next";
import { CATEGORIES, CITIES, TALENTS } from "@repo/mock/catalogue/data";
import { SITE_URL } from "@/lib/site";

/** NFR-9 / CAT-10: public pages only. */
export default function sitemap(): MetadataRoute.Sitemap {
  const pages = ["", "/talent", "/categories", "/how-it-works", "/for-talent", "/for-talent/apply", "/about", "/contact", "/enquiry", "/terms", "/privacy", "/cancellation-policy"];
  return [
    ...pages.map((path) => ({ url: `${SITE_URL}${path}` })),
    ...CATEGORIES.map((c) => ({ url: `${SITE_URL}/categories/${c.slug}` })),
    ...CITIES.map((c) => ({ url: `${SITE_URL}/cities/${c.slug}` })),
    ...TALENTS.map((t) => ({ url: `${SITE_URL}/talent/${t.slug}` })),
  ];
}
