import Link from "next/link";
import { Menu, Search } from "lucide-react";
import { BRAND_NAME, NAV_LINKS } from "@/lib/site";
import { HeaderActions } from "./header-actions";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 print:hidden h-[84px] border-b border-ink/8 bg-white/95 backdrop-blur-lg">
      <div className="shell flex h-full items-center justify-between gap-6">
        <Link href="/" className="shrink-0 font-serif text-xl font-semibold tracking-tight text-ink sm:text-2xl">
          {BRAND_NAME}
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-7 xl:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="font-display text-[0.9375rem] font-medium text-ink transition-colors hover:text-gold-deep"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Tighter on phones so logo + bell + avatar + menu fit in 360 px; search lives in the menu and hero there. */}
        <div className="flex items-center gap-1 sm:gap-3">
          <Link
            href="/talent"
            aria-label="Search talent"
            className="hidden size-10 place-items-center rounded-md text-ink transition-colors hover:bg-cream sm:grid"
          >
            <Search className="size-[22px]" strokeWidth={1.75} aria-hidden />
          </Link>
          <HeaderActions />

          <details className="relative xl:hidden">
            <summary
              aria-label="Open menu"
              className="grid size-10 cursor-pointer list-none place-items-center rounded-md text-ink hover:bg-cream [&::-webkit-details-marker]:hidden"
            >
              <Menu className="size-6" aria-hidden />
            </summary>
            <nav
              aria-label="Mobile"
              className="absolute right-0 top-12 w-64 rounded-card border border-line bg-white p-2 shadow-card"
            >
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="block rounded-md px-4 py-3 font-display text-[0.9375rem] font-medium text-ink hover:bg-cream"
                >
                  {link.label}
                </Link>
              ))}
              <div className="mt-2 grid gap-2 border-t border-line pt-3 sm:hidden">
                <Link href="/sign-in" className="btn btn-sm btn-outline">
                  Sign in
                </Link>
                <Link href="/account" className="btn btn-sm btn-dark">
                  My bookings
                </Link>
              </div>
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}
