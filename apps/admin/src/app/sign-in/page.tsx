"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy, LoaderCircle, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { DEMO_OTP, STAFF_DEMO_PASSWORD, STAFF_USERS } from "@repo/mock/internal";
import { api, errorMessage, type PasswordStep } from "@/lib/api";
import { keys } from "@/lib/hooks";
import { inputClass } from "@/components/ui";

export default function StaffSignInPage() {
  const router = useRouter();
  const client = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [staffId, setStaffId] = useState<string | null>(null);
  const [setup, setSetup] = useState<PasswordStep["setup"]>();

  const step1 = useMutation({
    mutationFn: () => api.auth.password(email, password),
    onSuccess: (r) => {
      setStaffId(r.staffId);
      setSetup(r.setup);
    },
  });
  const step2 = useMutation({
    mutationFn: () => api.auth.totp(staffId!, code),
    onSuccess: (staff) => {
      client.setQueryData(keys.session, staff);
      router.replace("/");
    },
  });
  const error = step1.error ?? step2.error;

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="rounded-xl border border-line bg-white p-7 shadow-card">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-gold-deep">
            <ShieldCheck className="size-4" aria-hidden />
            Staff only
          </p>
          <h1 className="mt-3 text-2xl font-semibold text-ink">Sign in to the CRM</h1>

          {!staffId ? (
            <form
              className="mt-6 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                step1.mutate();
              }}
            >
              <label className="block text-sm font-medium text-ink">
                Work email
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" className={`${inputClass} mt-1.5`} />
              </label>
              <label className="block text-sm font-medium text-ink">
                Password
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" className={`${inputClass} mt-1.5`} />
              </label>
              {error && <p role="alert" className="text-sm text-rose-700">{errorMessage(error)}</p>}
              <button type="submit" disabled={step1.isPending} className="btn btn-dark w-full disabled:opacity-60">
                {step1.isPending && <LoaderCircle className="animate-spin" aria-hidden />}
                Continue
              </button>
            </form>
          ) : (
            <form
              className="mt-6 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                step2.mutate();
              }}
            >
              {setup ? (
                <div className="space-y-3 rounded-lg bg-cream p-4 text-sm">
                  <p className="font-semibold text-ink">Set up your authenticator</p>
                  <ol className="list-decimal space-y-1 pl-5 text-ink-soft">
                    <li>Open Google Authenticator, Microsoft Authenticator or 1Password.</li>
                    <li>Add an account with this setup key (time-based):</li>
                  </ol>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 break-all rounded-md bg-white px-3 py-2 font-mono text-xs tracking-wider text-ink ring-1 ring-line">{setup.secret.match(/.{1,4}/g)?.join(" ")}</code>
                    <button type="button" onClick={() => navigator.clipboard?.writeText(setup.secret).then(() => toast.success("Key copied"))} aria-label="Copy setup key" className="grid size-9 place-items-center rounded-md bg-white ring-1 ring-line hover:ring-gold">
                      <Copy className="size-4" aria-hidden />
                    </button>
                  </div>
                  <a href={setup.uri} className="inline-block text-xs font-medium text-gold-deep hover:underline">On your phone? Open it in your authenticator app</a>
                  <p className="text-ink-soft">Then enter the 6-digit code it shows.</p>
                </div>
              ) : (
                <p className="text-sm text-muted">Enter the 6-digit code from your authenticator app.</p>
              )}
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                aria-label="Authenticator code"
                className={`${inputClass} text-center text-2xl tracking-[0.5em]`}
              />
              {error && <p role="alert" className="text-sm text-rose-700">{errorMessage(error)}</p>}
              <button type="submit" disabled={step2.isPending || code.length !== 6} className="btn btn-gold w-full disabled:opacity-60">
                {step2.isPending && <LoaderCircle className="animate-spin" aria-hidden />}
                Verify
              </button>
              <button type="button" onClick={() => { setStaffId(null); setSetup(undefined); setCode(""); step2.reset(); }} className="w-full text-sm text-muted hover:text-ink">
                Use a different account
              </button>
            </form>
          )}
        </div>

        <div className="mt-5 rounded-xl border border-dashed border-line bg-white/70 p-4 text-xs leading-relaxed text-muted">
          <p className="font-semibold text-ink">Demo accounts</p>
          <p className="mt-1">
            Password <span className="font-semibold text-ink">{STAFF_DEMO_PASSWORD}</span>, authenticator code{" "}
            <span className="font-semibold text-ink">{DEMO_OTP}</span>.
          </p>
          <ul className="mt-2 grid gap-1">
            {STAFF_USERS.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => {
                    setEmail(s.email);
                    setPassword(STAFF_DEMO_PASSWORD);
                    setStaffId(null);
                  }}
                  className="text-left hover:text-ink"
                >
                  <span className="font-medium text-ink">{s.email}</span> — {s.roles[0]!.replace("_", " ").toLowerCase()}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </main>
  );
}
