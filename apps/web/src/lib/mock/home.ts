// Sample content for the home page until the catalogue API is wired in.
// Names are fictional; photos are Unsplash stock.

export type Representation = "TALENT_MANAGED" | "AGENCY_MANAGED" | "PLATFORM_COORDINATED";

export type FeaturedTalent = {
  slug: string;
  name: string;
  role: string;
  city: string;
  languages: string[];
  representation: Representation;
  verified: boolean;
  /** Indicative fee band in paise — never an exact fee. */
  feeMinPaise: bigint;
  feeMaxPaise: bigint;
  photo: string;
};

export const REPRESENTATION_LABELS: Record<Representation, string> = {
  TALENT_MANAGED: "Talent-managed",
  AGENCY_MANAGED: "Agency-managed",
  PLATFORM_COORDINATED: "Platform-coordinated",
};

const unsplash = (id: string) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop`;

export const CATEGORIES = [
  { slug: "singers", label: "Singers", icon: "MicVocal" },
  { slug: "djs", label: "DJs", icon: "Disc3" },
  { slug: "comedians", label: "Comedians", icon: "Drama" },
  { slug: "anchors-speakers", label: "Anchors & speakers", icon: "Presentation" },
  { slug: "creators", label: "Creators", icon: "Sparkles" },
] as const;

export const CITIES = ["Mumbai", "Delhi NCR", "Bengaluru", "Goa", "Hyderabad", "Chennai"] as const;

export const BUDGET_BANDS = [
  { id: "under-1l", maxPaise: 10_000_000n },
  { id: "1l-5l", minPaise: 10_000_000n, maxPaise: 50_000_000n },
  { id: "5l-15l", minPaise: 50_000_000n, maxPaise: 150_000_000n },
  { id: "15l-plus", minPaise: 150_000_000n },
] as const;

export const FEATURED_TALENT: FeaturedTalent[] = [
  {
    slug: "aanya-kapoor",
    name: "Aanya Kapoor",
    role: "Live & playback singer",
    city: "Mumbai",
    languages: ["Hindi", "Punjabi"],
    representation: "AGENCY_MANAGED",
    verified: true,
    feeMinPaise: 30_000_000n,
    feeMaxPaise: 60_000_000n,
    photo: unsplash("1494790108377-be9c29b29330"),
  },
  {
    slug: "kabir-malhotra",
    name: "Kabir Malhotra",
    role: "Stand-up comedian",
    city: "Bengaluru",
    languages: ["English", "Hindi"],
    representation: "TALENT_MANAGED",
    verified: true,
    feeMinPaise: 15_000_000n,
    feeMaxPaise: 30_000_000n,
    photo: unsplash("1500648767791-00dcc994a43e"),
  },
  {
    slug: "dj-rhea",
    name: "DJ Rhea",
    role: "House & Bollywood DJ",
    city: "Goa",
    languages: ["English"],
    representation: "TALENT_MANAGED",
    verified: true,
    feeMinPaise: 8_000_000n,
    feeMaxPaise: 20_000_000n,
    photo: unsplash("1470225620780-dba8ba36b745"),
  },
  {
    slug: "arjun-sethi",
    name: "Arjun Sethi",
    role: "Anchor & emcee",
    city: "Delhi NCR",
    languages: ["Hindi", "English"],
    representation: "PLATFORM_COORDINATED",
    verified: true,
    feeMinPaise: 7_500_000n,
    feeMaxPaise: 15_000_000n,
    photo: unsplash("1507003211169-0a1dd7228f2d"),
  },
  {
    slug: "meera-iyer",
    name: "Meera Iyer",
    role: "Lifestyle creator",
    city: "Chennai",
    languages: ["Tamil", "English"],
    representation: "AGENCY_MANAGED",
    verified: false,
    feeMinPaise: 10_000_000n,
    feeMaxPaise: 25_000_000n,
    photo: unsplash("1534528741775-53994a69daeb"),
  },
  {
    slug: "vikram-rao",
    name: "Vikram Rao",
    role: "Keynote speaker",
    city: "Hyderabad",
    languages: ["English", "Telugu"],
    representation: "TALENT_MANAGED",
    verified: true,
    feeMinPaise: 20_000_000n,
    feeMaxPaise: 40_000_000n,
    photo: unsplash("1506794778202-cad84cf45f1d"),
  },
];

export const OCCASIONS = [
  {
    title: "Corporate events",
    blurb: "Annual days, offsites, award nights and product launches.",
    photo: unsplash("1540575467063-178a50c2df87"),
  },
  {
    title: "Weddings & sangeets",
    blurb: "Singers, DJs and hosts for every function of the week.",
    photo: unsplash("1519741497674-611481863552"),
  },
  {
    title: "College festivals",
    blurb: "Headliners and comedy nights for campus fests.",
    photo: unsplash("1524368535928-5b5e00ddc76b"),
  },
  {
    title: "Brand campaigns",
    blurb: "Creators and celebrities for launches and content.",
    photo: unsplash("1492684223066-81342ee5ff30"),
  },
] as const;

export const IMAGES = {
  promise: unsplash("1493225457124-a3eb161ffa5f"),
  forTalent: unsplash("1516280440614-37939bbacd81"),
  cta: unsplash("1459749411175-04bf5292ceea"),
} as const;
