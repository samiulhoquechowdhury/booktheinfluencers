"use client";

import Link from "next/link";

export default function SiteError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="shell flex flex-1 flex-col items-center justify-center py-24 text-center">
      <h1 className="font-serif text-3xl font-semibold text-ink">Something went wrong</h1>
      <p className="mt-3 max-w-md text-muted">Sorry about that. Try again, or head back home.</p>
      <div className="mt-8 flex gap-3">
        <button type="button" onClick={reset} className="btn btn-dark">
          Try again
        </button>
        <Link href="/" className="btn btn-outline">
          Home
        </Link>
      </div>
    </div>
  );
}
