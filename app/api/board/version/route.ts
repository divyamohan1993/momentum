import { guard } from "@/lib/auth";
import { getVersion } from "@/lib/store";

export const dynamic = "force-dynamic";

// Cheap poll target (₹0): reads ONE version doc, not the whole board.
export async function GET(req: Request) {
  const g = await guard(req);
  if ("res" in g) return g.res;
  return Response.json({ version: await getVersion() });
}
