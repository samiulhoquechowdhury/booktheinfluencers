"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { INDIAN_MOBILE } from "@repo/schemas";
import { api, errorMessage, type Session } from "@/lib/api/client";
import { keys } from "@/lib/api/hooks";
import { DEMO_OTP } from "@repo/mock/internal";

const inputClass =
  "w-full rounded-md border border-line bg-white px-4 py-3 text-ink outline-none transition-colors focus:border-gold aria-[invalid=true]:border-rose-400";

/** Two-step phone OTP. Used by sign-in and at the end of the enquiry form (AUTH-4). */
export function OtpForm({
  as,
  defaultPhone = "",
  askName = false,
  defaultName = "",
  submitLabel = "Verify and continue",
  onVerified,
}: {
  as: "customer" | "talent";
  defaultPhone?: string;
  askName?: boolean;
  defaultName?: string;
  submitLabel?: string;
  onVerified: (session: Session) => void | Promise<void>;
}) {
  const client = useQueryClient();
  const [phone, setPhone] = useState(defaultPhone);
  const [name, setName] = useState(defaultName);
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const send = useMutation({
    mutationFn: () => api.auth.requestOtp(phone),
    onSuccess: (result) => {
      setSentTo(result.sentTo);
      setCooldown(result.resendInSeconds);
      setError(null);
    },
    onError: (e) => setError(errorMessage(e)),
  });

  const verify = useMutation({
    mutationFn: () => api.auth.verifyOtp({ phone, code, name, as }),
    onSuccess: async (session) => {
      client.setQueryData(keys.session, session);
      await onVerified(session);
    },
    onError: (e) => setError(errorMessage(e)),
  });

  if (!sentTo) {
    return (
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (!INDIAN_MOBILE.test(phone)) return setError("Enter a 10-digit Indian mobile number");
          if (askName && name.trim().length < 2) return setError("Enter your name");
          send.mutate();
        }}
        className="space-y-4"
      >
        {askName && (
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">Your name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" className={inputClass} />
          </label>
        )}
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink">Mobile number</span>
          <span className="flex">
            <span className="grid place-items-center rounded-l-md border border-r-0 border-line bg-cream px-3 text-sm text-ink-soft">
              +91
            </span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
              inputMode="numeric"
              autoComplete="tel-national"
              placeholder="98765 43210"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "otp-error" : undefined}
              className={`${inputClass} rounded-l-none`}
            />
          </span>
        </label>
        {error && (
          <p id="otp-error" role="alert" className="text-sm text-rose-700">
            {error}
          </p>
        )}
        <button type="submit" disabled={send.isPending} className="btn btn-dark w-full disabled:opacity-60">
          {send.isPending ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
          Send code
          {!send.isPending && <ArrowRight aria-hidden />}
        </button>
      </form>
    );
  }

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (!/^\d{6}$/.test(code)) return setError("Enter the 6-digit code");
        verify.mutate();
      }}
      className="space-y-4"
    >
      <p className="text-sm text-muted">
        We sent a 6-digit code to <span className="font-semibold text-ink">+91 {sentTo}</span>.{" "}
        <button type="button" onClick={() => setSentTo(null)} className="font-medium text-gold-deep underline-offset-2 hover:underline">
          Change number
        </button>
      </p>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-ink">Verification code</span>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          aria-invalid={Boolean(error)}
          aria-describedby="otp-hint"
          className={`${inputClass} text-center font-display text-2xl tracking-[0.5em]`}
        />
      </label>
      <p id="otp-hint" className="rounded-md bg-cream-soft px-3 py-2 text-xs text-muted">
        Demo mode: no SMS is sent. Use code <span className="font-semibold text-ink">{DEMO_OTP}</span>.
      </p>
      {error && (
        <p role="alert" className="text-sm text-rose-700">
          {error}
        </p>
      )}
      <button type="submit" disabled={verify.isPending} className="btn btn-gold w-full disabled:opacity-60">
        {verify.isPending ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
        {submitLabel}
      </button>
      <button
        type="button"
        disabled={cooldown > 0 || send.isPending}
        onClick={() => send.mutate()}
        className="w-full text-center text-sm text-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
      >
        {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
      </button>
    </form>
  );
}
