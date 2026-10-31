"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowUp, LoaderCircle, MessageCircle, RotateCcw, Sparkles, X } from "lucide-react";
import { ASSISTANT_MESSAGE_MAX, type AssistantReply, type AssistantTalent } from "@repo/schemas";
import { api, errorMessage } from "@/lib/api/client";
import { isUploaded, photoAt } from "@/lib/photo";

const STARTERS = ["Find a singer for my wedding", "Suggest a DJ in Mumbai", "How does booking work?"];
const HISTORY = 11;

type Entry = { id: number; role: "user" | "assistant"; content: string; talents?: AssistantTalent[]; date?: string | null };

const STATUS: Record<NonNullable<AssistantTalent["status"]>, { label: string; className: string }> = {
  free: { label: "Free on this date", className: "bg-emerald-50 text-emerald-800" },
  booked: { label: "Booked on this date", className: "bg-rose-50 text-rose-700" },
  unavailable: { label: "Not available", className: "bg-rose-50 text-rose-700" },
};

/** The website's AI assistant. It only appears once the assistant is connected in CRM → API. */
export function AssistantChat() {
  const { data: status } = useQuery({ queryKey: ["assistant", "status"], queryFn: api.assistant.status, staleTime: 5 * 60_000 });
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [draft, setDraft] = useState("");
  const launcher = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const nextId = useRef(0);

  const add = (entry: Omit<Entry, "id">) => setEntries((all) => [...all, { ...entry, id: nextId.current++ }]);

  const chat = useMutation({
    mutationFn: (history: Entry[]) => api.assistant.chat({ messages: history.slice(-HISTORY).map(({ role, content }) => ({ role, content })) }),
    onSuccess: ({ reply, talents, date }: AssistantReply) => add({ role: "assistant", content: reply, talents, date }),
  });

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [entries, chat.isPending, chat.isError]);

  function close() {
    setOpen(false);
    launcher.current?.focus();
  }

  function send(text: string) {
    const content = text.trim();
    if (!content || chat.isPending) return;
    setDraft("");
    const user: Entry = { id: nextId.current++, role: "user", content };
    const history = [...entries, user];
    setEntries(history);
    chat.mutate(history);
  }

  if (!status?.available) return null;

  return (
    <div className="print:hidden [body[data-hide-footer]_&]:hidden">
      {!open && (
        <button
          ref={launcher}
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Ask our assistant"
          className="fixed bottom-5 right-5 z-40 flex h-14 cursor-pointer items-center gap-2 rounded-full bg-ink pl-4 pr-5 font-display text-sm font-semibold text-white shadow-card transition-colors hover:bg-ink-soft"
        >
          <MessageCircle className="size-5 text-warm" aria-hidden />
          <span className="max-sm:hidden">Ask our assistant</span>
        </button>
      )}

      {open && (
        <section
          role="dialog"
          aria-label="Booking assistant"
          onKeyDown={(e) => {
            if (e.key === "Escape") close();
          }}
          className="fixed inset-0 z-50 flex flex-col bg-white sm:inset-auto sm:bottom-5 sm:right-5 sm:h-[min(38rem,calc(100dvh-2.5rem))] sm:w-[24rem] sm:overflow-hidden sm:rounded-card sm:border sm:border-line sm:shadow-card"
        >
          <header className="flex shrink-0 items-center gap-3 bg-ink px-4 py-3 text-white">
            <span className="grid size-9 place-items-center rounded-full bg-white/10">
              <Sparkles className="size-[18px] text-warm" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-sm font-semibold">Booking assistant</h2>
              <p className="text-xs text-white/65">Find artists and check dates</p>
            </div>
            {entries.length > 0 && (
              <button
                type="button"
                aria-label="Start a new chat"
                onClick={() => {
                  chat.reset();
                  setEntries([]);
                }}
                className="grid size-9 cursor-pointer place-items-center rounded-md hover:bg-white/10"
              >
                <RotateCcw className="size-4" aria-hidden />
              </button>
            )}
            <button type="button" aria-label="Close assistant" onClick={close} className="grid size-9 cursor-pointer place-items-center rounded-md hover:bg-white/10">
              <X className="size-5" aria-hidden />
            </button>
          </header>

          <div ref={log} role="log" aria-live="polite" className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain bg-cream-soft p-4">
            {entries.length === 0 && (
              <>
                <Bubble>Hi! Tell me about your event, or give me an artist and a date and I'll check if they're free.</Bubble>
                <div className="flex flex-wrap gap-2">
                  {STARTERS.map((starter) => (
                    <button key={starter} type="button" onClick={() => send(starter)} className="cursor-pointer rounded-full border border-line bg-white px-3 py-1.5 text-left text-xs font-medium text-ink hover:border-gold">
                      {starter}
                    </button>
                  ))}
                </div>
              </>
            )}

            {entries.map((entry) =>
              entry.role === "user" ? (
                <p key={entry.id} className="ml-auto w-fit max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-sm bg-ink px-3.5 py-2 text-sm text-white">
                  {entry.content}
                </p>
              ) : (
                <div key={entry.id} className="space-y-2">
                  <Bubble>{entry.content}</Bubble>
                  {entry.talents?.map((talent) => <TalentCard key={talent.slug} talent={talent} date={entry.date ?? null} onPick={() => setOpen(false)} />)}
                </div>
              ),
            )}

            {chat.isPending && (
              <p className="flex w-fit items-center gap-2 rounded-2xl rounded-bl-sm bg-white px-3.5 py-2 text-sm text-muted">
                <LoaderCircle className="size-4 animate-spin" aria-hidden />
                Checking
              </p>
            )}
            {chat.isError && (
              <div role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
                <p>{errorMessage(chat.error)}</p>
                <button type="button" onClick={() => chat.mutate(entries)} className="mt-1 cursor-pointer font-medium underline underline-offset-2">
                  Try again
                </button>
              </div>
            )}
          </div>

          <form
            className="flex shrink-0 items-center gap-2 border-t border-line bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
            onSubmit={(e) => {
              e.preventDefault();
              send(draft);
            }}
          >
            <input
              ref={input}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={ASSISTANT_MESSAGE_MAX}
              aria-label="Your message"
              placeholder="Ask about artists or dates"
              autoComplete="off"
              className="min-w-0 flex-1 rounded-full border border-line px-4 py-2.5 text-base outline-none focus:border-gold sm:text-sm"
            />
            <button type="submit" aria-label="Send" disabled={!draft.trim() || chat.isPending} className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-full bg-ink text-white disabled:cursor-default disabled:opacity-40">
              <ArrowUp className="size-5" aria-hidden />
            </button>
          </form>
        </section>
      )}
    </div>
  );
}

