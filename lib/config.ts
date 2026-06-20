import "server-only";

/**
 * Server-only env. Validated lazily on first request (NOT at module load) so
 * `next build` inside Docker — where secrets are absent — does not crash.
 * Required vars throw at runtime; brain/push vars are optional (app degrades).
 */
export type Env = {
  ownerEmail: string;
  ownerPassphraseHash: string;
  sessionSecret: string;
  fieldKey: string;
  edgeSecret: string;
  geminiApiKey: string;
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
    ownerPassphraseHash: need("OWNER_PASSPHRASE_HASH"),
    sessionSecret: need("SESSION_SECRET"),
    fieldKey: need("FIELD_KEY"),
    edgeSecret: process.env.EDGE_SECRET ?? "",
    geminiApiKey: process.env.GEMINI_API_KEY ?? "",
    geminiModel: process.env.GEMINI_MODEL ?? "gemini-2.0-flash",
    geminiDailyCap: Number.parseInt(process.env.GEMINI_DAILY_CAP ?? "800", 10),
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
  };
  return cached;
}

export function brainEnabled(): boolean {
  return !!env().geminiApiKey;
}

export function pushEnabled(): boolean {
  const e = env();
  return !!e.vapidPublic && !!e.vapidPrivate;
}
