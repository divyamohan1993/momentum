// Password login is permanently retired. It cannot issue a session.
export async function POST() {
  return Response.json({ error: "Use Google sign-in" }, { status: 410 });
}
