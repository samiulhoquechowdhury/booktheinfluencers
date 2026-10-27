"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlarmClock, Check, Plus, RotateCcw } from "lucide-react";
import { FollowUpInputSchema, type FollowUpRecord } from "@repo/schemas";
import { api, errorMessage } from "@/lib/api";
import { keys, useStaffMutation, useStaffSession } from "@/lib/hooks";
import { Card, Pill, inputClass } from "@/components/ui";

// Sales follow-ups on a lead: what to do next, when, and who. The worker reminds the assignee when one falls due.

const IST = "Asia/Kolkata";
const dayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: IST }).format(d);
const timeFmt = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", timeZone: IST });
const dateFmt = new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: IST });

/** "Overdue · 2 Nov, 10:00 am", "Today, 4:30 pm", "Tomorrow, 10:00 am", "Fri 7 Nov, 10:00 am". */
export function dueLabel(iso: string, now = new Date()) {
  const due = new Date(iso);
  const today = dayKey(now);
  const tomorrow = dayKey(new Date(now.getTime() + 86_400_000));
  const day = dayKey(due) === today ? "Today" : dayKey(due) === tomorrow ? "Tomorrow" : dateFmt.format(due);
  return `${day}, ${timeFmt.format(due)}`;
}

export const followUpState = (iso: string, now = new Date()): "overdue" | "today" | "later" =>
  new Date(iso) < now ? "overdue" : dayKey(new Date(iso)) === dayKey(now) ? "today" : "later";

/** Due-time presets in India time, as ISO strings with the +05:30 offset. */
function preset(kind: "2h" | "tomorrow" | "3d" | "week") {
  const now = new Date();
  if (kind === "2h") return new Date(now.getTime() + 2 * 3_600_000).toISOString();
  const days = kind === "tomorrow" ? 1 : kind === "3d" ? 3 : 7;
  return `${dayKey(new Date(now.getTime() + days * 86_400_000))}T10:00:00+05:30`;
}

/** <input type="datetime-local"> value (India time) ⇄ ISO. */
const toLocalInput = (iso: string) => {
  const d = new Date(new Date(iso).getTime() + 5.5 * 3_600_000);
  return d.toISOString().slice(0, 16);
};
const fromLocalInput = (value: string) => `${value}:00+05:30`;

export function FollowUps({ leadId, ownerName }: { leadId: string; ownerName: string | null }) {
  const { data: staff } = useStaffSession();
  const list = useQuery({ queryKey: keys.followUps(leadId), queryFn: () => api.followUps.forLead(leadId) });
  const directory = useQuery({ queryKey: ["staff-directory"], queryFn: api.staff.directory });
  const [adding, setAdding] = useState(false);
  const [showDone, setShowDone] = useState(false);

  const open = list.data?.filter((f) => !f.doneAt) ?? [];
  const done = list.data?.filter((f) => f.doneAt) ?? [];

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <AlarmClock className="size-4 text-gold-deep" aria-hidden />
          Follow-ups
          {open.length > 0 && <span className="rounded-full bg-cream px-2 py-0.5 text-xs text-ink">{open.length}</span>}
        </span>
      }
      actions={
        !adding && (
          <button type="button" onClick={() => setAdding(true)} className="btn btn-outline btn-sm">
            <Plus aria-hidden />
            Add
          </button>
        )
      }
    >
      {adding && staff && (
        <AddForm
          leadId={leadId}
          defaultAssignee={directory.data?.find((s) => s.name === ownerName)?.id ?? staff.id}
          people={directory.data ?? []}
          onDone={() => setAdding(false)}
        />
      )}
      {list.isPending ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : list.error ? (
        <p className="text-sm text-rose-700">{errorMessage(list.error)}</p>
      ) : open.length === 0 && !adding ? (
        <p className="text-sm text-muted">Nothing scheduled. Add one so this lead doesn't go quiet.</p>
      ) : (
        <ul className="space-y-2">
          {open.map((f) => <Item key={f.id} f={f} />)}
        </ul>
      )}
      {done.length > 0 && (
        <div className="mt-3 border-t border-line pt-3">
          <button type="button" onClick={() => setShowDone(!showDone)} className="text-xs font-medium text-muted hover:text-ink">
            {showDone ? "Hide" : "Show"} {done.length} done
          </button>
          {showDone && <ul className="mt-2 space-y-2">{done.map((f) => <Item key={f.id} f={f} />)}</ul>}
        </div>
      )}
    </Card>
  );
}

