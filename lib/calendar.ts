import "server-only";
import { OAuth2Client } from "google-auth-library";
import { env } from "./config";
import { getGoogleToken } from "./store";
import { nowIstParts, istWallToUtcIso } from "./time";

/** Google Calendar (read-only free/busy) so the brain can schedule around real meetings. */
const SCOPE = "https://www.googleapis.com/auth/calendar.readonly";

export function oauthClient(): OAuth2Client {
  return new OAuth2Client(env().googleClientId, env().googleClientSecret, `${env().appBaseUrl}/api/calendar/callback`);
}

export function authUrl(state: string): string {
  return oauthClient().generateAuthUrl({ access_type: "offline", prompt: "consent", scope: [SCOPE], state });
}

export async function exchangeCode(code: string): Promise<string | null> {
  const { tokens } = await oauthClient().getToken(code);
  return tokens.refresh_token ?? null;
}

type Slot = { start: string; end: string };

function computeFree(startIso: string, endIso: string, busy: Slot[]): Slot[] {
  const MIN = 25 * 60_000; // ignore gaps under 25 min
  const sorted = [...busy].sort((a, b) => a.start.localeCompare(b.start));
  const free: Slot[] = [];
  let cursor = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  for (const b of sorted) {
    const bs = new Date(b.start).getTime();
    const be = new Date(b.end).getTime();
    if (bs - cursor >= MIN) free.push({ start: new Date(cursor).toISOString(), end: new Date(bs).toISOString() });
    cursor = Math.max(cursor, be);
  }
  if (end - cursor >= MIN) free.push({ start: new Date(cursor).toISOString(), end: new Date(end).toISOString() });
  return free;
}

export async function freeBusyToday(): Promise<{ connected: boolean; busy: Slot[]; free: Slot[] }> {
  const rt = await getGoogleToken();
  if (!rt) return { connected: false, busy: [], free: [] };
  const c = oauthClient();
  c.setCredentials({ refresh_token: rt });
  const at = (await c.getAccessToken()).token;
  if (!at) return { connected: true, busy: [], free: [] };

  const p = nowIstParts();
  const windowStart = istWallToUtcIso(p.y, p.mo, p.d, Math.min(Math.max(p.h, 8), 21), p.h >= 8 ? p.mi : 0);
  const windowEnd = istWallToUtcIso(p.y, p.mo, p.d, 22, 0);

  const res = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    headers: { authorization: `Bearer ${at}`, "content-type": "application/json" },
    body: JSON.stringify({ timeMin: windowStart, timeMax: windowEnd, items: [{ id: "primary" }] }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) return { connected: true, busy: [], free: [] };
  const data = (await res.json()) as { calendars?: { primary?: { busy?: Slot[] } } };
  const busy = (data.calendars?.primary?.busy ?? []).map((b) => ({ start: b.start, end: b.end }));
  return { connected: true, busy, free: computeFree(windowStart, windowEnd, busy) };
}
