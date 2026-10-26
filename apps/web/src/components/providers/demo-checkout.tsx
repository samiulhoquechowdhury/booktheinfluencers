"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, CheckCircle2, CreditCard, LoaderCircle, Lock, Smartphone, XCircle } from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api/client";
import { keys } from "@/lib/api/hooks";
import { inr } from "@/lib/format";
import { BRAND_NAME } from "@/lib/site";
import { RequireSession } from "@/components/auth/require-session";
import { ErrorState, Spinner } from "@/components/ui/feedback";

const METHODS = [
  { id: "UPI", label: "UPI", icon: Smartphone },
  { id: "Card", label: "Card", icon: CreditCard },
  { id: "Net banking", label: "Net banking", icon: Building2 },
] as const;

/** Stand-in for the payment gateway's hosted checkout (PAY-1/2). It never writes payment state itself. */
export function DemoCheckout({ milestoneId }: { milestoneId: string }) {
  return <RequireSession role="CUSTOMER">{() => <Checkout milestoneId={milestoneId} />}</RequireSession>;
}

function Checkout({ milestoneId }: { milestoneId: string }) {
  const router = useRouter();
  const client = useQueryClient();
  const [method, setMethod] = useState<(typeof METHODS)[number]["id"]>("UPI");
  const [failed, setFailed] = useState(false);
  const details = useQuery({ queryKey: ["checkout", milestoneId], queryFn: () => api.providers.checkoutDetails(milestoneId) });

  const pay = useMutation({
    mutationFn: (outcome: "success" | "failure") => api.providers.pay(milestoneId, method, outcome),
    onSuccess: (result) => {
      void client.invalidateQueries({ queryKey: keys.bookings });
      if (result.outcome === "failure") {
        setFailed(true);
        return;
      }
      toast.success("Payment received. Thank you!");
      router.push(`/account/bookings/${details.data!.leadId}`);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (details.isPending) return <Spinner label="Opening secure checkout" />;
  if (details.error) return <ErrorState message={errorMessage(details.error)} />;
  const d = details.data;

  if (d.status === "PAID") {
    return (
      <Shell>
        <div className="p-8 text-center">
          <CheckCircle2 className="mx-auto size-12 text-emerald-600" aria-hidden />
          <p className="mt-4 font-display text-lg font-semibold text-ink">This payment is already complete</p>
          <Link href={`/account/bookings/${d.leadId}`} className="btn btn-dark mt-6">
            Back to booking
          </Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="border-b border-line bg-cream-soft px-6 py-5">
        <p className="text-xs uppercase tracking-wider text-muted">Paying {BRAND_NAME}</p>
        <p className="mt-1 font-serif text-3xl font-semibold text-ink">{inr(d.amountPaise)}</p>
        <p className="mt-1 text-sm text-muted">
          {d.label} · booking {d.ref}
        </p>
      </div>

      <div className="p-6">
        <p className="text-sm font-medium text-ink">Pay with</p>
        <div role="radiogroup" aria-label="Payment method" className="mt-3 grid grid-cols-3 gap-2">
          {METHODS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={method === id}
              onClick={() => setMethod(id)}
              className={`flex flex-col items-center gap-1.5 rounded-xl border px-3 py-4 text-sm font-medium transition-colors ${
                method === id ? "border-ink bg-ink text-white" : "border-line text-ink hover:border-ink/40"
              }`}
            >
              <Icon className="size-5" aria-hidden />
              {label}
            </button>
          ))}
        </div>

        <p className="mt-5 rounded-lg bg-violet-50 px-4 py-3 text-xs leading-relaxed text-violet-900">
          Demo checkout: no real payment details are collected and no money moves. In production this is the payment
          gateway's own page, and your booking updates when the gateway confirms the payment to us.
        </p>

        {failed && (
          <p role="alert" className="mt-4 flex items-center gap-2 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-800">
            <XCircle className="size-4 shrink-0" aria-hidden />
            The payment didn't go through and you haven't been charged. Try again or pick another method.
          </p>
        )}

        <div className="mt-6 grid gap-2">
          <button type="button" disabled={pay.isPending} onClick={() => pay.mutate("success")} className="btn btn-gold w-full disabled:opacity-60">
            {pay.isPending ? <LoaderCircle className="animate-spin" aria-hidden /> : <Lock aria-hidden />}
            Pay {inr(d.amountPaise)}
          </button>
          <button
            type="button"
            disabled={pay.isPending}
            onClick={() => pay.mutate("failure")}
            className="text-sm text-muted hover:text-ink disabled:opacity-60"
          >
            Simulate a failed payment
          </button>
        </div>
      </div>
      <div className="border-t border-line px-6 py-4 text-center">
        <Link href={`/account/bookings/${d.leadId}`} className="text-sm text-muted hover:text-ink">
          Cancel and go back
        </Link>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-md">
      <p className="mb-4 flex items-center justify-center gap-2 text-sm text-muted">
        <Lock className="size-4" aria-hidden />
        Secure checkout · demo
      </p>
      <div className="overflow-hidden rounded-card border border-line bg-white shadow-card">{children}</div>
    </div>
  );
}
