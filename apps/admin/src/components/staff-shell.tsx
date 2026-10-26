"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, CreditCard, ExternalLink, Inbox, LayoutDashboard, LogOut, Menu, ScrollText, Users, Wallet, X } from "lucide-react";
import type { StaffRole } from "@repo/mock/internal";
import { api, can, type StaffUser } from "@/lib/api";
import { useStaffSession } from "@/lib/hooks";
import { Loading } from "./ui";

const NAV: { href: string; label: string; icon: typeof LayoutDashboard; roles?: StaffRole[] }[] = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/pipeline", label: "Pipeline", icon: ClipboardList },
  { href: "/payments", label: "Payments", icon: CreditCard },
  { href: "/payouts", label: "Payouts", icon: Wallet, roles: ["ACCOUNTS"] },
  { href: "/talents", label: "Talents", icon: Users },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/audit", label: "Audit log", icon: ScrollText, roles: ["SUPER_ADMIN"] },
];

const ROLE_LABELS: Record<StaffRole, string> = {
  SUPER_ADMIN: "Super admin",
  SALES: "Sales",
  TALENT_MANAGER: "Talent manager",
  OPS: "Operations",
  ACCOUNTS: "Accounts",
};

/** Signed-in staff chrome. Hides sections a role can't use; the API still checks every call. */
export function StaffShell({ children }: { children: ReactNode }) {
  const { data: staff, isPending } = useStaffSession();
  const router = useRouter();

  useEffect(() => {
    if (!isPending && !staff) router.replace("/sign-in");
  }, [isPending, staff, router]);

  if (isPending || !staff) return <Loading label="Checking your session" />;
  return <Shell staff={staff}>{children}</Shell>;
}

function Shell({ staff, children }: { staff: StaffUser; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const signOut = useMutation({
    mutationFn: api.auth.signOut,
    onSuccess: () => {
      client.clear();
      router.replace("/sign-in");
    },
  });
  const links = NAV.filter((item) => !item.roles || can(staff, ...item.roles));

  const nav = (
    <nav aria-label="CRM" className="space-y-1">
      {links.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            onClick={() => setOpen(false)}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              active ? "bg-white/10 text-white" : "text-white/65 hover:bg-white/5 hover:text-white"
            }`}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );

  const footer = (
    <div className="space-y-3 border-t border-white/10 pt-4">
      {/* The public site is outside this app's /admin basePath, so <Link> would prefix it. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a href="/" className="flex items-center gap-2 px-3 text-xs text-white/55 hover:text-white">
        <ExternalLink className="size-3.5" aria-hidden />
        Open the public site
      </a>
      <div className="px-3">
        <p className="text-sm font-medium text-white">{staff.name}</p>
        <p className="text-xs text-white/55">{staff.roles.map((r) => ROLE_LABELS[r]).join(", ")}</p>
      </div>
      <button
        type="button"
        onClick={() => signOut.mutate()}
        className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-white/65 hover:bg-white/5 hover:text-white"
      >
        <LogOut className="size-4" aria-hidden />
        Sign out
      </button>
    </div>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[232px_1fr]">
      <aside className="hidden flex-col justify-between bg-ink px-3 py-5 lg:sticky lg:top-0 lg:flex lg:h-screen">
        <div>
          <p className="mb-6 px-3 text-sm font-semibold tracking-wide text-warm">Booking CRM</p>
          {nav}
        </div>
        {footer}
      </aside>

      <div className="sticky top-0 z-30 flex items-center justify-between bg-ink px-4 py-3 lg:hidden">
        <p className="text-sm font-semibold text-warm">Booking CRM</p>
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Menu" className="text-white">
          {open ? <X className="size-6" aria-hidden /> : <Menu className="size-6" aria-hidden />}
        </button>
      </div>
      {open && (
        <div className="space-y-4 bg-ink px-3 pb-4 lg:hidden">
          {nav}
          {footer}
        </div>
      )}

      <main className="min-w-0 px-4 py-6 sm:px-8 sm:py-8">{children}</main>
    </div>
  );
}
