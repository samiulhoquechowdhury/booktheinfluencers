const rupeeGrouping = new Intl.NumberFormat("en-IN");

/** Formats integer paise as Indian rupees, e.g. 12345600n → "₹1,23,456". No float math. */
export function formatINR(paise: bigint): string {
  const sign = paise < 0n ? "-" : "";
  const abs = paise < 0n ? -paise : paise;
  const rupees = rupeeGrouping.format(abs / 100n);
  const rest = abs % 100n;
  return rest === 0n
    ? `${sign}₹${rupees}`
    : `${sign}₹${rupees}.${rest.toString().padStart(2, "0")}`;
}

const compactUnits = [
  { size: 10_000_000n, suffix: "Cr" },
  { size: 100_000n, suffix: "L" },
  { size: 1_000n, suffix: "k" },
] as const;

/**
 * Short form for fee bands and filters, e.g. 30000000n → "₹3L", 15000000n → "₹1.5L".
 * Rounds down to one decimal; amounts under ₹1,000 fall back to formatINR.
 */
export function formatINRCompact(paise: bigint): string {
  const sign = paise < 0n ? "-" : "";
  const rupees = (paise < 0n ? -paise : paise) / 100n;
  const unit = compactUnits.find(({ size }) => rupees >= size);
  if (!unit) return formatINR(paise);
  const tenths = (rupees * 10n) / unit.size;
  const decimal = tenths % 10n === 0n ? "" : `.${tenths % 10n}`;
  return `${sign}₹${rupeeGrouping.format(tenths / 10n)}${decimal}${unit.suffix}`;
}
