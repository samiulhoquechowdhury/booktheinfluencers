"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowRight, ArrowUp, Check, ClipboardList, LoaderCircle, Plus, RotateCcw, Sparkles, X } from "lucide-react";
import { ASSISTANT_MESSAGE_MAX, type AssistantBooking, type AssistantReply, type AssistantTalent } from "@repo/schemas";
import { formatDate } from "@repo/utils";
import { api, errorMessage } from "@/lib/api/client";
import { isUploaded, photoAt } from "@/lib/photo";
import { AssistantBrief, EMPTY_BRIEF, MAX_ARTISTS, withDraft, type Brief } from "./assistant-brief";

const STARTERS = ["Find a singer for my wedding", "Who's free on 31 Dec in Mumbai?", "I want to book a DJ", "How does booking work?"];
const HISTORY = 11;

type Entry = { id: number; role: "user" | "assistant"; content: string; talents?: AssistantTalent[]; date?: string | null; booking?: AssistantBooking | null };
type View = "chat" | "brief";

const STATUS: Record<NonNullable<AssistantTalent["status"]>, { label: string; className: string }> = {
  free: { label: "Free on this date", className: "bg-emerald-50 text-emerald-800" },
  booked: { label: "Booked on this date", className: "bg-rose-50 text-rose-700" },
  unavailable: { label: "Not available", className: "bg-rose-50 text-rose-700" },
};

