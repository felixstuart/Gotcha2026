/** The school's time zone. Check-in days and deadlines are in this time, wherever the functions run */
export const SCHOOL_TIME_ZONE = "America/New_York";

// en-CA formats dates as YYYY-MM-DD. hourCycle h23 keeps midnight as 00, not 24
const formatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: SCHOOL_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/**
 * The school day a time falls on, and how far into that day it is.
 * Uses the school's time zone, so daylight saving time is handled.
 * @param ms time in ms since epoch
 * @returns dayKey like "2026-11-08", and minutes after midnight (0 to 1439)
 */
export function schoolDay(ms: number): { dayKey: string; minutes: number } {
  const parts: Record<string, string> = {};
  for (const { type, value } of formatter.formatToParts(new Date(ms))) parts[type] = value;
  return {
    dayKey: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

/** Whether a check-in time (if any) is on the same school day as `now` */
export function checkedInToday(checkedInAt: number | null | undefined, now = Date.now()): boolean {
  return typeof checkedInAt === "number" && schoolDay(checkedInAt).dayKey === schoolDay(now).dayKey;
}

/** Whether `now` is at or past today's check-in deadline */
export function pastDeadline(deadlineMinutes: number, now = Date.now()): boolean {
  return schoolDay(now).minutes >= deadlineMinutes;
}
