"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { formatDateTime } from "@repo/utils";
import { api, type LeadDetail } from "@/lib/api";
import { useStaffMutation } from "@/lib/hooks";
import { Card, inputClass } from "@/components/ui";

export function CustomerMessages({ lead }: { lead: LeadDetail }) {
  const [body, setBody] = useState("");
  const send = useStaffMutation((text: string) => api.leads.reply(lead.id, text), "Reply sent");
  return (
    <Card title={`Messages with ${lead.customer.name.split(" ")[0]}`}>
      {lead.messages.length === 0 ? (
        <p className="text-sm text-muted">No messages yet.</p>
      ) : (
        <ul className="max-h-72 space-y-2 overflow-y-auto">
          {lead.messages.map((m) => (
            <li key={m.id} className={`rounded-md px-3 py-2 text-sm ${m.author === "staff" ? "ml-6 bg-ink text-white" : "mr-6 bg-cream"}`}>
              <span className="text-xs font-semibold opacity-70">{m.authorName} · {formatDateTime(m.at)}</span>
              <p className="whitespace-pre-wrap">{m.body}</p>
            </li>
          ))}
        </ul>
      )}
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send.mutate(body, { onSuccess: () => setBody("") });
        }}
      >
        <input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Reply to the customer…" aria-label="Reply to the customer" className={`${inputClass} min-w-0 flex-1`} />
        <button type="submit" disabled={!body.trim() || send.isPending} aria-label="Send" className="btn btn-dark btn-sm disabled:opacity-50">
          <Send aria-hidden />
        </button>
      </form>
    </Card>
  );
}
