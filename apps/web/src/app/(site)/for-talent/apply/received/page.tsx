import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { CheckCircle2 } from "lucide-react";
import { Spinner } from "@/components/ui/feedback";

export const metadata: Metadata = { title: "Application received", robots: { index: false } };

export default function ApplicationReceivedPage({ searchParams }: PageProps<"/for-talent/apply/received">) {
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

async function Received({ searchParams }: { searchParams: PageProps<"/for-talent/apply/received">["searchParams"] }) {
  const { ref } = await searchParams;
  if (typeof ref !== "string") redirect("/for-talent/apply");
  return (
    <div className="mx-auto max-w-xl rounded-card border border-line bg-white p-8 text-center sm:p-10">
      <CheckCircle2 className="mx-auto size-12 text-emerald-600" aria-hidden />
      <h1 className="mt-4 font-serif text-2xl font-semibold text-ink">Application received</h1>
      <p className="mt-2 text-muted">
        Your reference is <span className="font-display font-semibold text-gold-deep">{ref}</span>.
      </p>
      <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted">
        Our talent team reviews every application. If it's a fit, we'll get in touch and help you set up your artist profile.
      </p>
      <Link href="/for-talent" className="btn btn-outline mt-6">
        Back to For artists
      </Link>
    </div>
  );
}
