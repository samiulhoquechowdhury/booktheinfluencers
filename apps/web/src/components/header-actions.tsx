"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CalendarDays, Heart, LayoutDashboard, LogOut, UserRound } from "lucide-react";
import { useSession, useSignOut } from "@/lib/api/hooks";
import { NotificationsBell } from "./notifications-bell";

export function HeaderActions() {
  const { data: session, isPending } = useSession();
  const signOut = useSignOut();
  const router = useRouter();

  if (isPending) return <div aria-hidden className="h-[42px] w-40 animate-pulse rounded-md bg-cream max-sm:hidden" />;

  if (!session) {
    return (
      <>
        <Link href="/sign-in" className="btn btn-sm btn-outline hidden sm:inline-flex">
          Sign in
        </Link>
        <Link href="/talent" className="btn btn-sm btn-dark hidden sm:inline-flex">
          Find talent
          <ArrowRight aria-hidden />
        </Link>
      </>
    );
  }

  const isTalent = session.roles.includes("TALENT");
  const isCustomer = session.roles.includes("CUSTOMER");
  const initials = session.name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <>
      {isCustomer && <NotificationsBell />}
      <Link
        href={isTalent && !isCustomer ? "/portal" : "/account"}
        className="btn btn-sm btn-outline hidden sm:inline-flex"
      >
        {isTalent && !isCustomer ? "Talent portal" : "My bookings"}
      </Link>
      <details className="relative">
        <summary
          aria-label="Account menu"
          className="grid size-10 cursor-pointer list-none place-items-center rounded-full bg-ink sm:size-[42px] font-display text-sm font-semibold text-warm [&::-webkit-details-marker]:hidden"
        >
          {initials || <UserRound className="size-5" aria-hidden />}
        </summary>
        <div className="absolute right-0 top-14 w-64 rounded-card border border-line bg-white p-2 shadow-card">
          <p className="px-3 pb-2 pt-1">
            <span className="block font-display text-sm font-semibold text-ink">{session.name}</span>
            <span className="text-xs text-muted">+91 {session.phone}</span>
          </p>
          <div className="border-t border-line pt-1">
            {isCustomer && (
              <>
                <MenuLink href="/account" icon={<LayoutDashboard className="size-4" />} label="My bookings" />
                <MenuLink href="/account/favourites" icon={<Heart className="size-4" />} label="Favourites" />
                <MenuLink href="/account/profile" icon={<UserRound className="size-4" />} label="Profile" />
              </>
            )}
            {isTalent && (
              <>
                <MenuLink href="/portal" icon={<LayoutDashboard className="size-4" />} label="Talent portal" />
                <MenuLink href="/portal/calendar" icon={<CalendarDays className="size-4" />} label="Blackout dates" />
              </>
            )}
            <button
              type="button"
              onClick={() => signOut.mutate(undefined, { onSuccess: () => router.push("/") })}
              className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm text-ink hover:bg-cream"
            >
              <LogOut className="size-4" aria-hidden />
              Sign out
            </button>
          </div>
        </div>
      </details>
    </>
  );
}

function MenuLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link href={href} className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm text-ink hover:bg-cream">
      <span aria-hidden className="text-muted">
        {icon}
      </span>
      {label}
    </Link>
  );
}
