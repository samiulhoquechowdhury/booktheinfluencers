/** Placeholder until the brand is decided (docs/memory.md → open questions). */
export const BRAND_NAME = "BookTheInfluencer";

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export const NAV_LINKS = [
  { href: "/talent", label: "Explore talent" },
  { href: "/categories", label: "Categories" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/for-talent", label: "For artists" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
] as const;

/** Social handle used for every profile link — confirm the accounts are registered before launch. */
export const SOCIAL_HANDLE = "booktheinfluencer";

export const SOCIAL_LINKS = [
  { id: "instagram", label: "Instagram", href: `https://www.instagram.com/${SOCIAL_HANDLE}` },
  { id: "linkedin", label: "LinkedIn", href: `https://www.linkedin.com/company/${SOCIAL_HANDLE}` },
  { id: "youtube", label: "YouTube", href: `https://www.youtube.com/@${SOCIAL_HANDLE}` },
] as const;
