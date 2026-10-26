"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Copy, KeyRound, MoreHorizontal, Pencil, Plus, Power, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { StaffCreateSchema, StaffUpdateSchema, type StaffAccount, type StaffRoleName } from "@repo/schemas";
import { formatDateTime } from "@repo/utils";
import { api, can, errorMessage } from "@/lib/api";
import { keys, useStaffMutation, useStaffSession } from "@/lib/hooks";
import { Failure, Loading, Modal, PageHeader, Pill, inputClass } from "@/components/ui";

const ROLES: { value: StaffRoleName; label: string; hint: string }[] = [
  { value: "SUPER_ADMIN", label: "Super admin", hint: "Everything, including staff, website and audit log" },
  { value: "SALES", label: "Sales", hint: "Leads, quotes, customer messages" },
  { value: "TALENT_MANAGER", label: "Talent manager", hint: "Roster, rate cards, reps, calendars" },
  { value: "OPS", label: "Operations", hint: "Event day and completion" },
  { value: "ACCOUNTS", label: "Accounts", hint: "Payments, payouts, margins" },
];
const roleLabel = (r: StaffRoleName) => ROLES.find((x) => x.value === r)?.label ?? r;

type Dialog =
  | { kind: "create" }
  | { kind: "edit"; account: StaffAccount }
  | { kind: "password"; name: string; email: string; password: string }
  | null;

export default function StaffPage() {
  const { data: me } = useStaffSession();
  const staff = useQuery({ queryKey: keys.staff, queryFn: api.staff.list, enabled: Boolean(me && can(me, "SUPER_ADMIN")) });
  const [dialog, setDialog] = useState<Dialog>(null);
  const [q, setQ] = useState("");

  if (!me) return <Loading />;
  if (!me.roles.includes("SUPER_ADMIN")) return <Failure message="Only super admins manage staff" />;
  if (staff.isPending) return <Loading />;
  if (staff.error) return <Failure message={errorMessage(staff.error)} onRetry={() => staff.refetch()} />;

  const rows = staff.data.filter((s) => `${s.name} ${s.email}`.toLowerCase().includes(q.toLowerCase()));
  const active = staff.data.filter((s) => s.active).length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Staff"
        description={`${active} active ${active === 1 ? "account" : "accounts"}. New staff get a temporary password and set up their authenticator at first sign-in.`}
        actions={
          <button type="button" onClick={() => setDialog({ kind: "create" })} className="btn btn-dark btn-sm">
            <Plus aria-hidden />
            Add staff
          </button>
        }
      />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or email" aria-label="Search staff" className={`${inputClass} max-w-sm`} />

      <div className="overflow-x-auto rounded-xl border border-line bg-white">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
            <tr>{["Name", "Roles", "Status", "Security", "Last sign-in", ""].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <Row key={s.id} account={s} self={s.id === me.id} onEdit={() => setDialog({ kind: "edit", account: s })} onPassword={(password) => setDialog({ kind: "password", name: s.name, email: s.email, password })} />
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted">No staff match.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">Role changes and deactivations apply within 15 minutes, when the person's session next refreshes. Deactivating signs them out of every device.</p>

      {dialog?.kind === "create" && (
        <StaffForm
          onClose={() => setDialog(null)}
          onCreated={(account, password) => setDialog({ kind: "password", name: account.name, email: account.email, password })}
        />
      )}
      {dialog?.kind === "edit" && <StaffForm account={dialog.account} self={dialog.account.id === me.id} onClose={() => setDialog(null)} />}
      {dialog?.kind === "password" && <PasswordReveal {...dialog} onClose={() => setDialog(null)} />}
    </div>
  );
}

