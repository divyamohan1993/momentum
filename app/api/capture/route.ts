import { readBrainBody } from "@/lib/brain-request";
import { guard } from "@/lib/auth";
import { capture } from "@/lib/brain";
import { createFromCapture } from "@/lib/actions";

export const dynamic = "force-dynamic";

// Brain-dump → structured tasks → created. Low-confidence dates are flagged on the card,
// not silently trusted (§3A). Creation isn't a paid action, so we create + let the user fix.
export async function POST(req: Request) {
  const g = await guard(req, { mutation: true });
  if ("res" in g) return g.res;
  const body = await readBrainBody(req);
  if ("res" in body) return body.res;
  const b = body.data;
  if (typeof b.text !== "string" || !b.text.trim())
    return Response.json({ error: "text required" }, { status: 400 });

  if ((b.text as string).length > 6000) return Response.json({ error: "Use at most 6000 characters" }, { status: 413 });

  const { result, degraded } = await capture(g.owner, b.text.trim());
  const tasks = await createFromCapture(g.owner, result.tasks);
  return Response.json({ tasks, degraded, count: tasks.length });
}
