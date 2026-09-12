import { Temporal } from "@js-temporal/polyfill";
export const IST_OFFSET_MIN = 330;
export const VAGUE_HOURS: Record<string, [number, number]> = { morning: [9, 0], noon: [12, 0], midday: [12, 0], afternoon: [15, 0], evening: [18, 0], night: [21, 0], tonight: [21, 0], eod: [23, 59], "end of day": [23, 59] };
export const nowUtcIso = () => new Date().toISOString();
export function nowIstParts(timeZone = "Asia/Kolkata") {
  const t = Temporal.Now.zonedDateTimeISO(timeZone);
  return { y: t.year, mo: t.month, d: t.day, h: t.hour, mi: t.minute, weekday: t.dayOfWeek % 7 };
}
export function istWallToUtcIso(y: number, mo: number, d: number, h: number, mi: number, timeZone = "Asia/Kolkata"): string {
  return Temporal.ZonedDateTime.from({ year: y, month: mo, day: d, hour: h, minute: mi, timeZone }).toInstant().toString({ fractionalSecondDigits: 3 });
}
export function formatIst(iso: string, timeZone = "Asia/Kolkata"): string {
  return new Intl.DateTimeFormat("en", { timeZone, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZoneName: "short" }).format(new Date(iso));
}
export function dateInput(iso: string | undefined, timeZone: string): string {
  return iso ? Temporal.Instant.from(iso).toZonedDateTimeISO(timeZone).toPlainDateTime().toString({ smallestUnit: "minute" }) : "";
}
export function parseDateInput(value: string, timeZone: string): string {
  return Temporal.PlainDateTime.from(value).toZonedDateTime(timeZone).toInstant().toString({ fractionalSecondDigits: 3 });
}
export const hoursUntil = (iso: string) => (new Date(iso).getTime() - Date.now()) / 3_600_000;
export const isPast = (iso: string | undefined) => !!iso && new Date(iso).getTime() <= Date.now();
export function nowContextForBrain(timeZone = "Asia/Kolkata"): string {
  return `User timezone: ${timeZone}. Current local date/time: ${Temporal.Now.zonedDateTimeISO(timeZone).toString()}. Resolve all relative dates in this timezone and return UTC ISO timestamps.`;
}
