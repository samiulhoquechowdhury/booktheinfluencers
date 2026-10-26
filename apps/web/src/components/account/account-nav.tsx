"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/account", label: "Bookings" },
  { href: "/account/favourites", label: "Favourites" },
  { href: "/account/profile", label: "Profile" },
];

export function AccountNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Account" className="print:hidden flex gap-1 overflow-x-auto rounded-md bg-cream p-1">
      {LINKS.map((link) => {
        const active = link.href === "/account" ? pathname === "/account" || pathname.startsWith("/account/bookings") : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap rounded px-4 py-2 font-display text-sm font-semibold transition-colors ${
              active ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