function Item({ f }: { f: FollowUpRecord }) {
  const update = useStaffMutation((change: { done?: boolean; dueAt?: string }) => api.followUps.update(f.id, change));
  const state = followUpState(f.dueAt);
  const tone = f.doneAt ? "neutral" : state === "overdue" ? "danger" : state === "today" ? "action" : "info";
  return (
    <li className={`flex gap-3 rounded-lg border p-3 ${f.doneAt ? "border-line bg-cream-soft opacity-75" : state === "overdue" ? "border-rose-200 bg-rose-50/50" : "border-line"}`}>
      <button
        type="button"
        onClick={() => update.mutate({ done: !f.doneAt })}
        disabled={update.isPending}
        aria-label={f.doneAt ? `Reopen: ${f.title}` : `Mark done: ${f.title}`}
        className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border ${f.doneAt ? "border-emerald-600 bg-emerald-600 text-white" : "border-line bg-white hover:border-gold"}`}
      >
        {f.doneAt && <Check className="size-3.5" aria-hidden />}
      </button>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium ${f.doneAt ? "text-muted line-through" : "text-ink"}`}>{f.title}</p>
        {f.note && <p className="mt-0.5 text-xs text-ink-soft">{f.note}</p>}
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted">
          <Pill tone={tone}>{f.doneAt ? "Done" : state === "overdue" ? `Overdue · ${dueLabel(f.dueAt)}` : dueLabel(f.dueAt)}</Pill>
          <span>{f.assigneeName}</span>
        </div>
      </div>
      {!f.doneAt && (
        <div className="flex shrink-0 flex-col gap-1">
          <button type="button" onClick={() => update.mutate({ dueAt: preset("tomorrow") })} disabled={update.isPending} title="Move to tomorrow, 10 am" className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted hover:bg-cream hover:text-ink">
            <RotateCcw className="size-3" aria-hidden />
            Tomorrow
          </button>
        </div>
      )}
    </li>
  );
}

function AddForm({ leadId, defaultAssignee, people, onDone }: { leadId: string; defaultAssignee: string; people: { id: string; name: string }[]; onDone: () => void }) {
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [dueAt, setDueAt] = useState(() => preset("tomorrow"));
  const [assigneeId, setAssigneeId] = useState(defaultAssignee);
  const [error, setError] = useState("");
  const create = useStaffMutation((input: { title: string; note: string; dueAt: string; assigneeId: string }) => api.followUps.create(leadId, input), "Follow-up set");
  const presets = [
    ["2h", "In 2 hours"],
    ["tomorrow", "Tomorrow 10 am"],
    ["3d", "In 3 days"],
    ["week", "Next week"],
  ] as const;

  return (
    <form
      noValidate
      className="mb-4 space-y-3 rounded-lg bg-cream-soft p-3"
      onSubmit={(e) => {
        e.preventDefault();
        const parsed = FollowUpInputSchema.safeParse({ title, note, dueAt, assigneeId });
        if (!parsed.success) return setError(parsed.error.issues[0]!.message);
        setError("");
        create.mutate({ title, note, dueAt, assigneeId }, { onSuccess: onDone, onError: (err) => setError(errorMessage(err)) });
      }}
    >
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Call back about the date" aria-label="What to do" autoFocus className={inputClass} />
      <div className="flex flex-wrap gap-1.5">
        {presets.map(([kind, label]) => {
          const value = preset(kind);
          const on = value.slice(0, 16) === dueAt.slice(0, 16);
          return (
            <button key={kind} type="button" onClick={() => setDueAt(value)} aria-pressed={on} className={`rounded-full px-2.5 py-1 text-xs ring-1 ring-inset ${on ? "bg-ink text-white ring-ink" : "bg-white text-ink-soft ring-line hover:ring-gold"}`}>
              {label}
            </button>
          );
        })}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="space-y-1 text-xs font-semibold text-ink-soft">
          Due (India time)
          <input type="datetime-local" value={toLocalInput(dueAt)} onChange={(e) => e.target.value && setDueAt(fromLocalInput(e.target.value))} className={inputClass} />
        </label>
        <label className="space-y-1 text-xs font-semibold text-ink-soft">
          For
          <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} className={inputClass}>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      </div>
      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Note (optional)" aria-label="Note" className={inputClass} />
      {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={create.isPending} className="btn btn-dark btn-sm disabled:opacity-50">{create.isPending ? "Saving…" : "Set follow-up"}</button>
        <button type="button" onClick={onDone} className="btn btn-outline btn-sm">Cancel</button>
      </div>
      <p className="text-[11px] text-muted">They get a reminder when it's due.</p>
    </form>
  );
}
