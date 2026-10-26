"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient, type QueryKey, type UseQueryResult } from "@tanstack/react-query";
import { FlaskConical, LoaderCircle, MessageSquare, Send } from "lucide-react";
import { toast } from "sonner";
import { formatDateTime } from "@repo/utils";
import { errorMessage, type Message } from "@/lib/api/client";
import { keys } from "@/lib/api/hooks";

/** A two-party conversation. `self` is the side the viewer is on; everything else shows as the other party. */
export function MessageThread({
  query,
  queryKey,
  self,
  send,
  demoReply,
  emptyText,
  placeholder,
}: {
  query: UseQueryResult<Message[]>;
  queryKey: QueryKey;
  self: Message["author"];
  send: (body: string) => Promise<Message>;
  demoReply?: { label: string; send: (body: string) => Promise<Message> };
  emptyText: string;
  placeholder: string;
}) {
  const client = useQueryClient();
  const [body, setBody] = useState("");
  const [demoBody, setDemoBody] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  const onSent = () => {
    void client.invalidateQueries({ queryKey });
    void client.invalidateQueries({ queryKey: keys.notifications });
  };
  const post = useMutation({ mutationFn: send, onSuccess: () => { setBody(""); onSent(); }, onError: (e) => toast.error(errorMessage(e)) });
  const reply = useMutation({
    mutationFn: (text: string) => demoReply!.send(text),
    onSuccess: () => { setDemoBody(""); onSent(); },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const count = query.data?.length ?? 0;
  useEffect(() => {
    if (count) endRef.current?.scrollIntoView({ block: "nearest" });
  }, [count]);

  return (
    <div>
      <div className="max-h-96 space-y-3 overflow-y-auto pr-1" aria-live="polite">
        {query.isPending ? (
          <p className="flex items-center gap-2 py-6 text-sm text-muted">
            <LoaderCircle className="size-4 animate-spin" aria-hidden />
            Loading messages…
          </p>
        ) : query.error ? (
          <p role="alert" className="py-4 text-sm text-rose-700">
            {errorMessage(query.error)}
          </p>
        ) : count === 0 ? (
          <p className="flex items-center gap-2 rounded-xl bg-cream-soft px-4 py-4 text-sm text-muted">
            <MessageSquare className="size-4 shrink-0" aria-hidden />
            {emptyText}
          </p>
        ) : (
          query.data!.map((message) => {
            const mine = message.author === self;
            return (
              <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${mine ? "rounded-br-sm bg-ink text-white" : "rounded-bl-sm bg-cream text-ink"}`}>
                  <p className={`text-xs font-semibold ${mine ? "text-warm" : "text-gold-deep"}`}>{mine ? "You" : message.authorName}</p>
                  <p className="mt-0.5 whitespace-pre-wrap leading-relaxed">{message.body}</p>
                  <p className={`mt-1 text-[0.7rem] ${mine ? "text-white/50" : "text-muted"}`}>{formatDateTime(message.at)}</p>
                </div>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      <form
        className="mt-4 flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (body.trim()) post.mutate(body);
        }}
      >
        <label className="flex-1">
          <span className="sr-only">Your message</span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (body.trim()) post.mutate(body);
              }
            }}
            rows={2}
            maxLength={2000}
            placeholder={placeholder}
            className="w-full resize-none rounded-xl border border-line px-4 py-3 text-sm outline-none focus:border-gold"
          />
        </label>
        <button type="submit" disabled={!body.trim() || post.isPending} aria-label="Send message" className="btn btn-dark h-[50px] px-4 disabled:opacity-50">
          {post.isPending ? <LoaderCircle className="animate-spin" aria-hidden /> : <Send aria-hidden />}
        </button>
      </form>
      <p className="mt-1.5 text-xs text-muted">Enter to send · Shift+Enter for a new line</p>

      {demoReply && (
        <form
          className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-violet-300 bg-violet-50/60 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (demoBody.trim()) reply.mutate(demoBody);
          }}
        >
          <FlaskConical className="size-4 text-violet-800" aria-hidden />
          <span className="text-xs font-medium text-violet-900">{demoReply.label}</span>
          <input
            value={demoBody}
            onChange={(e) => setDemoBody(e.target.value)}
            placeholder="Type a reply…"
            className="min-w-0 flex-1 rounded-md border border-violet-300 bg-white px-3 py-1.5 text-xs outline-none"
          />
          <button type="submit" disabled={!demoBody.trim() || reply.isPending} className="rounded-md bg-violet-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
            Reply
          </button>
        </form>
      )}
    </div>
  );
}
