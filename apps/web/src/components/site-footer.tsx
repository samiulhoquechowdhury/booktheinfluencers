import Link from "next/link";
import { BRAND_NAME, SOCIAL_LINKS } from "@/lib/site";
import { CopyrightYear } from "./copyright-year";
import { NewsletterForm } from "./newsletter-form";
import { InstagramIcon, LinkedInIcon, YouTubeIcon } from "./social-icons";

const COLUMNS = [
  {
    title: "Discover",
    links: [
      { href: "/talent", label: "Explore talent" },
      { href: "/categories", label: "Categories" },
      { href: "/how-it-works", label: "How it works" },
      { href: "/compare", label: "Compare artists" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/about", label: "About us" },
      { href: "/for-talent", label: "For artists" },
      { href: "/contact", label: "Contact" },
    ],
  },
];

const SOCIAL_ICONS = { instagram: InstagramIcon, linkedin: LinkedInIcon, youtube: YouTubeIcon };

const LEGAL = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/cancellation-policy", label: "Cancellation policy" },
];

export function SiteFooter() {
  return (
    <footer className="bg-ink pt-16 print:hidden text-white sm:pt-20">
      <div className="shell grid gap-12 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1.4fr] lg:gap-10">
        <div>
          <Link href="/" className="font-serif text-2xl font-semibold tracking-tight">
            {BRAND_NAME}
          </Link>
          <p className="mt-3 text-sm text-white/60">
            Verified talent · Written contracts · Protected payments
          </p>
          <ul className="mt-6 flex gap-3">
            {SOCIAL_LINKS.map(({ id, label, href }) => {
              const Icon = SOCIAL_ICONS[id];
              return (
                <li key={id}>
                  <a
                    href={href}
                    aria-label={label}
                    className="grid size-10 place-items-center rounded-full border border-white/20 text-white/80 transition-colors hover:border-warm hover:text-warm"
                  >
                    <Icon className="size-[18px]" aria-hidden />
                  </a>
                </li>
              );
            })}
          </ul>
        </div>

        {COLUMNS.map((column) => (
          <nav key={column.title} aria-label={column.title}>
            <h2 className="font-display text-[0.9375rem] font-semibold">{column.title}</h2>
            <ul className="mt-6 space-y-3.5">
              {column.links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-white/60 transition-colors hover:text-warm">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}

        <div>
          <h2 className="font-display text-[0.9375rem] font-semibold">Stay in the know</h2>
          <p className="mt-6 text-sm text-white/60">New artists and event ideas, straight to your inbox.</p>
          <NewsletterForm />
        </div>
      </div>

      <div className="shell mt-14">
        <div className="flex flex-col gap-4 border-t border-white/10 py-7 text-xs text-white/45 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © <CopyrightYear /> {BRAND_NAME}. Artist names and images are shown for discovery only
            and do not imply endorsement.
          </p>
          <ul className="flex gap-4">
            {LEGAL.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="transition-colors hover:text-white">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}
