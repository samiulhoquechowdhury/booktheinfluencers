import type { ReconciliationFindingRecord, ReconciliationOverview, ReconciliationRunRecord } from "@repo/schemas";
import { formatINR } from "@repo/utils";
import { TALENTS } from "./catalogue/data";
import type { StaffUser } from "./internal";
import { ApiError, newId, nowIso } from "./server";
import type { MockDb } from "./types";

// Payment reconciliation for the in-browser mock: the same checks as @repo/db reconcilePayments, minus
// gateway webhooks (the demo has no gateway). Runs only on demand — there's no nightly job in the browser.

const DAY = 86_400_000;
const KEEP = 30;
const rupees = (paise: bigint) => formatINR(paise);

function requireAccounts(actor: StaffUser) {
  if (!actor.roles.includes("ACCOUNTS") && !actor.roles.includes("SUPER_ADMIN")) throw new ApiError("FORBIDDEN", "Payment checks are for Accounts");
}

export function runReconciliation(db: MockDb, actor: StaffUser, now = new Date()): ReconciliationRunRecord {
  requireAccounts(actor);
  const findings: ReconciliationFindingRecord[] = [];
  const leadOf = (bookingId: string) => {
    const booking = db.bookings.find((b) => b.id === bookingId);
    const lead = booking && db.leads.find((l) => l.id === booking.leadId);
    return { booking, where: { leadId: lead?.id ?? null, ref: lead?.ref ?? null }, name: TALENTS.find((t) => t.slug === booking?.talentSlug)?.stageName ?? booking?.talentSlug ?? "" };
  };

  let captured = 0n;
  for (const m of db.milestones) {
    const got = db.payments.filter((p) => p.milestoneId === m.id && p.status === "captured").reduce((s, p) => s + BigInt(p.amountPaise), 0n);
    captured += got;
    const due = BigInt(m.amountPaise);
    const { where, name } = leadOf(m.bookingId);
    const label = `${m.label} for ${name}`;
    if (m.status === "PAID" && got < due) findings.push({ code: "PAID_WITHOUT_PAYMENT", severity: "error", ...where, amountPaise: String(due - got), message: `${label} is marked paid, but only ${rupees(got)} of ${rupees(due)} was received.` });
    if (got > due) findings.push({ code: "OVERPAID", severity: "error", ...where, amountPaise: String(got - due), message: `${label}: ${rupees(got)} received against ${rupees(due)} due — ${rupees(got - due)} to refund or reallocate.` });
    if (got >= due && due > 0n && m.status !== "PAID" && m.status !== "REFUNDED") findings.push({ code: "PAYMENT_NOT_APPLIED", severity: "error", ...where, amountPaise: String(got), message: `${label}: ${rupees(got)} received but the instalment still shows ${m.status.toLowerCase().replace("_", " ")}.` });
  }

  let payoutsPaid = 0n;
  let checkedPayouts = 0;
  for (const b of db.bookings.filter((x) => !x.cancelledAt && (x.confirmedAt || x.completedAt))) {
    const { where, name } = leadOf(b.id);
    if (b.confirmedAt && !db.milestones.some((m) => m.bookingId === b.id && m.isAdvance && m.status === "PAID")) {
      findings.push({ code: "CONFIRMED_WITHOUT_ADVANCE", severity: "error", ...where, message: `${name} is confirmed, but the advance isn't recorded as paid.` });
    }
    if (!b.completedAt) continue;
    checkedPayouts++;
    const payout = db.payouts.find((p) => p.bookingId === b.id);
    if (!payout) {
      findings.push({ code: "PAYOUT_MISSING", severity: "error", ...where, message: `${name}'s event is complete but there's no payout record.` });
      continue;
    }
    if (payout.status === "PAID") payoutsPaid += BigInt(payout.amountPaise);
    if (b.payoutTotalPaise !== null && payout.amountPaise !== b.payoutTotalPaise) findings.push({ code: "PAYOUT_AMOUNT_MISMATCH", severity: "error", ...where, amountPaise: payout.amountPaise, message: `${name}: payout is ${rupees(BigInt(payout.amountPaise))} but the contracted payout is ${rupees(BigInt(b.payoutTotalPaise))}.` });
    const done = new Date(b.completedAt).getTime();
    if (payout.status !== "PAID" && done < now.getTime() - 7 * DAY) {
      findings.push({ code: "PAYOUT_OVERDUE", severity: "warning", ...where, amountPaise: payout.amountPaise, message: `${name}'s payout of ${rupees(BigInt(payout.amountPaise))} is still ${payout.status.toLowerCase().replace("_", " ")} ${Math.floor((now.getTime() - done) / DAY)} days after the event.` });
    }
  }

  const errorCount = findings.filter((f) => f.severity === "error").length;
  const run: ReconciliationRunRecord = {
    id: newId("recon"),
    ranAt: nowIso(),
    trigger: actor.name,
    ok: errorCount === 0,
    errorCount,
    warnCount: findings.length - errorCount,
    findings,
    totals: { capturedPaise: String(captured), paidMilestones: db.milestones.filter((m) => m.status === "PAID").length, payoutsPaidPaise: String(payoutsPaid), checkedMilestones: db.milestones.length, checkedPayouts },
  };
  db.reconciliationRuns = [run, ...db.reconciliationRuns].slice(0, KEEP);
  return run;
}

export function reconciliationOverview(db: MockDb, actor: StaffUser): ReconciliationOverview {
  requireAccounts(actor);
  return {
    latest: db.reconciliationRuns[0] ?? null,
    history: db.reconciliationRuns.slice(0, 14).map(({ findings: _f, totals: _t, ...rest }) => rest),
  };
}
