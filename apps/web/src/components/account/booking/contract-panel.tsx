import Link from "next/link";
import { FileSignature, PenLine } from "lucide-react";
import type { CustomerBooking } from "@repo/schemas";
import { formatDateTime } from "@repo/utils";
import { StatusPill } from "@/components/ui/status-pill";
import { Panel } from "./quote-panel";

export function ContractPanel({ booking }: { booking: CustomerBooking }) {
  const contract = booking.contract;
  const accepted = booking.quotes.some((q) => q.status === "ACCEPTED");

  return (
    <Panel
      icon={<FileSignature className="size-4" aria-hidden />}
      title="Contract"
      badge={
        contract?.status === "SIGNED" ? (
          <StatusPill tone="success">Signed</StatusPill>
        ) : contract ? (
          <StatusPill tone="action">Ready to sign</StatusPill>
        ) : undefined
      }
    >
      {!contract ? (
        <p className="text-sm text-muted">
          {accepted
            ? "Your manager is preparing the contract. You'll be able to sign it online here."
            : "The contract follows once you accept a quote."}
        </p>
      ) : contract.status === "SIGNED" ? (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <p className="text-muted">
            Signed by <span className="text-ink">{contract.signedName}</span>
            {contract.signedAt && <> on {formatDateTime(contract.signedAt)}</>}.
          </p>
          <Link href={`/esign/${contract.id}`} className="font-medium text-gold-deep hover:underline">
            View signed contract
          </Link>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-sm text-sm text-muted">
            Sent {formatDateTime(contract.sentAt)}. Covers scope, timings, rider, payment and cancellation terms.
          </p>
          <Link href={`/esign/${contract.id}`} className="btn btn-gold">
            <PenLine aria-hidden />
            Review & sign
          </Link>
        </div>
      )}
    </Panel>
  );
}
