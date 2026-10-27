import type { PrismaClient } from "./generated/prisma/client";
import { notifyStaff } from "./notify";

// Payment reconciliation, shared by the worker (nightly) and the API (Accounts → "Run now").
// Cross-checks our own records: milestones vs captured payments, unprocessed gateway webhooks, payouts.
// When a real gateway is connected, its settlement report is the next thing to compare against.

export type ReconciliationFinding = {
  code:
    | "PAID_WITHOUT_PAYMENT"
    | "OVERPAID"
    | "PAYMENT_NOT_APPLIED"
    | "CONFIRMED_WITHOUT_ADVANCE"
    | "PAYOUT_MISSING"
    | "PAYOUT_AMOUNT_MISMATCH"
    | "PAYOUT_OVERDUE"
    | "WEBHOOK_NOT_PROCESSED";
  severity: "error" | "warning";
  message: string;
  leadId: string | null;
  ref: string | null;
  amountPaise?: string;
};

export type ReconciliationTotals = {
  capturedPaise: string;
  paidMilestones: number;
  payoutsPaidPaise: string;
  checkedMilestones: number;
  checkedPayouts: number;
};

const DAY = 86_400_000;
const PAYOUT_GRACE_DAYS = 7;
const WEBHOOK_GRACE_MS = 60 * 60_000;

const rupees = (paise: bigint) => `₹${(paise / 100n).toLocaleString("en-IN")}${paise % 100n ? `.${String(paise % 100n).padStart(2, "0")}` : ""}`;

