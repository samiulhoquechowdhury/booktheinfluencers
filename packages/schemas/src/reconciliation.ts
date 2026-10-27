// Payment reconciliation results (CRM → Payments). The checks live in @repo/db (reconcilePayments).

export type ReconciliationFindingRecord = {
  code: string;
  severity: "error" | "warning";
  message: string;
  leadId: string | null;
  ref: string | null;
  amountPaise?: string;
};

export type ReconciliationRunRecord = {
  id: string;
  ranAt: string;
  /** "schedule", or who ran it */
  trigger: string;
  ok: boolean;
  errorCount: number;
  warnCount: number;
  findings: ReconciliationFindingRecord[];
  totals: { capturedPaise: string; paidMilestones: number; payoutsPaidPaise: string; checkedMilestones: number; checkedPayouts: number };
};

export type ReconciliationOverview = {
  latest: ReconciliationRunRecord | null;
  /** Most recent first, without findings. */
  history: Omit<ReconciliationRunRecord, "findings" | "totals">[];
};
