"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { api, errorMessage } from "@/lib/api/client";

export function NewsletterForm() {
  const [email, setEmail] = useState("");
  const subscribe = useMutation({ mutationFn: () => api.newsletter.subscribe(email) });

  const status = subscribe.isError
    ? { tone: "text-rose-300", text: errorMessage(subscribe.error) }
    : subscribe.isSuccess
      ? {
          tone: "text-emerald-300",
          text: subscribe.data.alreadySubscribed ? "You're already on the list — thanks!" : "You're subscribed. Welcome aboard!",
        }
      : null;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        subscribe.mutate(undefined, { onSuccess: () => setEmail("") });
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
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (subscribe.isError || subscribe.isSuccess) subscribe.reset();
          }}
          placeholder="Email address"
          className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/40"
        />
        <button
          type="submit"
          aria-label="Subscribe"
          disabled={subscribe.isPending}
          className="grid size-9 shrink-0 place-items-center rounded-md bg-gradient-to-b from-warm to-gold text-ink transition-[filter] hover:brightness-105 disabled:opacity-60"
        >
          {subscribe.isPending ? <LoaderCircle className="size-[18px] animate-spin" aria-hidden /> : <ArrowRight className="size-[18px]" aria-hidden />}
        </button>
      </div>
      <p role="status" className={`mt-3 min-h-5 text-xs ${status?.tone ?? ""}`}>
        {status?.text}
      </p>
    </form>
  );
}
