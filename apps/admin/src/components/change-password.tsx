"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { NewPasswordSchema } from "@repo/schemas";
import { api, errorMessage, type StaffSession } from "@/lib/api";
import { keys } from "@/lib/hooks";
import { inputClass } from "./ui";

/** Staff choose their own password; required after a temporary one from a super admin. */
export function ChangePasswordForm({ onDone }: { onDone?: () => void }) {
  const client = useQueryClient();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const change = useMutation({
    mutationFn: () => api.auth.changePassword(current, next),
    onSuccess: () => {
      client.setQueryData<StaffSession | null>(keys.session, (s) => (s ? { ...s, mustChangePassword: false } : s));
      toast.success("Password changed");
      setCurrent("");
      setNext("");
      setConfirm("");
      onDone?.();
    },
    onError: (e) => setError(errorMessage(e)),
  });

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const checked = NewPasswordSchema.safeParse(next);
        if (!current) return setError("Enter your current password");
        if (!checked.success) return setError(checked.error.issues[0]!.message);
        if (next !== confirm) return setError("The new passwords don't match");
        setError("");
        change.mutate();
      }}
    >
      <label className="block text-sm font-medium text-ink">
        Current password
        <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" className={`${inputClass} mt-1.5`} />
      </label>
      <label className="block text-sm font-medium text-ink">
        New password
        <input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" className={`${inputClass} mt-1.5`} />
        <span className="mt-1 block text-xs font-normal text-muted">At least 10 characters, with a letter and a number.</span>
      </label>
      <label className="block text-sm font-medium text-ink">
        Repeat new password
        <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" className={`${inputClass} mt-1.5`} />
      </label>
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
      <button type="submit" disabled={change.isPending} className="btn btn-dark w-full disabled:opacity-60">
        {change.isPending && <LoaderCircle className="animate-spin" aria-hidden />}
        Change password
      </button>
    </form>
  );
}