/** The floating assistant on every page: find artists, check dates, and send a brief without leaving the chat. */
export function AssistantChat() {
  const { data: status } = useQuery({ queryKey: ["assistant", "status"], queryFn: api.assistant.status, staleTime: 5 * 60_000 });
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("chat");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [draft, setDraft] = useState("");
  const [brief, setBrief] = useState<Brief>(EMPTY_BRIEF);
  const launcher = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const nextId = useRef(0);

  const add = (entry: Omit<Entry, "id">) => setEntries((all) => [...all, { ...entry, id: nextId.current++ }]);

  const chat = useMutation({
    mutationFn: (history: Entry[]) => api.assistant.chat({ messages: history.slice(-HISTORY).map(({ role, content }) => ({ role, content })) }),
    onSuccess: ({ reply, talents, date, booking }: AssistantReply) => {
      add({ role: "assistant", content: reply, talents, date, booking });
      if (booking) setBrief((current) => withDraft(current, booking));
    },
  });

  useEffect(() => {
    if (open && view === "chat") input.current?.focus();
  }, [open, view]);

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [entries, chat.isPending, chat.isError, view]);

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

  /** Adding from a card also carries the date being talked about into the brief. */
  const toggleArtist = (slug: string, date: string | null) =>
    setBrief((current) =>
      current.talentSlugs.includes(slug)
        ? { ...current, talentSlugs: current.talentSlugs.filter((s) => s !== slug) }
        : { ...current, talentSlugs: [...current.talentSlugs, slug].slice(0, MAX_ARTISTS), eventDate: current.eventDate || date || "" },
    );

  const started = brief.talentSlugs.length > 0 || Boolean(brief.eventDate);
  const summary = [brief.talentSlugs.length > 0 && `${brief.talentSlugs.length} artist${brief.talentSlugs.length > 1 ? "s" : ""}`, brief.eventDate && formatDate(`${brief.eventDate}T12:00:00+05:30`), brief.city].filter(Boolean).join(" · ");

  return (
    <div className="print:hidden [body[data-hide-footer]_&]:hidden">
      {!open && (
        <button
          ref={launcher}
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open the booking assistant"
          className="group fixed bottom-5 right-5 z-40 flex h-14 cursor-pointer items-center gap-2.5 rounded-full bg-ink pl-2 pr-5 font-display text-sm font-semibold text-white shadow-card ring-1 ring-white/10 transition hover:-translate-y-0.5 hover:bg-ink-soft max-sm:pr-2"
        >
          <span className="relative grid size-10 place-items-center rounded-full bg-gradient-to-br from-gold to-warm text-ink">
            <Sparkles className="size-5" aria-hidden />
            <span className="absolute -right-0.5 -top-0.5 size-3 rounded-full border-2 border-ink bg-emerald-400 motion-safe:animate-pulse" aria-hidden />
          </span>
          <span className="max-sm:hidden">Find &amp; book talent</span>
          {started && (
            <span className="rounded-full bg-gold px-2 py-0.5 text-xs text-ink max-sm:absolute max-sm:-top-1 max-sm:-left-1" aria-label="Brief in progress">
              {brief.talentSlugs.length || 1}
            </span>
          )}
        </button>
      )}

      {open && (
        <section
          role="dialog"
          aria-label="Booking assistant"
          onKeyDown={(e) => {
            if (e.key === "Escape") close();
          }}
          className="fixed inset-0 z-50 flex flex-col bg-white sm:inset-auto sm:bottom-5 sm:right-5 sm:h-[min(42rem,calc(100dvh-2.5rem))] sm:w-[26rem] sm:overflow-hidden sm:rounded-card sm:border sm:border-line sm:shadow-card"
        >
          <header className="shrink-0 bg-ink text-white">
            <div className="flex items-center gap-3 px-4 pt-3">
              <span className="grid size-9 place-items-center rounded-full bg-gradient-to-br from-gold to-warm text-ink">
                <Sparkles className="size-[18px]" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="font-display text-sm font-semibold">Booking assistant</h2>
                <p className="text-xs text-white/65">{status?.ai ? "AI · finds artists, checks dates, books" : "Finds artists, checks dates, books"}</p>
              </div>
              {view === "chat" && entries.length > 0 && (
                <button
                  type="button"
                  aria-label="Start a new chat"
                  title="Start a new chat"
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
            </div>
            <div role="tablist" aria-label="Assistant" className="mt-2 flex gap-1 px-3">
              {(["chat", "brief"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={view === tab}
                  onClick={() => setView(tab)}
                  className="flex cursor-pointer items-center gap-1.5 rounded-t-md px-3 py-2 text-xs font-semibold text-white/70 hover:text-white aria-selected:bg-cream-soft aria-selected:text-ink"
                >
                  {tab === "chat" ? <Sparkles className="size-3.5" aria-hidden /> : <ClipboardList className="size-3.5" aria-hidden />}
                  {tab === "chat" ? "Chat" : "Your brief"}
                  {tab === "brief" && brief.talentSlugs.length > 0 && <span className="rounded-full bg-gold px-1.5 text-[0.65rem] text-ink">{brief.talentSlugs.length}</span>}
                </button>
              ))}
            </div>
          </header>

          {view === "brief" ? (
            <AssistantBrief
              brief={brief}
              onChange={(patch) => setBrief((current) => ({ ...current, ...patch }))}
              onBack={() => setView("chat")}
              onSent={({ ref }) => {
                add({ role: "assistant", content: `Your brief ${ref} is with our team. A booking manager will call you shortly with a quote. Anything else I can help with?` });
                setBrief((current) => ({ ...EMPTY_BRIEF, contactName: current.contactName, phone: current.phone, email: current.email }));
              }}
            />
          ) : (
            <>
              <div ref={log} role="log" aria-live="polite" className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain bg-cream-soft p-4">
                {entries.length === 0 && (
                  <>
                    <Bubble>Hi! Tell me about your event, or name an artist and a date and I&apos;ll check if they&apos;re free. When you&apos;re ready, I&apos;ll help you send a brief right here.</Bubble>
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
                      {entry.talents?.map((talent) => (
                        <TalentCard key={talent.slug} talent={talent} added={brief.talentSlugs.includes(talent.slug)} full={brief.talentSlugs.length >= MAX_ARTISTS} onToggle={() => toggleArtist(talent.slug, entry.date ?? null)} onView={() => setOpen(false)} />
                      ))}
                      {entry.booking && (
                        <button type="button" onClick={() => setView("brief")} className="btn btn-gold btn-sm cursor-pointer">
                          Check and send your brief
                          <ArrowRight aria-hidden />
                        </button>
                      )}
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

              {started && (
                <button type="button" onClick={() => setView("brief")} className="flex shrink-0 cursor-pointer items-center gap-2 border-t border-line bg-gold/15 px-4 py-2.5 text-left text-sm hover:bg-gold/25">
                  <ClipboardList className="size-4 shrink-0 text-gold-deep" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-semibold text-ink">Your brief</span> <span className="text-muted">· {summary}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1 font-semibold text-gold-deep">
                    Review and send
                    <ArrowRight className="size-4" aria-hidden />
                  </span>
                </button>
              )}

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
                  placeholder="Ask about artists, dates or booking"
                  autoComplete="off"
                  className="min-w-0 flex-1 rounded-full border border-line px-4 py-2.5 text-base outline-none focus:border-gold sm:text-sm"
                />
                <button type="submit" aria-label="Send" disabled={!draft.trim() || chat.isPending} className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-full bg-ink text-white disabled:cursor-default disabled:opacity-40">
                  <ArrowUp className="size-5" aria-hidden />
                </button>
              </form>
            </>
          )}
        </section>
      )}
    </div>
  );
}

function Bubble({ children }: { children: React.ReactNode }) {
  return <p className="w-fit max-w-[90%] whitespace-pre-wrap break-words rounded-2xl rounded-bl-sm bg-white px-3.5 py-2 text-sm text-ink">{children}</p>;
}

function TalentCard({ talent, added, full, onToggle, onView }: { talent: AssistantTalent; added: boolean; full: boolean; onToggle: () => void; onView: () => void }) {
  const status = talent.status && STATUS[talent.status];
  const taken = talent.status === "booked" || talent.status === "unavailable";

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
        <div className="mt-1.5 flex items-center gap-3 text-xs font-semibold">
          <Link href={`/talent/${encodeURIComponent(talent.slug)}`} onClick={onView} className="text-ink underline underline-offset-2">
            View profile
          </Link>
          {!taken && (
            <button
              type="button"
              onClick={onToggle}
              disabled={!added && full}
              aria-pressed={added}
              title={!added && full ? `A brief can have up to ${MAX_ARTISTS} artists` : undefined}
              className={`flex cursor-pointer items-center gap-1 rounded-full px-2.5 py-1 disabled:cursor-default disabled:opacity-50 ${added ? "bg-emerald-50 text-emerald-800" : "bg-gold text-ink hover:bg-gold/80"}`}
            >
              {added ? <Check className="size-3.5" aria-hidden /> : <Plus className="size-3.5" aria-hidden />}
              {added ? "In your brief" : "Add to brief"}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