function Row({ account: s, self, onEdit, onPassword }: { account: StaffAccount; self: boolean; onEdit: () => void; onPassword: (password: string) => void }) {
  const [menu, setMenu] = useState(false);
  const setActive = useStaffMutation((active: boolean) => api.staff.setActive(s.id, active), s.active ? "Account deactivated" : "Account restored");
  const resetPassword = useStaffMutation(() => api.staff.resetPassword(s.id));
  const resetMfa = useStaffMutation(() => api.staff.resetMfa(s.id), "Authenticator reset — they'll set it up at next sign-in");

  const run = (action: () => void) => {
    setMenu(false);
    action();
  };

  return (
    <tr className={`border-b border-line last:border-0 ${s.active ? "" : "bg-cream-soft text-muted"}`}>
      <td className="px-4 py-3">
        <p className="font-semibold text-ink">
          {s.name}
          {self && <span className="ml-2 text-xs font-normal text-muted">(you)</span>}
        </p>
        <p className="text-xs text-muted">{s.email}</p>
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1">{s.roles.map((r) => <Pill key={r} tone={r === "SUPER_ADMIN" ? "action" : "neutral"}>{roleLabel(r)}</Pill>)}</div>
      </td>
      <td className="px-4 py-3">{s.active ? <Pill tone="success">Active</Pill> : <Pill tone="danger">Deactivated</Pill>}</td>
      <td className="px-4 py-3 text-xs">
        <p>{s.mfaEnrolled ? "Authenticator set up" : <span className="text-amber-800">Authenticator pending</span>}</p>
        {s.mustChangePassword && <p className="text-amber-800">Temporary password</p>}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-xs">{s.lastLoginAt ? formatDateTime(s.lastLoginAt) : "Never"}</td>
      <td className="relative px-4 py-3 text-right">
        <div className="flex justify-end gap-1">
          <button type="button" onClick={onEdit} aria-label={`Edit ${s.name}`} className="grid size-8 place-items-center rounded-md text-muted hover:bg-cream hover:text-ink">
            <Pencil className="size-4" aria-hidden />
          </button>
          <button type="button" onClick={() => setMenu(!menu)} aria-expanded={menu} aria-label={`More actions for ${s.name}`} className="grid size-8 place-items-center rounded-md text-muted hover:bg-cream hover:text-ink">
            <MoreHorizontal className="size-4" aria-hidden />
          </button>
        </div>
        {menu && (
          <>
            <div aria-hidden className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
            <ul role="menu" className="absolute right-4 top-12 z-20 w-60 rounded-lg border border-line bg-white py-1 text-left text-sm shadow-lg">
              <MenuItem
                icon={KeyRound}
                label="Reset password"
                onClick={() =>
                  run(() => {
                    if (window.confirm(`Give ${s.name} a new temporary password? Their current one stops working${self ? "" : " and they're signed out"}.`))
                      resetPassword.mutate(undefined, { onSuccess: (r) => onPassword(r.temporaryPassword) });
                  })
                }
              />
              <MenuItem
                icon={Smartphone}
                label="Reset authenticator"
                onClick={() =>
                  run(() => {
                    if (window.confirm(`Reset ${s.name}'s authenticator? They'll scan a new key at their next sign-in.`)) resetMfa.mutate(undefined);
                  })
                }
              />
              {!self && (
                <MenuItem
                  icon={Power}
                  danger={s.active}
                  label={s.active ? "Deactivate" : "Reactivate"}
                  onClick={() =>
                    run(() => {
                      if (!s.active || window.confirm(`Deactivate ${s.name}? They're signed out everywhere and can't sign in until reactivated.`)) setActive.mutate(!s.active);
                    })
                  }
                />
              )}
            </ul>
          </>
        )}
      </td>
    </tr>
  );
}

function MenuItem({ icon: Icon, label, onClick, danger = false }: { icon: typeof Power; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <li role="none">
      <button type="button" role="menuitem" onClick={onClick} className={`flex w-full items-center gap-2.5 px-3 py-2 hover:bg-cream ${danger ? "text-rose-700" : "text-ink"}`}>
        <Icon className="size-4" aria-hidden />
        {label}
      </button>
    </li>
  );
}

