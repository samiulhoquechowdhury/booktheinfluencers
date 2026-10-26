import type { Metadata } from "next";
import { Suspense } from "react";
import { AccountNav } from "@/components/account/account-nav";

export const metadata: Metadata = { title: "My account", robots: { index: false } };

export default function AccountLayout({ children }: LayoutProps<"/account">) {
  return (
    <div className="flex-1 bg-cream-soft">
      <div className="shell py-10 sm:py-14">
        {/* The tabs read the URL, which is dynamic on /account/bookings/[leadId]. */}
        <Suspense fallback={<div aria-hidden className="h-11 rounded-md bg-cream" />}>
          <AccountNav />
        </Suspense>
        <div className="mt-8">{children}</div>
      </div>
    </div>
  );
}
