import { guard } from "@/lib/auth";
import { calendarEnabled } from "@/lib/config";
import { freeBusyToday } from "@/lib/calendar";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const g = await guard(req);
  if ("res" in g) return g.res;
  if (!calendarEnabled()) return Response.json({ enabled: false, connected: false, busy: [], free: [] });
  try {
    const r = await freeBusyToday();
    return Response.json({ enabled: true, ...r });
  } catch {
    return Response.json({ enabled: true, connected: false, busy: [], free: [] });
  }
}
