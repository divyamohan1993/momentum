import { Temporal } from "@js-temporal/polyfill";
import type { Recurrence } from "./types";
/** Preserve local clock time through daylight-saving changes and clamp month ends. */
export function nextOccurrence(rec: Recurrence, fromIso?: string, timeZone = "Asia/Kolkata"): string {
  const base = Temporal.Instant.from(fromIso ?? new Date().toISOString()).toZonedDateTimeISO(timeZone);
  if (rec.every === "week" && rec.daysOfWeek?.length) {
    for (let i = 1; i <= 7 * rec.interval + 7; i++) {
      const candidate = base.add({ days: i });
      const week = Math.floor((base.dayOfWeek - 1 + i) / 7);
      if (week % rec.interval === 0 && rec.daysOfWeek.includes(candidate.dayOfWeek % 7)) return candidate.toInstant().toString({ fractionalSecondDigits: 3 });
    }
  }
  let next = rec.every === "day" ? base.add({ days: rec.interval }) : rec.every === "week" ? base.add({ weeks: rec.interval }) : base.add({ months: rec.interval });
  if (rec.every === "month") next = next.with({ day: Math.min(rec.dayOfMonth ?? base.day, next.daysInMonth) });
  return next.toInstant().toString({ fractionalSecondDigits: 3 });
}
