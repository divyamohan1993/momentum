import "server-only";

/**
 * Server-only env. Validated lazily on first request (NOT at module load) so
 * `next build` inside Docker — where secrets are absent — does not crash.
 * Required vars throw at runtime; brain/push vars are optional (app degrades).
 */
export type Env = {
  ownerEmail: string;
  ownerGoogleUid: string;
  ownerGoogleSub: string;
  firebaseApiKey: string;
  firebaseAppId: string;
  appOrigin: string;
  sessionSecret: string;
  fieldKey: string;
  edgeSecret: string;
  vertexLocation: string;
  geminiModel: string;
  geminiDailyCap: number;
  vapidPublic: string;
  vapidPrivate: string;
  vapidSubject: string;
  gcpProject: string;
  firestoreDb: string;
  sweepInvokerSa: string;
  sweepAudience: string;
  appBaseUrl: string;
  tasksLocation: string;
  tasksQueue: string;
  googleClientId: string;
  googleClientSecret: string;
};

let cached: Env | null = null;

function need(k: string): string {
  const v = process.env[k];
  if (!v) throw new Error(`Missing required env: ${k}`);
  return v;
}

export function env(): Env {
  if (cached) return cached;
  cached = {
    ownerEmail: need("OWNER_EMAIL").toLowerCase(),
    ownerGoogleUid: process.env.OWNER_GOOGLE_UID ?? "",
    ownerGoogleSub: process.env.OWNER_GOOGLE_SUB ?? "",
    firebaseApiKey: process.env.FIREBASE_API_KEY ?? "",
    firebaseAppId: process.env.FIREBASE_APP_ID ?? "",
    appOrigin: process.env.APP_ORIGIN ?? "https://momentum.dmj.one",
    sessionSecret: need("SESSION_SECRET"),
    fieldKey: need("FIELD_KEY"),
    edgeSecret: process.env.EDGE_SECRET ?? "",
    vertexLocation: process.env.VERTEX_LOCATION ?? "global",
    geminiModel: process.env.GEMINI_MODEL ?? "gemini-2.5-flash-lite",
    // Invalid limits fail closed; deployment cannot accidentally remove the cost guard.
    geminiDailyCap: /^(0|[1-9]\d*)$/.test(process.env.GEMINI_DAILY_CAP ?? "200")
      ? Math.min(200, Number(process.env.GEMINI_DAILY_CAP ?? "200")) : 0,
    vapidPublic: process.env.VAPID_PUBLIC_KEY ?? "",
    vapidPrivate: process.env.VAPID_PRIVATE_KEY ?? "",
    vapidSubject: process.env.VAPID_SUBJECT ?? "mailto:divyamohan1993@gmail.com",
    gcpProject: process.env.GCP_PROJECT ?? "dmjone",
    firestoreDb: process.env.FIRESTORE_DATABASE ?? "(default)",
    sweepInvokerSa: process.env.SWEEP_INVOKER_SA ?? "",
    sweepAudience: process.env.SWEEP_AUDIENCE ?? "",
    appBaseUrl: process.env.APP_BASE_URL ?? "",
    tasksLocation: process.env.TASKS_LOCATION ?? "asia-east1",
    tasksQueue: process.env.TASKS_QUEUE ?? "momentum-reminders",
    googleClientId: process.env.GOOGLE_OAUTH_CLIENT_ID ?? "",
    googleClientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? "",
  };
  return cached;
}

export function calendarEnabled(): boolean {
  const e = env();
  return !!e.googleClientId && !!e.googleClientSecret;
}

export function brainEnabled(): boolean {
  const e = env();
  return e.geminiDailyCap > 0 && e.geminiModel === "gemini-2.5-flash-lite"
    && e.vertexLocation === "global" && /^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(e.gcpProject);
}

export function pushEnabled(): boolean {
  const e = env();
  return !!e.vapidPublic && !!e.vapidPrivate;
}
