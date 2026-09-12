/** Server transport, imported only by the server-only brain. No API keys or tools. */
export class BrainUnavailable extends Error {}

export const MAX_PROMPT_BYTES = 16_000;
export const MAX_OUTPUT_TOKENS = 2048;

type Dependencies = {
  project: string;
  token: () => Promise<string | null>;
  reserve: () => Promise<{ allowed: boolean }>;
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
};

export async function vertexGenerate(system: string, user: string, deps: Dependencies): Promise<string> {
  if (!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(deps.project)) throw new BrainUnavailable("configuration");
  if (Buffer.byteLength(system + user, "utf8") > MAX_PROMPT_BYTES) throw new BrainUnavailable("input_limit");
  const endpoint = `https://aiplatform.googleapis.com/v1/projects/${deps.project}/locations/global/publishers/google/models/gemini-2.5-flash-lite:generateContent`;
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: user }] }],
    generationConfig: {
      temperature: 0.2, responseMimeType: "application/json", candidateCount: 1,
      maxOutputTokens: MAX_OUTPUT_TOKENS, thinkingConfig: { thinkingBudget: 0 },
    },
    safetySettings: ["HARM_CATEGORY_HATE_SPEECH", "HARM_CATEGORY_DANGEROUS_CONTENT", "HARM_CATEGORY_SEXUALLY_EXPLICIT", "HARM_CATEGORY_HARASSMENT"]
      .map((category) => ({ category, threshold: "BLOCK_MEDIUM_AND_ABOVE" })),
  });
  let reason = "unavailable";
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt) await deps.sleep(500);
    // Charge every outgoing attempt, including retries, against the durable cap.
    if (!(await deps.reserve()).allowed) throw new BrainUnavailable("rate_or_daily_limit");
    let token: string | null;
    try { token = await deps.token(); } catch { throw new BrainUnavailable("authentication"); }
    if (!token) throw new BrainUnavailable("authentication");
    let res: Response;
    try {
      res = await deps.fetch(endpoint, {
        method: "POST", redirect: "error",
        headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
        body, signal: AbortSignal.timeout(15_000),
      });
    } catch { reason = "network_or_timeout"; continue; }
    if (!res.ok) {
      await res.body?.cancel();
      reason = `http_${res.status}`;
      if (res.status < 500) break;
      continue;
    }
    const data = await res.json() as { candidates?: { finishReason?: string; content?: { parts?: { text?: string; thought?: boolean }[] } }[] };
    const candidate = data.candidates?.[0];
    if (candidate?.finishReason !== "STOP") throw new BrainUnavailable("blocked_or_incomplete");
    const text = candidate.content?.parts?.filter((p) => !p.thought).map((p) => p.text ?? "").join("");
    if (!text) throw new BrainUnavailable("empty_response");
    return text;
  }
  throw new BrainUnavailable(reason);
}
