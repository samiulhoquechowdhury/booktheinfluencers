import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Spinner } from "@/components/ui/feedback";

export const metadata: Metadata = { title: "Brief received", robots: { index: false } };

export default function EnquiryReceivedPage({ searchParams }: PageProps<"/enquiry/received">) {
  return (
    <div className="flex-1 bg-cream-soft">
      <div className="shell py-12 sm:py-16">
        <Suspense fallback={<Spinner />}>
          <Received searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}

async function Received({ searchParams }: { searchParams: PageProps<"/enquiry/received">["searchParams"] }) {
  const { ref, lead } = await searchParams;
  if (typeof ref !== "string" || typeof lead !== "string") redirect("/account");
  return (
    <div className="mx-auto max-w-xl rounded-card border border-line bg-white p-8 text-center shadow-card sm:p-10">
      <CheckCircle2 className="mx-auto size-14 text-emerald-600" aria-hidden />
      <h1 className="mt-5 font-serif text-3xl font-semibold text-ink">Brief received</h1>
      <p className="mt-3 text-muted">Your reference number is</p>
      <p className="mt-1 font-display text-2xl font-bold tracking-wide text-gold-deep">{ref}</p>
      <p className="mx-auto mt-5 max-w-md text-sm leading-relaxed text-muted">
        We've sent the same reference to your phone and email. A booking manager will call you shortly to go through the
        details, then check each artist's availability.
      </p>
      <p className="mt-2 text-xs text-muted">(Demo mode: no SMS or email is actually sent.)</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href={`/account/bookings/${encodeURIComponent(lead)}`} className="btn btn-dark">
          Track this booking
          <ArrowRight aria-hidden />
        </Link>
        <Link href="/talent" className="btn btn-outline">
          Keep browsing
        </Link>
      </div>
    </div>
  );
}
