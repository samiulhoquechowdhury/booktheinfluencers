"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, LoaderCircle, Send } from "lucide-react";
import { api, errorMessage } from "@/lib/api/client";
import { useSession } from "@/lib/api/hooks";

const TOPICS = ["Planning an event", "An existing booking", "Payments or refunds", "Joining as an artist", "Partnerships", "Something else"];
const inputClass = "mt-1.5 w-full rounded-md border border-line bg-white px-4 py-3 text-sm text-ink outline-none focus:border-gold";

export function ContactForm() {
  const { data: session } = useSession();
  const [form, setForm] = useState({ name: "", phone: "", email: "", topic: TOPICS[0]!, message: "" });
  const [touchedFromSession, setTouchedFromSession] = useState(false);
  const submit = useMutation({ mutationFn: () => api.contact.submit(form) });

  // Prefill once from the signed-in account.
  if (session && !touchedFromSession) {
    setTouchedFromSession(true);
    setForm((f) => ({ ...f, name: f.name || session.name, phone: f.phone || session.phone, email: f.email || (session.email ?? "") }));
  }

  if (submit.isSuccess) {
    return (
      <div className="rounded-card border border-line bg-white p-8 text-center">
        <CheckCircle2 className="mx-auto size-12 text-emerald-600" aria-hidden />
        <h2 className="mt-4 font-serif text-2xl font-semibold text-ink">Message received</h2>
        <p className="mt-2 text-muted">
          Your reference is <span className="font-display font-semibold text-gold-deep">{submit.data.ref}</span>. Our team
          will get back to you soon.
        </p>
        <button
          type="button"
          onClick={() => {
            submit.reset();
            setForm((f) => ({ ...f, message: "" }));
          }}
          className="btn btn-outline mt-6"
        >
          Send another message
        </button>
      </div>
    );
  }

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: key === "phone" ? e.target.value.replace(/\D/g, "").slice(0, 10) : e.target.value }));

  return (
    <form
      className="grid gap-5 rounded-card border border-line bg-white p-6 sm:grid-cols-2 sm:p-8"
      onSubmit={(e) => {
        e.preventDefault();
        submit.mutate();
      }}
    >
      <label className="text-sm font-medium text-ink">
        Your name
        <input value={form.name} onChange={set("name")} required minLength={2} autoComplete="name" className={inputClass} />
      </label>
      <label className="text-sm font-medium text-ink">
        Mobile number
        <input value={form.phone} onChange={set("phone")} required inputMode="numeric" autoComplete="tel-national" placeholder="10-digit mobile" className={inputClass} />
      </label>
      <label className="text-sm font-medium text-ink">
        Email <span className="font-normal text-muted">(optional)</span>
        <input type="email" value={form.email} onChange={set("email")} autoComplete="email" className={inputClass} />
      </label>
      <label className="text-sm font-medium text-ink">
        Topic
        <select value={form.topic} onChange={set("topic")} className={inputClass}>
          {TOPICS.map((topic) => (
            <option key={topic}>{topic}</option>
          ))}
        </select>
      </label>
      <label className="text-sm font-medium text-ink sm:col-span-2">
        How can we help?
        <textarea value={form.message} onChange={set("message")} required minLength={10} rows={5} className={inputClass} />
      </label>
      {form.topic === "An existing booking" && session && (
        <p className="rounded-md bg-cream-soft px-4 py-3 text-sm text-muted sm:col-span-2">
          Tip: messages sent from your{" "}
          <Link href="/account" className="font-medium text-gold-deep underline-offset-2 hover:underline">
            booking page
          </Link>{" "}
          go straight to your booking manager.
        </p>
      )}
      {submit.isError && (
        <p role="alert" className="text-sm text-rose-700 sm:col-span-2">
          {errorMessage(submit.error)}
        </p>
      )}
      <div className="sm:col-span-2">
        <button type="submit" disabled={submit.isPending} className="btn btn-gold disabled:opacity-60">
          {submit.isPending ? <LoaderCircle className="animate-spin" aria-hidden /> : <Send aria-hidden />}
          Send message
        </button>
      </div>
    </form>
  );
}
