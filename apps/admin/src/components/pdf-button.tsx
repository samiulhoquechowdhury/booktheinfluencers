"use client";

import { useState } from "react";
import { Download, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api";

/** Downloads the customer-facing quote or booking agreement PDF (no internal costs). */
export function PdfButton({ kind, id, label = "PDF" }: { kind: "quote" | "contract"; id: string; label?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      title={kind === "quote" ? "Download the quote as the customer sees it" : "Download the booking agreement"}
      onClick={async () => {
        setBusy(true);
        try {
          await (kind === "quote" ? api.documents.quotePdf(id) : api.documents.contractPdf(id));
        } catch (error) {
          toast.error(errorMessage(error));
        } finally {
          setBusy(false);
        }
      }}
      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-gold-deep hover:bg-cream disabled:opacity-60"
    >
      {busy ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <Download className="size-3.5" aria-hidden />}
      {label}
    </button>
  );
}
