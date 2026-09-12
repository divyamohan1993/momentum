/** Bound the body while streaming; Content-Length alone is not a trusted limit. */
export async function readBrainBody(req: Request, maxBytes = 32_000): Promise<{ data: Record<string, unknown> } | { res: Response }> {
  const reader = req.body?.getReader();
  if (!reader) return { res: Response.json({ error: "JSON body required" }, { status: 400 }) };
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        return { res: Response.json({ error: "Input too large" }, { status: 413 }) };
      }
      chunks.push(value);
    }
    const data: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("object required");
    return { data: data as Record<string, unknown> };
  } catch {
    return { res: Response.json({ error: "Invalid JSON" }, { status: 400 }) };
  } finally { reader.releaseLock(); }
}
