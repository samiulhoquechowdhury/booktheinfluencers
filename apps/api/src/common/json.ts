/**
 * Staff responses carry raw records; this makes them JSON-safe the same way the customer
 * DTOs are: BigInt paise → decimal strings, Dates → ISO strings.
 */
export function jsonSafe<T>(value: T): unknown {
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, jsonSafe(v)]));
  }
  return value;
}
