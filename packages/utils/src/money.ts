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
