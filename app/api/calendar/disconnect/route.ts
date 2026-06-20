import { guard } from "@/lib/auth";
import { clearGoogleToken } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const g = await guard(req, { mutation: true });
  if ("res" in g) return g.res;
  await clearGoogleToken();
  return Response.json({ ok: true });
}
