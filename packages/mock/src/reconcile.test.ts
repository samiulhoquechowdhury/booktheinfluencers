import { describe, expect, it } from "vitest";
import { STAFF_USERS } from "./internal";
import { buildSeed } from "./seed";
import { reconciliationOverview, runReconciliation } from "./reconcile";

const staff = (role: string) => STAFF_USERS.find((s) => s.roles.includes(role as never))!;

describe("mock reconciliation", () => {
  it("checks instalments against payments and keeps the run", () => {
    const db = buildSeed();
    const milestone = db.milestones.find((m) => m.status !== "PAID" && m.status !== "CANCELLED")!;
    db.payments.push({ id: "pay_x", milestoneId: milestone.id, method: "upi", gatewayPaymentId: "g_x", amountPaise: milestone.amountPaise, status: "captured", receivedAt: new Date().toISOString() });
    const run = runReconciliation(db, staff("ACCOUNTS"));
    expect(run.findings.some((f) => f.code === "PAYMENT_NOT_APPLIED")).toBe(true);
    expect(run.ok).toBe(false);
    expect(reconciliationOverview(db, staff("ACCOUNTS")).latest?.id).toBe(run.id);
    expect(() => runReconciliation(db, staff("SALES"))).toThrow(/Accounts/);
  });
});
