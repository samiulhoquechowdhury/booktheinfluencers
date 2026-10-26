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

// TODO: replace "#" with the real profile URLs once the accounts exist.
export const SOCIAL_LINKS = [
  { id: "instagram", label: "Instagram", href: "#" },
  { id: "linkedin", label: "LinkedIn", href: "#" },
  { id: "youtube", label: "YouTube", href: "#" },
] as const;

export const SUPPORT = { phone: "+91 90000 12345", whatsapp: "919000012345", email: "hello@example.com" };
