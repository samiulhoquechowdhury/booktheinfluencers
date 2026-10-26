"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage, type Session } from "@/lib/api/client";
import { keys } from "@/lib/api/hooks";
import { RequireSession } from "@/components/auth/require-session";

export function ProfileView() {
  return <RequireSession role="CUSTOMER">{(session) => <ProfileForm session={session} />}</RequireSession>;
}

function ProfileForm({ session }: { session: Session }) {
  const client = useQueryClient();
  const [name, setName] = useState(session.name);
  const [email, setEmail] = useState(session.email ?? "");
  const save = useMutation({
    mutationFn: () => api.auth.updateProfile({ name, email }),
    onSuccess: (next) => {
      client.setQueryData(keys.session, next);
      toast.success("Profile saved");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const inputClass = "mt-1.5 w-full rounded-md border border-line bg-white px-4 py-3 text-sm text-ink outline-none focus:border-gold";

  return (
    <div className="max-w-xl">
      <h1 className="font-serif text-3xl font-semibold text-ink sm:text-4xl">Profile</h1>
      <form
        className="mt-8 space-y-5 rounded-card border border-line bg-white p-6 sm:p-8"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <label className="block text-sm font-medium text-ink">
          Full name
          <input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} autoComplete="name" className={inputClass} />
        </label>
        <label className="block text-sm font-medium text-ink">
          Email <span className="font-normal text-muted">(for quotes and receipts)</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" className={inputClass} />
        </label>
        <div className="text-sm">
          <p className="font-medium text-ink">Mobile number</p>
          <p className="mt-1.5 text-muted">+91 {session.phone} · verified. Contact us to change it.</p>
        </div>
        <button type="submit" disabled={save.isPending} className="btn btn-dark disabled:opacity-60">
          {save.isPending && <LoaderCircle className="animate-spin" aria-hidden />}
          Save changes
        </button>
      </form>
      <p className="mt-5 text-xs leading-relaxed text-muted">
        Want a copy of your data or your account deleted? Email us and we'll handle it under our privacy policy.
      </p>
    </div>
  );
}
