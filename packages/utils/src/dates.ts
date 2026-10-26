// Display dates in India time (srs §2.3); storage stays UTC/ISO.
const TIME_ZONE = "Asia/Kolkata";

const dateFormat = new Intl.DateTimeFormat("en-IN", {
  timeZone: TIME_ZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
});

const dateTimeFormat = new Intl.DateTimeFormat("en-IN", {
  timeZone: TIME_ZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

const weekdayFormat = new Intl.DateTimeFormat("en-IN", { timeZone: TIME_ZONE, weekday: "short" });

/** "26 Oct 2026" */
export function formatDate(value: Date | string): string {
  return dateFormat.format(new Date(value));
}

/** "Mon, 26 Oct 2026" */
export function formatDateWithWeekday(value: Date | string): string {
  // Built from parts: en-IN puts a comma after the month when the weekday is included.
  return `${weekdayFormat.format(new Date(value))}, ${formatDate(value)}`;
}

/** "26 Oct 2026, 3:05 pm" */
export function formatDateTime(value: Date | string): string {
  return dateTimeFormat.format(new Date(value));
}

/** Calendar date ("2026-10-26") of an instant, in India time. */
export function toIstDateKey(value: Date | string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
  return parts;
}
