import { guard } from "@/lib/auth";
import { env, pushEnabled } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const g = await guard(req);
  if ("res" in g) return g.res;
  return Response.json({ key: env().vapidPublic, enabled: pushEnabled() });
}
