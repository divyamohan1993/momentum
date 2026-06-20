import type { Recurrence } from "./types";

/** Next occurrence datetime (UTC ISO), preserving the time-of-day of `fromIso`. */
export function nextOccurrence(rec: Recurrence, fromIso?: string): string {
  const base = fromIso ? new Date(fromIso) : new Date();
  if (rec.every === "week" && rec.daysOfWeek?.length) {
    for (let i = 1; i <= 7; i++) {
      const cand = new Date(base);
      cand.setUTCDate(cand.getUTCDate() + i);
      if (rec.daysOfWeek.includes(cand.getUTCDay())) return cand.toISOString();
    }
  }
  const d = new Date(base);
  if (rec.every === "day") d.setUTCDate(d.getUTCDate() + rec.interval);
  else if (rec.every === "month") d.setUTCMonth(d.getUTCMonth() + rec.interval);
  else d.setUTCDate(d.getUTCDate() + 7 * rec.interval);
  return d.toISOString();
}
