import { describe, expect, it } from "vitest";
import { checkedInToday, pastDeadline, schoolDay } from "./schoolTime";

describe("schoolDay", () => {
  it("uses Eastern Daylight Time in the summer", () => {
    // 2026-07-01 03:30 UTC is 2026-06-30 23:30 EDT (UTC-4)
    expect(schoolDay(Date.UTC(2026, 6, 1, 3, 30))).toEqual({ dayKey: "2026-06-30", minutes: 23 * 60 + 30 });
  });

  it("uses Eastern Standard Time in the winter", () => {
    // 2026-12-01 04:30 UTC is 2026-11-30 23:30 EST (UTC-5)
    expect(schoolDay(Date.UTC(2026, 11, 1, 4, 30))).toEqual({ dayKey: "2026-11-30", minutes: 23 * 60 + 30 });
  });

  it("handles the day daylight saving time ends", () => {
    // 2026-11-01: clocks go back at 2am EDT. 07:00 UTC is 2:00 EST
    expect(schoolDay(Date.UTC(2026, 10, 1, 7, 0))).toEqual({ dayKey: "2026-11-01", minutes: 120 });
    // and midnight is 00, not 24
    expect(schoolDay(Date.UTC(2026, 10, 1, 4, 0)).minutes).toBe(0);
  });
});

describe("checkedInToday", () => {
  const now = Date.UTC(2026, 10, 9, 20, 0); // 3pm EST
  it("is true for earlier the same school day", () => {
    expect(checkedInToday(Date.UTC(2026, 10, 9, 13, 0), now)).toBe(true); // 8am EST
  });
  it("is false for yesterday evening, even within 24 hours", () => {
    expect(checkedInToday(Date.UTC(2026, 10, 9, 3, 0), now)).toBe(false); // 10pm EST the day before
  });
  it("is false when they've never checked in", () => {
    expect(checkedInToday(undefined, now)).toBe(false);
    expect(checkedInToday(null, now)).toBe(false);
  });
});

describe("pastDeadline", () => {
  it("compares against school time", () => {
    const now = Date.UTC(2026, 10, 9, 1, 0); // 8pm EST on the 8th
    expect(pastDeadline(20 * 60, now)).toBe(true);
    expect(pastDeadline(20 * 60 + 1, now)).toBe(false);
  });
});
