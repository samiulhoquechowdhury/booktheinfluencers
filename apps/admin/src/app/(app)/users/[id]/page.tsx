"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Ban, CheckCircle2, LogOut, Power } from "lucide-react";
import { AccountRestrictSchema, type AccountRestrictInput, type UserDetail } from "@repo/schemas";
import { formatDate, formatDateTime } from "@repo/utils";
import { api, errorMessage } from "@/lib/api";
import { ACCOUNT_LABELS, PROFILE_STATUS_LABELS, REVIEW_LABELS, accountTone } from "@/lib/format";
import { keys, useStaffMutation } from "@/lib/hooks";
import { Card, Failure, Loading, Modal, Pill, inputClass } from "@/components/ui";

const ACCOUNT_TYPE = (u: UserDetail) => [u.isCustomer && "Customer", u.isArtist && "Artist"].filter(Boolean).join(" & ") || "User";
const EVENT_LABELS: Record<string, string> = { sign_in: "Signed in", sign_in_failed: "Failed sign-in", sign_out: "Signed out", password_changed: "Password changed" };

type Dialog = AccountRestrictInput["kind"] | "restore" | "sign-out";

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const detail = useQuery({ queryKey: keys.user(id), queryFn: () => api.users.get(id) });
  const [dialog, setDialog] = useState<Dialog | null>(null);
  if (detail.isPending) return <Loading />;
  if (detail.error) return <Failure message={errorMessage(detail.error)} onRetry={() => detail.refetch()} />;
  const u = detail.data;
  const active = u.status === "ACTIVE";

  return (
    <div className="space-y-5">
      <Link href="/users" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden />
        All users
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-ink">{u.name}</h1>
            <Pill tone={accountTone(u.status)}>{ACCOUNT_LABELS[u.status]}</Pill>
          </div>
          <p className="mt-1 text-sm text-muted">{ACCOUNT_TYPE(u)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {active ? (
            <>
              <button type="button" onClick={() => setDialog("sign-out")} className="btn btn-outline btn-sm">
                <LogOut aria-hidden />
                Sign out everywhere
              </button>
              <button type="button" onClick={() => setDialog("DEACTIVATED")} className="btn btn-outline btn-sm">
                <Power aria-hidden />
                Deactivate
              </button>
            </>
          ) : (
            <button type="button" onClick={() => setDialog("restore")} className="btn btn-dark btn-sm">
              <CheckCircle2 aria-hidden />
              Restore account
            </button>
          )}
          {u.status !== "BLOCKED" && (
            <button type="button" onClick={() => setDialog("BLOCKED")} className="btn btn-sm border border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100">
              <Ban aria-hidden />
              Block
            </button>
          )}
        </div>
      </div>

      {u.restriction && (
        <p className={`rounded-xl border p-4 text-sm ${u.status === "BLOCKED" ? "border-rose-200 bg-rose-50 text-rose-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
          {ACCOUNT_LABELS[u.status]}{u.restriction.byName ? ` by ${u.restriction.byName}` : ""} on {formatDateTime(u.restriction.at)}{u.restriction.reason ? `: ${u.restriction.reason.replace(/[.!]?$/, ".")}` : "."} They can't sign in{u.artist ? ", and their profile is hidden from the website" : ""}.
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-5">
          <Card title="Details">
            <dl className="grid gap-4 sm:grid-cols-2">
              <Field label="Mobile" value={u.phone} />
              <Field label="Email" value={u.email} />
              <Field label="Joined" value={formatDate(u.createdAt)} />
              <Field label="Last sign-in" value={u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "Not recorded"} />
              <Field label="Enquiries" value={String(u.enquiryCount)} />
              <Field label="Still in progress" value={`${u.openEnquiries} ${u.openEnquiries === 1 ? "enquiry" : "enquiries"}${u.artist ? `, ${u.openBookings} confirmed ${u.openBookings === 1 ? "booking" : "bookings"}` : ""}`} />
            </dl>
          </Card>
          <Card title="Recent sign-ins">
            {u.recentSignIns.length === 0 ? (
              <p className="text-sm text-muted">No sign-ins recorded yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {u.recentSignIns.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-0.5 py-2 text-sm">
                    <span className={e.event === "sign_in_failed" ? "text-rose-700" : "text-ink"}>
                      {EVENT_LABELS[e.event] ?? e.event}
                      {e.detail && <span className="text-muted"> · {e.detail}</span>}
                    </span>
                    <span className="whitespace-nowrap text-xs text-muted">{formatDateTime(e.at)}{e.ip ? ` · ${e.ip}` : ""}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        {u.artist && (
          <Card title="Artist profile">
            <dl className="space-y-3">
              <Field label="Stage name" value={u.artist.stageName || "Not set yet"} />
              <Field label="Verification" value={u.artist.reviewStatus ? REVIEW_LABELS[u.artist.reviewStatus] : "Added by staff"} />
              <Field label="Website" value={PROFILE_STATUS_LABELS[u.artist.profileStatus as keyof typeof PROFILE_STATUS_LABELS] ?? u.artist.profileStatus} />
            </dl>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href={`/talents/${u.artist.slug}`} className="btn btn-outline btn-sm">Open in Talents</Link>
              {u.artist.reviewStatus && u.artist.reviewStatus !== "INCOMPLETE" && <Link href={`/verifications/${u.artist.slug}`} className="btn btn-outline btn-sm">Open verification</Link>}
            </div>
          </Card>
        )}
      </div>

      {(dialog === "DEACTIVATED" || dialog === "BLOCKED") && <RestrictDialog user={u} kind={dialog} onClose={() => setDialog(null)} />}
      {dialog === "restore" && <RestoreDialog user={u} onClose={() => setDialog(null)} />}
      {dialog === "sign-out" && <SignOutDialog user={u} onClose={() => setDialog(null)} />}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-1 break-words text-sm text-ink">{value}</dd>
    </div>
  );
}

function RestrictDialog({ user, kind, onClose }: { user: UserDetail; kind: AccountRestrictInput["kind"]; onClose: () => void }) {
  const blocking = kind === "BLOCKED";
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const restrict = useStaffMutation((input: AccountRestrictInput) => api.users.restrict(user.id, input), blocking ? `${user.name} is blocked` : `${user.name} is deactivated`);
  const open = user.openEnquiries + user.openBookings;
  return (
    <Modal title={`${blocking ? "Block" : "Deactivate"} ${user.name}?`} onClose={onClose}>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const parsed = AccountRestrictSchema.safeParse({ kind, reason });
          if (!parsed.success) return setError(parsed.error.issues[0]!.message);
          setError("");
          restrict.mutate(parsed.data, { onSuccess: onClose, onError: (err) => setError(errorMessage(err)) });
        }}
      >
        <p className="text-sm text-ink-soft">
          {blocking ? "Use this for abuse or fraud." : "Use this when someone asks to close their account, or it's no longer used."} They're signed out at once and can't sign in again{user.artist ? ", and their profile leaves the website" : ""}. Nothing is deleted, and you can restore the account later.
        </p>
        {open > 0 && (
          <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            They have {open} {open === 1 ? "enquiry or booking" : "enquiries or bookings"} in progress. These aren't cancelled, so let the sales team know.
          </p>
        )}
        <label className="mt-4 block text-sm font-medium text-ink">
          Reason <span className="font-normal text-muted">(only staff see this)</span>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} autoFocus className={`${inputClass} mt-1.5`} />
        </label>
        {error && <p role="alert" className="mt-2 text-sm text-rose-700">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn btn-outline btn-sm">Cancel</button>
          <button type="submit" disabled={restrict.isPending} className="btn btn-dark btn-sm disabled:opacity-50">{restrict.isPending ? "Saving…" : blocking ? "Block account" : "Deactivate account"}</button>
        </div>
      </form>
    </Modal>
  );
}

function RestoreDialog({ user, onClose }: { user: UserDetail; onClose: () => void }) {
  const restore = useStaffMutation(() => api.users.restore(user.id), `${user.name} is restored`);
  return (
    <Modal title={`Restore ${user.name}?`} onClose={onClose}>
      <p className="text-sm text-ink-soft">They can sign in again{user.artist ? ", and their profile returns to the website if it was published" : ""}.</p>
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="btn btn-outline btn-sm">Cancel</button>
        <button type="button" disabled={restore.isPending} onClick={() => restore.mutate(undefined, { onSuccess: onClose })} className="btn btn-dark btn-sm disabled:opacity-50">{restore.isPending ? "Restoring…" : "Restore account"}</button>
      </div>
    </Modal>
  );
}

function SignOutDialog({ user, onClose }: { user: UserDetail; onClose: () => void }) {
  const signOut = useStaffMutation(() => api.users.signOut(user.id), `${user.name} is signed out`);
  return (
    <Modal title={`Sign ${user.name} out everywhere?`} onClose={onClose}>
      <p className="text-sm text-ink-soft">Useful for a lost phone or a suspicious sign-in. They can sign straight back in with their mobile number.</p>
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="btn btn-outline btn-sm">Cancel</button>
        <button type="button" disabled={signOut.isPending} onClick={() => signOut.mutate(undefined, { onSuccess: onClose })} className="btn btn-dark btn-sm disabled:opacity-50">{signOut.isPending ? "Signing out…" : "Sign out everywhere"}</button>
      </div>
    </Modal>
  );
}