function Bubble({ children }: { children: React.ReactNode }) {
  return <p className="w-fit max-w-[90%] whitespace-pre-wrap break-words rounded-2xl rounded-bl-sm bg-white px-3.5 py-2 text-sm text-ink">{children}</p>;
}

function TalentCard({ talent, date, onPick }: { talent: AssistantTalent; date: string | null; onPick: () => void }) {
  const status = talent.status && STATUS[talent.status];
  const taken = talent.status === "booked" || talent.status === "unavailable";
  const book = `/enquiry?talent=${encodeURIComponent(talent.slug)}${date ? `&date=${date}` : ""}`;

  return (
    <article className="flex gap-3 rounded-card border border-line bg-white p-2.5">
      <div className="relative size-16 shrink-0 overflow-hidden rounded-md bg-cream">
        <Image src={photoAt(talent.photo, 128, 128)} unoptimized={isUploaded(talent.photo)} alt="" fill sizes="64px" className="object-cover" />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="truncate font-display text-sm font-semibold text-ink">{talent.name}</h3>
        <p className="truncate text-xs text-muted">
          {talent.city} · {talent.fee}
        </p>
        {status && <p className={`mt-1 w-fit rounded-full px-2 py-0.5 text-[0.7rem] font-medium ${status.className}`}>{status.label}</p>}
        <div className="mt-1.5 flex gap-3 text-xs font-semibold">
          <Link href={`/talent/${encodeURIComponent(talent.slug)}`} onClick={onPick} className="text-ink underline underline-offset-2">
            View
          </Link>
          {!taken && (
            <Link href={book} onClick={onPick} className="text-gold-deep underline underline-offset-2">
              Book
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}
