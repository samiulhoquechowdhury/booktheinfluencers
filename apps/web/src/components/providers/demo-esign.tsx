"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, LoaderCircle, PenLine, Printer } from "lucide-react";
import { toast } from "sonner";
import { formatDate, formatDateTime } from "@repo/utils";
import { api, errorMessage } from "@/lib/api/client";
import { keys } from "@/lib/api/hooks";
import { durationLabel, inr } from "@/lib/format";
import { BRAND_NAME } from "@/lib/site";
import { RequireSession } from "@/components/auth/require-session";
import { ErrorState, Spinner } from "@/components/ui/feedback";

/** Stand-in for the e-sign vendor's signing page (CON-2/3). Signing reaches the booking via the vendor webhook. */
export function DemoEsign({ contractId }: { contractId: string }) {
  return <RequireSession role="CUSTOMER">{() => <Esign contractId={contractId} />}</RequireSession>;
}

function Esign({ contractId }: { contractId: string }) {
  const router = useRouter();
  const client = useQueryClient();
  const details = useQuery({ queryKey: ["contract", contractId], queryFn: () => api.providers.contractDetails(contractId) });
  const [name, setName] = useState("");
  const [agreed, setAgreed] = useState(false);

  const sign = useMutation({
    mutationFn: () => api.providers.sign(contractId, name),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.bookings });
      void details.refetch();
      toast.success("Contract signed");
      router.push(`/account/bookings/${details.data!.lead.id}`);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (details.isPending) return <Spinner label="Opening document" />;
  if (details.error) return <ErrorState message={errorMessage(details.error)} />;
  const { lead, booking, status } = details.data;
  const quote = booking.quotes.find((q) => q.status === "ACCEPTED");
  const signed = status === "SIGNED";

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <p className="text-sm text-muted">Document signing · demo</p>
        <button type="button" onClick={() => window.print()} className="btn btn-outline btn-sm">
          <Printer aria-hidden />
          Print / save as PDF
        </button>
      </div>

      <article className="rounded-card border border-line bg-white p-8 shadow-card sm:p-12 print:border-0 print:p-0 print:shadow-none">
        <header className="border-b border-line pb-6 text-center">
          <p className="eyebrow text-gold-deep">Artist booking agreement</p>
          <h1 className="mt-2 font-serif text-3xl font-semibold text-ink">{booking.talent.stageName}</h1>
          <p className="mt-1 text-sm text-muted">Reference {lead.ref}</p>
        </header>

        <div className="space-y-6 py-8 text-sm leading-relaxed text-ink-soft">
          <Clause n={1} title="Parties">
            This agreement is between <strong className="text-ink">{lead.contactName}</strong>
            {lead.companyName && <> on behalf of {lead.companyName}</>} (the "Client") and {BRAND_NAME} (the
            "Platform"), acting under an agreement with the artist or their authorised representative.
          </Clause>
          <Clause n={2} title="Performance">
            {booking.talent.stageName} will perform at the Client's {lead.eventType.toLowerCase()} in {lead.city}
            {lead.venue && <> ({lead.venue})</>} on <strong className="text-ink">{formatDate(`${lead.eventDate}T12:00:00+05:30`)}</strong>
            {lead.durationMins && <> for {durationLabel(lead.durationMins)}</>}. Reporting time, sound check and the
            artist's technical rider are shared by the Platform at least seven days before the event.
          </Clause>
          {quote && (
            <Clause n={3} title="Fees and payment">
              The total fee is <strong className="text-ink">{inr(quote.totalPaise)}</strong> including GST, as set out in quote
              version {quote.version}. Payment follows the agreed schedule:{" "}
              {quote.milestonePlan.map((p) => `${p.label} ${p.percentBps / 100}%`).join(", ")}. The booking is confirmed
              only once this agreement is signed and the advance is received.
            </Clause>
          )}
          <Clause n={4} title="Cancellation">
            Cancellations by the Client are handled under the Platform's cancellation policy in force on the date of
            signing. If the artist cancels, the Client receives a full refund of amounts paid, or a replacement artist
            if the Client agrees.
          </Clause>
          <Clause n={5} title="Recording and usage">
            The Client may photograph and record the performance for private and internal use. Commercial use of the
            artist's name, image or performance needs the artist's written consent.
          </Clause>
          <Clause n={6} title="Venue and safety">
            The Client provides a safe stage, power, green room and security suitable for the audience size.
          </Clause>
          <p className="rounded-lg bg-cream-soft px-4 py-3 text-xs text-muted">
            Sample wording for the demo. The real agreement comes from a lawyer-approved template.
          </p>
        </div>

        <footer className="border-t border-line pt-6">
          {signed ? (
            <div className="flex items-center gap-3 rounded-xl bg-emerald-50 px-5 py-4 text-emerald-900">
              <BadgeCheck className="size-6 shrink-0" aria-hidden />
              <p className="text-sm">
                Signed electronically by <strong>{booking.contract?.signedName}</strong>
                {booking.contract?.signedAt && <> on {formatDateTime(booking.contract.signedAt)}</>}.
              </p>
            </div>
          ) : (
            <form
              className="space-y-4 print:hidden"
              onSubmit={(e) => {
                e.preventDefault();
                sign.mutate();
              }}
            >
              <label className="block text-sm font-medium text-ink">
                Type your full name to sign
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  minLength={2}
                  placeholder={details.data.signerName}
                  autoComplete="name"
                  className="mt-1.5 w-full rounded-md border border-line px-4 py-3 font-serif text-xl italic text-ink outline-none focus:border-gold"
                />
              </label>
              <label className="flex cursor-pointer gap-3 text-sm text-ink-soft">
                <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-1 size-4 accent-[var(--gold-deep)]" />
                I have read this agreement and agree to sign it electronically.
              </label>
              <div className="flex flex-wrap gap-3">
                <button type="submit" disabled={!agreed || name.trim().length < 2 || sign.isPending} className="btn btn-gold disabled:opacity-50">
                  {sign.isPending ? <LoaderCircle className="animate-spin" aria-hidden /> : <PenLine aria-hidden />}
                  Sign agreement
                </button>
                <Link href={`/account/bookings/${lead.id}`} className="btn btn-outline">
                  Not now
                </Link>
              </div>
            </form>
          )}
        </footer>
      </article>
      {signed && (
        <div className="mt-6 text-center print:hidden">
          <Link href={`/account/bookings/${lead.id}`} className="btn btn-dark">
            Back to booking
          </Link>
        </div>
      )}
    </div>
  );
}

function Clause({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-display font-semibold text-ink">
        {n}. {title}
      </h2>
      <p className="mt-1">{children}</p>
    </section>
  );
}
