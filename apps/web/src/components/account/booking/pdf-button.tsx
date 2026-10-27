"use client";

import { useState } from "react";
import { Download, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api/client";

/** Downloads a quote or booking agreement as a PDF. */
export function PdfButton({ kind, id, label = "Download PDF", className = "btn btn-outline btn-sm" }: { kind: "quote" | "contract"; id: string; label?: string; className?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
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
      className={`${className} disabled:opacity-60`}
    >
      {busy ? <LoaderCircle className="animate-spin" aria-hidden /> : <Download aria-hidden />}
      {busy ? "Preparing…" : label}
    </button>
  );
}
