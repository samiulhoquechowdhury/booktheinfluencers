"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Menu, X } from "lucide-react";
import { useSession } from "@/lib/api/hooks";
import { BRAND_NAME, NAV_LINKS } from "@/lib/site";

/**
 * The menu below the xl breakpoint: a drawer sliding in from the right. A modal <dialog> gets out of the header
 * (its backdrop-blur would otherwise trap a fixed panel), keeps focus inside and closes on Escape.
 */
export function MobileNav() {
  const { data: session, isPending } = useSession();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const drawer = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = drawer.current;
    if (!open || !dialog) return;
    dialog.showModal();
    document.documentElement.style.overflow = "hidden";
    const close = () => setOpen(false);
    // Past xl the drawer is hidden, and an open modal would leave the page behind it unclickable.
    const wide = window.matchMedia("(min-width: 80rem)");
    wide.addEventListener("change", close);
    window.addEventListener("popstate", close);
    return () => {
      dialog.close();
      document.documentElement.style.overflow = "";
      wide.removeEventListener("change", close);
      window.removeEventListener("popstate", close);
    };
  }, [open]);

  const portalOnly = session?.roles.includes("TALENT") && !session.roles.includes("CUSTOMER");

  return (
    <div className="xl:hidden">
      <button
        type="button"
        aria-label="Open menu"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="grid size-10 cursor-pointer place-items-center rounded-md text-ink hover:bg-cream"
      >
        <Menu className="size-6" aria-hidden />
      </button>

      <dialog
        ref={drawer}
        aria-label="Menu"
        onClose={() => setOpen(false)}
        // Only the backdrop lands on the dialog itself, as the panel inside fills it.
        onClick={(e) => {
          if (e.target === e.currentTarget || (e.target as HTMLElement).closest("a")) setOpen(false);
        }}
        className="m-0 ml-auto h-dvh max-h-none w-[min(20rem,85vw)] max-w-none translate-x-full bg-white text-ink shadow-card transition-[translate,display,overlay] transition-discrete duration-300 ease-out backdrop:bg-ink/50 backdrop:opacity-0 backdrop:transition-[opacity,display,overlay] backdrop:transition-discrete backdrop:duration-300 open:translate-x-0 open:backdrop:opacity-100 starting:open:translate-x-full starting:open:backdrop:opacity-0 motion-reduce:transition-none motion-reduce:backdrop:transition-none"
      >
        <div className="flex h-full flex-col">
          <div className="flex h-[84px] shrink-0 items-center justify-between gap-3 border-b border-line pl-5 pr-3">
            <Link href="/" className="truncate font-serif text-xl font-semibold tracking-tight text-ink">
              {BRAND_NAME}
            </Link>
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setOpen(false)}
              className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-md text-ink hover:bg-cream"
            >
              <X className="size-6" aria-hidden />
            </button>
          </div>

          <nav aria-label="Mobile" className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain p-3">
            {NAV_LINKS.map((link) => {
              const current = pathname === link.href || pathname.startsWith(`${link.href}/`);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={current ? "page" : undefined}
                  className={`block rounded-md px-4 py-3.5 font-display text-base font-medium hover:bg-cream ${current ? "bg-cream text-gold-deep" : "text-ink"}`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

          {!isPending && (
            <div className="grid shrink-0 gap-2 border-t border-line p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {session ? (
                <>
                  <p className="truncate px-1 pb-1 font-display text-sm font-semibold text-ink">{session.name}</p>
                  <Link href={portalOnly ? "/portal" : "/account"} className="btn btn-sm btn-dark">
                    {portalOnly ? "Talent portal" : "My bookings"}
                  </Link>
                </>
              ) : (
                <>
                  <Link href="/sign-in" className="btn btn-sm btn-outline">
                    Sign in
                  </Link>
                  <Link href="/talent" className="btn btn-sm btn-dark">
                    Find talent
                    <ArrowRight aria-hidden />
                  </Link>
                </>
              )}
            </div>
          )}
        </div>
      </dialog>
    </div>
  );
}
