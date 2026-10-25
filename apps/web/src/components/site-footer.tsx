import Link from "next/link";
import { BRAND_NAME } from "@/lib/site";
import { CATEGORIES } from "@/lib/mock/home";
import { CopyrightYear } from "./copyright-year";

const COLUMNS = [
  {
    title: "Discover",
    links: CATEGORIES.map(({ slug, label }) => ({ href: `/talent?category=${slug}`, label })),
  },
  {
    title: "Company",
    links: [
      { href: "/about", label: "About us" },
      { href: "/#how-it-works", label: "How it works" },
      { href: "/contact", label: "Contact" },
    ],
  },
  {
    title: "For talent",
    links: [
      { href: "/for-talent", label: "Join as talent" },
      { href: "/sign-in", label: "Talent sign in" },
    ],
  },
];

const LEGAL = [
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
  { href: "/cancellation-policy", label: "Cancellation policy" },
];

export function SiteFooter() {
  return (
    <footer className="bg-cream pt-16">
      <div className="shell grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <div className="max-w-xs">
          <Link href="/" className="font-serif text-xl font-semibold text-ink">
            {BRAND_NAME}
          </Link>
          <p className="mt-4 text-sm leading-relaxed text-muted">
            Managed talent booking for corporate events, weddings, festivals and brand campaigns
            across India.
          </p>
        </div>

        {COLUMNS.map((column) => (
          <nav key={column.title} aria-label={column.title}>
            <h2 className="eyebrow text-ink">{column.title}</h2>
            <ul className="mt-4 space-y-2.5">
              {column.links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-muted transition-colors hover:text-ink">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div className="shell mt-14 flex flex-col gap-4 border-t border-line py-6 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
        <p>
          © <CopyrightYear /> {BRAND_NAME}. Artist names and images are shown for
          discovery only and do not imply endorsement.
        </p>
        <ul className="flex gap-5">
          {LEGAL.map((link) => (
            <li key={link.href}>
              <Link href={link.href} className="hover:text-ink">
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </footer>
  );
}
