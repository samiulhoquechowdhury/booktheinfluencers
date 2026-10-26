import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime, formatDateWithWeekday, toIstDateKey } from "./dates";

describe("dates (India time)", () => {
  // 20:00 UTC is 01:30 the next day in India.
  const lateUtc = "2026-10-26T20:00:00.000Z";

  it("formats the calendar date in IST", () => {
    expect(formatDate(lateUtc)).toBe("27 Oct 2026");
    expect(toIstDateKey(lateUtc)).toBe("2026-10-27");
  });

  it("includes the weekday", () => {
    expect(formatDateWithWeekday(lateUtc)).toBe("Tue, 27 Oct 2026");
  });

  it("formats date and time in IST", () => {
    expect(formatDateTime(lateUtc)).toMatch(/^27 Oct 2026, 1:30\s?am$/i);
  });
});
