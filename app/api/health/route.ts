// Public + inert (H5): no Firestore, no Gemini, no push — safe for Cloud Run health checks.
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ status: "ok", service: "momentum", time: new Date().toISOString() });
}
