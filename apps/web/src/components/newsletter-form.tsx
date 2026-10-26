"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";

// Not connected yet: there is no newsletter endpoint, so nothing is stored.
export function NewsletterForm() {
  const [submitted, setSubmitted] = useState(false);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        setSubmitted(true);
      }}
      className="mt-6"
    >
      <label htmlFor="newsletter-email" className="sr-only">
        Email address
      </label>
      <div className="flex items-center gap-2 rounded-md border border-white/15 bg-white/[0.03] p-1.5 pl-4 focus-within:border-warm/60">
        <input
          id="newsletter-email"
          type="email"
          required
          placeholder="Email address"
          className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/40"
        />
        <button
          type="submit"
          aria-label="Subscribe"
          className="grid size-9 shrink-0 place-items-center rounded-md bg-gradient-to-b from-warm to-gold text-ink transition-[filter] hover:brightness-105"
        >
          <ArrowRight className="size-[18px]" aria-hidden />
        </button>
      </div>
      <p role="status" className="mt-3 min-h-5 text-xs text-white/50">
        {submitted && "Thanks! Sign-ups open soon — we haven't stored your email yet."}
      </p>
    </form>
  );
}
