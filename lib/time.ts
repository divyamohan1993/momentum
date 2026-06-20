/** IST (UTC+5:30) helpers. No TZ library — fixed offset, India never observes DST. */
export const IST_OFFSET_MIN = 330;

/** Default concrete hour for vague spoken words (§3A table). */
export const VAGUE_HOURS: Record<string, [number, number]> = {
  morning: [9, 0],
  noon: [12, 0],
  midday: [12, 0],
  afternoon: [15, 0],
  evening: [18, 0],
  night: [21, 0],
  tonight: [21, 0],
  eod: [23, 59],
  "end of day": [23, 59],
};

export function nowUtcIso(): string {
  return new Date().toISOString();
}

/** Current wall-clock parts in IST. */
export function nowIstParts(): { y: number; mo: number; d: number; h: number; mi: number; weekday: number } {
  const t = new Date(Date.now() + IST_OFFSET_MIN * 60_000);
  return {
    y: t.getUTCFullYear(),
    mo: t.getUTCMonth() + 1,
    d: t.getUTCDate(),
    h: t.getUTCHours(),
    mi: t.getUTCMinutes(),
    weekday: t.getUTCDay(),
  };
}

/** Convert an IST wall-clock datetime to a UTC ISO string. */
export function istWallToUtcIso(y: number, mo: number, d: number, h: number, mi: number): string {
  const asUtc = Date.UTC(y, mo - 1, d, h, mi, 0);
  return new Date(asUtc - IST_OFFSET_MIN * 60_000).toISOString();
}

/** Human IST label, e.g. "Thu 19 Jun, 18:00 IST". */
export function formatIst(iso: string): string {
  const t = new Date(new Date(iso).getTime() + IST_OFFSET_MIN * 60_000);
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const hh = String(t.getUTCHours()).padStart(2, "0");
  const mm = String(t.getUTCMinutes()).padStart(2, "0");
  return `${days[t.getUTCDay()]} ${t.getUTCDate()} ${months[t.getUTCMonth()]}, ${hh}:${mm} IST`;
}

/** Hours from now until an ISO instant (negative = overdue). */
export function hoursUntil(iso: string): number {
  return (new Date(iso).getTime() - Date.now()) / 3_600_000;
}

export function isPast(iso: string | undefined): boolean {
  return !!iso && new Date(iso).getTime() <= Date.now();
}

/** A compact, model-readable "now" context string for the brain prompt. */
export function nowContextForBrain(): string {
  const p = nowIstParts();
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return `Current IST datetime: ${p.y}-${String(p.mo).padStart(2, "0")}-${String(p.d).padStart(2, "0")} ${String(p.h).padStart(2, "0")}:${String(p.mi).padStart(2, "0")} (${days[p.weekday]}). Timezone IST (UTC+5:30).`;
}
