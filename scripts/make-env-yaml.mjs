// Emits a Cloud Run --env-vars-file (YAML). Secret values come from process.env
// (CI: GitHub Actions secrets) or local secrets.json/.env. JSON-stringified so the
// Argon2 hash ($ , = / +) survives. Output → stdout; callers redirect to a gitignored
// temp file and delete it. No secret values are ever printed except into that file.
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";

function fromFiles() {
  const out = {};
  if (existsSync("secrets.json")) {
    const s = JSON.parse(readFileSync("secrets.json", "utf8"));
    out.SESSION_SECRET = s.SESSION_SECRET;
    out.FIELD_KEY = s.FIELD_KEY;
    out.VAPID_PUBLIC_KEY = s.VAPID_PUBLIC_KEY;
    out.VAPID_PRIVATE_KEY = s.VAPID_PRIVATE_KEY;
  }
  return out;
}

const f = fromFiles();
const pick = (k) => process.env[k] || f[k] || ""; // CI env (GH secrets) wins; else local files

// Preserve the deployed, public Google auth configuration during later CI deploys.
// Runtime secrets still come from the explicit CI/local inputs below.
const authNames = ["APP_ORIGIN", "OWNER_GOOGLE_UID", "OWNER_GOOGLE_SUB", "FIREBASE_API_KEY", "FIREBASE_APP_ID"];
let existingAuth = {};
if (authNames.some((key) => !process.env[key])) {
  try {
    const service = JSON.parse(execFileSync("gcloud", ["run", "services", "describe", process.env.SERVICE || "momentum", "--project=" + (process.env.GCP_PROJECT || "dmjone"), "--region=" + (process.env.RUN_REGION || "asia-east1"), "--format=json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
    existingAuth = Object.fromEntries(service.spec.template.spec.containers[0].env.filter((e) => authNames.includes(e.name)).map((e) => [e.name, e.value]));
  } catch { /* A new installation must supply its public auth configuration explicitly. */ }
}
const authVars = Object.fromEntries(authNames.map((key) => [key, process.env[key] || existingAuth[key] || ""]));
if (Object.values(authVars).some((value) => !value)) throw new Error("Configure Google owner identity and Firebase browser Auth settings before deployment");

const URL = process.env.APP_URL ?? "";
const vars = {
  ...authVars,
  OWNER_EMAIL: "divyamohan1993@gmail.com",
  GEMINI_MODEL: "gemini-2.5-flash-lite",
  VERTEX_LOCATION: "global",
  GEMINI_DAILY_CAP: "200",
  GEMINI_USER_DAILY_CAP: "10",
  VAPID_SUBJECT: "mailto:divyamohan1993@gmail.com",
  GCP_PROJECT: "dmjone",
  NODE_ENV: "production",
  TZ: "Asia/Kolkata",
  SWEEP_INVOKER_SA: process.env.SWEEP_SA || "momentum-sweeper@dmjone.iam.gserviceaccount.com",
  SWEEP_AUDIENCE: `${URL}/api/sweep`,
  APP_BASE_URL: URL,
  TASKS_LOCATION: "asia-east1",
  TASKS_QUEUE: "momentum-reminders",
  SESSION_SECRET: pick("SESSION_SECRET"), // pragma: allowlist secret
  FIELD_KEY: pick("FIELD_KEY"), // pragma: allowlist secret
  VAPID_PUBLIC_KEY: pick("VAPID_PUBLIC_KEY"),
  VAPID_PRIVATE_KEY: pick("VAPID_PRIVATE_KEY"), // pragma: allowlist secret
  GOOGLE_OAUTH_CLIENT_ID: pick("GOOGLE_OAUTH_CLIENT_ID"),
  GOOGLE_OAUTH_CLIENT_SECRET: pick("GOOGLE_OAUTH_CLIENT_SECRET"), // pragma: allowlist secret
};

let out = "";
for (const [k, v] of Object.entries(vars)) out += `${k}: ${JSON.stringify(String(v ?? ""))}\n`;
process.stdout.write(out);
