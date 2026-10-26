import { computeQuoteTotals } from "@repo/utils";
import type { QuoteDraftLine, QuoteRate } from "@repo/mock/staff";

/**
 * QUO-6 preview while staff type: the same rule the API applies on submit, computed from the
 * rate card figures the draft endpoint returns. The API's answer on submit is what counts.
 */
export function quoteChecks(lines: QuoteDraftLine[], rate: QuoteRate) {
  const totals = computeQuoteTotals(lines.map((l) => ({ customerAmountPaise: BigInt(l.customerAmountPaise || "0"), taxRateBps: l.taxRateBps })));
  const costPaise = lines.reduce((sum, l) => sum + BigInt(l.internalCostPaise || "0"), 0n);
  const marginPaise = totals.subtotalPaise - costPaise;
  const marginBps = totals.subtotalPaise > 0n ? Number((marginPaise * 10_000n) / totals.subtotalPaise) : 0;
  const fee = lines.filter((l) => l.type === "TALENT_FEE").reduce((sum, l) => sum + BigInt(l.customerAmountPaise || "0"), 0n);
  const reasons = [
    ...(fee < BigInt(rate.minimumRatePaise) ? ["Artist fee is below the minimum rate"] : []),
    ...(marginBps < rate.marginFloorBps ? [`Margin is below the ${rate.marginFloorBps / 100}% floor`] : []),
  ];
  return { ...totals, costPaise, marginPaise, marginBps, sellingRatePaise: BigInt(rate.sellingRatePaise), needsApproval: reasons.length > 0, reasons };
}
