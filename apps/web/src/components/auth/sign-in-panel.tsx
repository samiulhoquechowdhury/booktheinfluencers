"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { DEMO_CUSTOMER_PHONE, TALENT_LOGINS } from "@repo/mock/internal";
import { OtpForm } from "./otp-form";

/** Only same-site paths are honoured as a redirect target. */
function safeNext(value: string | null) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : null;
}

export function SignInPanel() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [as, setAs] = useState<"customer" | "talent">(params.get("as") === "talent" ? "talent" : "customer");
  const talentPhone = Object.keys(TALENT_LOGINS)[0]!;

  return (
    <div className="w-full max-w-md">
      <div className="rounded-card border border-line bg-white p-7 shadow-card sm:p-9">
        <h1 className="font-serif text-3xl font-semibold text-ink">Sign in</h1>
        <p className="mt-2 text-sm text-muted">
          {as === "customer"
            ? "Use your mobile number. New here? We'll create your account when you verify."
            : "Use your mobile number. New here? You'll set up your artist profile next, and it goes live once we've verified it."}
        </p>

        <div role="tablist" aria-label="Account type" className="mt-6 grid grid-cols-2 rounded-md bg-cream p-1">
          {(["customer", "talent"] as const).map((option) => (
            <button
              key={option}
              role="tab"
              type="button"
              aria-selected={as === option}
              onClick={() => setAs(option)}
              className={`rounded px-3 py-2 font-display text-sm font-semibold transition-colors ${
                as === option ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink"
              }`}
            >
              {option === "customer" ? "Booking an artist" : "Talent / rep"}
            </button>
          ))}
        </div>

        <div className="mt-6" role="tabpanel">
          <OtpForm
            key={as}
            as={as}
            onVerified={(session) => {
              const home = session.roles.includes("TALENT") && as === "talent" ? "/portal" : "/account";
              router.push(next ?? home);
            }}
          />
        </div>
      </div>

      <div className="mt-5 rounded-card border border-dashed border-line bg-white/60 p-5 text-xs leading-relaxed text-muted">
        <p className="font-display font-semibold text-ink">Demo accounts</p>
        <p className="mt-1">
          Customer with sample bookings: <span className="font-semibold text-ink">{DEMO_CUSTOMER_PHONE}</span>. Talent
          (Aanya Kapoor): <span className="font-semibold text-ink">{talentPhone}</span>. Any other number creates a new
          customer, or a new artist on the Talent tab. The code is always 123456.
        </p>
      </div>
    </div>
  );
}