function StaffForm({ account, self = false, onClose, onCreated }: { account?: StaffAccount; self?: boolean; onClose: () => void; onCreated?: (account: StaffAccount, password: string) => void }) {
  const [name, setName] = useState(account?.name ?? "");
  const [email, setEmail] = useState(account?.email ?? "");
  const [roles, setRoles] = useState<StaffRoleName[]>(account?.roles ?? ["SALES"]);
  const [error, setError] = useState("");
  const save = useStaffMutation(async () => {
    if (account) {
      const input = StaffUpdateSchema.safeParse({ name, roles });
      if (!input.success) throw new Error(input.error.issues[0]!.message);
      await api.staff.update(account.id, input.data);
      return null;
    }
    const input = StaffCreateSchema.safeParse({ name, email, roles });
    if (!input.success) throw new Error(input.error.issues[0]!.message);
    return api.staff.create(input.data);
  }, account ? "Staff member updated" : undefined);

  const toggle = (role: StaffRoleName) => setRoles((r) => (r.includes(role) ? r.filter((x) => x !== role) : [...r, role]));

  return (
    <Modal title={account ? `Edit ${account.name}` : "Add staff"} onClose={onClose}>
      <form
        noValidate
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setError("");
          save.mutate(undefined, {
            onSuccess: (created) => (created && onCreated ? onCreated(created, created.temporaryPassword) : onClose()),
            onError: (err) => setError(err instanceof Error && !("code" in err) ? err.message : errorMessage(err)),
          });
        }}
      >
        <label className="block text-sm font-medium text-ink">
          Full name
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus className={`${inputClass} mt-1.5`} />
        </label>
        <label className="block text-sm font-medium text-ink">
          Work email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={Boolean(account)} className={`${inputClass} mt-1.5`} />
          {account && <span className="mt-1 block text-xs font-normal text-muted">Email is the sign-in name and can't be changed.</span>}
        </label>
        <fieldset>
          <legend className="text-sm font-medium text-ink">Roles</legend>
          <div className="mt-2 space-y-2">
            {ROLES.map((r) => {
              const locked = self && r.value === "SUPER_ADMIN";
              return (
                <label key={r.value} className={`flex items-start gap-3 rounded-lg border p-3 ${roles.includes(r.value) ? "border-gold bg-cream-soft" : "border-line"} ${locked ? "opacity-60" : ""}`}>
                  <input type="checkbox" checked={roles.includes(r.value)} disabled={locked} onChange={() => toggle(r.value)} className="mt-0.5 size-4 accent-[var(--color-gold-deep)]" />
                  <span>
                    <span className="block text-sm font-semibold text-ink">{r.label}</span>
                    <span className="block text-xs text-muted">{locked ? "You can't remove your own super admin role" : r.hint}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
        {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
        <div className="flex gap-2">
          <button type="submit" disabled={save.isPending} className="btn btn-dark disabled:opacity-50">{save.isPending ? "Saving…" : account ? "Save changes" : "Create account"}</button>
          <button type="button" onClick={onClose} className="btn btn-outline">Cancel</button>
        </div>
      </form>
    </Modal>
  );
}

function PasswordReveal({ name, email, password, onClose }: { name: string; email: string; password: string; onClose: () => void }) {
  const copy = (text: string, what: string) => navigator.clipboard?.writeText(text).then(() => toast.success(`${what} copied`), () => toast.error("Couldn't copy — select it instead"));
  const message = `Your Booking CRM account is ready.\nSign in at ${typeof window === "undefined" ? "" : window.location.origin}/admin with ${email}\nTemporary password: ${password}\nYou'll set up your authenticator and choose your own password when you first sign in.`;
  return (
    <Modal title="Temporary password" onClose={onClose}>
      <p className="text-sm text-muted">Share this with {name} privately. It's shown only once — they'll replace it at their first sign-in.</p>
      <div className="mt-4 flex items-center gap-2">
        <code className="flex-1 rounded-md bg-cream px-3 py-3 text-center font-mono text-lg tracking-wider text-ink">{password}</code>
        <button type="button" onClick={() => copy(password, "Password")} aria-label="Copy password" className="grid size-11 place-items-center rounded-md ring-1 ring-line hover:ring-gold">
          <Copy className="size-4" aria-hidden />
        </button>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" onClick={() => copy(message, "Sign-in message")} className="btn btn-outline btn-sm">
          <Copy aria-hidden />
          Copy sign-in message
        </button>
        <button type="button" onClick={onClose} className="btn btn-dark btn-sm">Done</button>
      </div>
    </Modal>
  );
}