/** Runs every check and saves the run. Accounts and the super admin are emailed when there are errors. */
export async function reconcilePayments(db: PrismaClient, opts: { trigger: string; now?: Date; notify?: boolean } = { trigger: "schedule" }) {
  const started = Date.now();
  const now = opts.now ?? new Date();
  const findings: ReconciliationFinding[] = [];

  const milestones = await db.paymentMilestone.findMany({
    include: { payments: true, booking: { select: { id: true, confirmedAt: true, cancelledAt: true, lead: { select: { id: true, ref: true } }, talent: { select: { stageName: true } } } } },
  });
  let capturedTotal = 0n;
  for (const m of milestones) {
    const captured = m.payments.filter((p) => p.status === "captured").reduce((sum, p) => sum + p.amountPaise, 0n);
    capturedTotal += captured;
    const where = { leadId: m.booking.lead.id, ref: m.booking.lead.ref };
    const label = `${m.label} for ${m.booking.talent.stageName}`;
    if (m.status === "PAID" && captured < m.amountPaise) {
      findings.push({ code: "PAID_WITHOUT_PAYMENT", severity: "error", ...where, amountPaise: String(m.amountPaise - captured), message: `${label} is marked paid, but only ${rupees(captured)} of ${rupees(m.amountPaise)} was received.` });
    }
    if (captured > m.amountPaise) {
      findings.push({ code: "OVERPAID", severity: "error", ...where, amountPaise: String(captured - m.amountPaise), message: `${label}: ${rupees(captured)} received against ${rupees(m.amountPaise)} due — ${rupees(captured - m.amountPaise)} to refund or reallocate.` });
    }
    if (captured >= m.amountPaise && m.amountPaise > 0n && m.status !== "PAID" && m.status !== "REFUNDED") {
      findings.push({ code: "PAYMENT_NOT_APPLIED", severity: "error", ...where, amountPaise: String(captured), message: `${label}: ${rupees(captured)} received but the instalment still shows ${m.status.toLowerCase().replace("_", " ")}.` });
    }
  }

  const bookings = await db.booking.findMany({
    where: { cancelledAt: null, OR: [{ confirmedAt: { not: null } }, { completedAt: { not: null } }] },
    include: { milestones: { select: { isAdvance: true, status: true } }, payout: true, lead: { select: { id: true, ref: true } }, talent: { select: { stageName: true } } },
  });
  let payoutsPaid = 0n;
  let checkedPayouts = 0;
  for (const b of bookings) {
    const where = { leadId: b.lead.id, ref: b.lead.ref };
    if (b.confirmedAt && !b.milestones.some((m) => m.isAdvance && m.status === "PAID")) {
      findings.push({ code: "CONFIRMED_WITHOUT_ADVANCE", severity: "error", ...where, message: `${b.talent.stageName} is confirmed, but the advance isn't recorded as paid.` });
    }
    if (!b.completedAt) continue;
    checkedPayouts++;
    if (!b.payout) {
      findings.push({ code: "PAYOUT_MISSING", severity: "error", ...where, message: `${b.talent.stageName}'s event is complete but there's no payout record.` });
      continue;
    }
    if (b.payout.status === "PAID") payoutsPaid += b.payout.amountPaise;
    if (b.payoutTotalPaise !== null && b.payout.amountPaise !== b.payoutTotalPaise) {
      findings.push({ code: "PAYOUT_AMOUNT_MISMATCH", severity: "error", ...where, amountPaise: String(b.payout.amountPaise), message: `${b.talent.stageName}: payout is ${rupees(b.payout.amountPaise)} but the contracted payout is ${rupees(b.payoutTotalPaise)}.` });
    }
    if (b.payout.status !== "PAID" && b.completedAt.getTime() < now.getTime() - PAYOUT_GRACE_DAYS * DAY) {
      const days = Math.floor((now.getTime() - b.completedAt.getTime()) / DAY);
      findings.push({ code: "PAYOUT_OVERDUE", severity: "warning", ...where, amountPaise: String(b.payout.amountPaise), message: `${b.talent.stageName}'s payout of ${rupees(b.payout.amountPaise)} is still ${b.payout.status.toLowerCase().replace("_", " ")} ${days} days after the event.` });
    }
  }

  const stale = await db.webhookEvent.findMany({ where: { processedAt: null, receivedAt: { lt: new Date(now.getTime() - WEBHOOK_GRACE_MS) } }, take: 50 });
  for (const w of stale) {
    findings.push({ code: "WEBHOOK_NOT_PROCESSED", severity: "warning", leadId: null, ref: null, message: `A ${w.provider} notification (${w.id}) received ${w.receivedAt.toISOString().slice(0, 16).replace("T", " ")} UTC was never processed.` });
  }

  const errorCount = findings.filter((f) => f.severity === "error").length;
  const warnCount = findings.length - errorCount;
  const totals: ReconciliationTotals = {
    capturedPaise: String(capturedTotal),
    paidMilestones: milestones.filter((m) => m.status === "PAID").length,
    payoutsPaidPaise: String(payoutsPaid),
    checkedMilestones: milestones.length,
    checkedPayouts,
  };

  const run = await db.$transaction(async (tx) => {
    const saved = await tx.reconciliationRun.create({
      data: { trigger: opts.trigger, ok: errorCount === 0, errorCount, warnCount, findings, totals, durationMs: Date.now() - started },
    });
    if (errorCount > 0 && opts.notify !== false) {
      const people = await tx.user.findMany({ where: { disabledAt: null, roles: { hasSome: ["ACCOUNTS", "SUPER_ADMIN"] } }, select: { id: true } });
      for (const p of people) {
        await notifyStaff(tx, p.id, {
          event: "reconciliation.issues",
          subject: `Payment check: ${errorCount} issue${errorCount === 1 ? "" : "s"} to look at`,
          body: `${findings.filter((f) => f.severity === "error").slice(0, 5).map((f) => `• ${f.ref ? `${f.ref}: ` : ""}${f.message}`).join("\n")}${errorCount > 5 ? `\n…and ${errorCount - 5} more` : ""}\n\nOpen CRM → Payments to see them all.`,
        });
      }
    }
    return saved;
  });
  return { id: run.id, ok: run.ok, errorCount, warnCount, findings, totals };
}
