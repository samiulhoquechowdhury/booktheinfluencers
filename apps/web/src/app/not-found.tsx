import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main className="flex flex-1 items-center bg-cream-soft">
        <div className="shell py-24 text-center">
          <p className="font-serif text-7xl font-semibold text-gold">404</p>
          <h1 className="mt-4 font-serif text-3xl font-semibold text-ink">This page has left the stage</h1>
          <p className="mx-auto mt-3 max-w-md text-muted">
            The link may be old or mistyped. Let's get you back to finding the right act.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/talent" className="btn btn-gold">
              Explore talent
              <ArrowRight aria-hidden />
            </Link>
            <Link href="/" className="btn btn-outline">
              Home
            </Link>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
