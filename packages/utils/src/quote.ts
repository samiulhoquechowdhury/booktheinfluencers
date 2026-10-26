// Quote money rules — trd.md §6. Integer paise and basis points only.

export type QuoteLine = { customerAmountPaise: bigint; taxRateBps: number };

/** Tax on one line, rounded half-up to the paisa. */
export function lineTaxPaise(line: QuoteLine): bigint {
  if (line.customerAmountPaise < 0n) throw new RangeError("Line amounts cannot be negative");
  return (line.customerAmountPaise * BigInt(line.taxRateBps) + 5_000n) / 10_000n;
}

export type QuoteTotals = { subtotalPaise: bigint; taxPaise: bigint; totalPaise: bigint };

/** Totals are sums of the already-rounded line values. */
export function computeQuoteTotals(lines: readonly QuoteLine[]): QuoteTotals {
  let subtotalPaise = 0n;
  let taxPaise = 0n;
  for (const line of lines) {
    subtotalPaise += line.customerAmountPaise;
    taxPaise += lineTaxPaise(line);
  }
  return { subtotalPaise, taxPaise, totalPaise: subtotalPaise + taxPaise };
}

export type MilestoneShare = { label: string; percentBps: number };

/** Splits a total by percentage; the last milestone takes any rounding remainder so parts sum exactly. */
export function splitIntoMilestones(totalPaise: bigint, plan: readonly MilestoneShare[]) {
  const bpsSum = plan.reduce((sum, part) => sum + part.percentBps, 0);
  if (bpsSum !== 10_000) throw new RangeError("Milestone percentages must add up to 100%");

  let allocated = 0n;
  return plan.map((part, index) => {
    const amountPaise =
      index === plan.length - 1 ? totalPaise - allocated : (totalPaise * BigInt(part.percentBps)) / 10_000n;
    allocated += amountPaise;
    return { label: part.label, amountPaise };
  });
}
