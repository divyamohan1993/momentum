// Emits a Cloud Run --env-vars-file (YAML). Secret values come from process.env
// (CI: GitHub Actions secrets) or local secrets.json/.env. JSON-stringified so the
// Argon2 hash ($ , = / +) survives. Output → stdout; callers redirect to a gitignored
// temp file and delete it. No secret values are ever printed except into that file.
import { readFileSync, existsSync } from "node:fs";

function fromFiles() {
  const out = {};
  if (existsSync("secrets.json")) {
    const s = JSON.parse(readFileSync("secrets.json", "utf8"));
    out.OWNER_PASSPHRASE_HASH = s.OWNER_PASSPHRASE_HASH;
    out.SESSION_SECRET = s.SESSION_SECRET;
    out.FIELD_KEY = s.FIELD_KEY;
    out.VAPID_PUBLIC_KEY = s.VAPID_PUBLIC_KEY;
    out.VAPID_PRIVATE_KEY = s.VAPID_PRIVATE_KEY;
  }
  if (existsSync(".env")) {
    out.GEMINI_API_KEY = (/^GEMINI_API_KEY=(.*)$/m.exec(readFileSync(".env", "utf8"))?.[1] ?? "").trim();
  }
  return out;
}

const f = fromFiles();
const pick = (k) => process.env[k] || f[k] || ""; // CI env (GH secrets) wins; else local files

const URL = process.env.APP_URL ?? "";
const vars = {
  OWNER_EMAIL: "divyamohan1993@gmail.com",
  GEMINI_MODEL: "gemini-2.5-flash",
  GEMINI_DAILY_CAP: "200",
  VAPID_SUBJECT: "mailto:divyamohan1993@gmail.com",
  GCP_PROJECT: "dmjone",
  NODE_ENV: "production",
  TZ: "Asia/Kolkata",
  SWEEP_INVOKER_SA: process.env.SWEEP_SA || "momentum-sweeper@dmjone.iam.gserviceaccount.com",
  SWEEP_AUDIENCE: `${URL}/api/sweep`,
  APP_BASE_URL: URL,
  TASKS_LOCATION: "asia-east1",
  TASKS_QUEUE: "momentum-reminders",
  OWNER_PASSPHRASE_HASH: pick("OWNER_PASSPHRASE_HASH"), // pragma: allowlist secret
  SESSION_SECRET: pick("SESSION_SECRET"), // pragma: allowlist secret
  FIELD_KEY: pick("FIELD_KEY"), // pragma: allowlist secret
  GEMINI_API_KEY: pick("GEMINI_API_KEY"), // pragma: allowlist secret
  VAPID_PUBLIC_KEY: pick("VAPID_PUBLIC_KEY"),
  VAPID_PRIVATE_KEY: pick("VAPID_PRIVATE_KEY"), // pragma: allowlist secret
  GOOGLE_OAUTH_CLIENT_ID: pick("GOOGLE_OAUTH_CLIENT_ID"),
  GOOGLE_OAUTH_CLIENT_SECRET: pick("GOOGLE_OAUTH_CLIENT_SECRET"), // pragma: allowlist secret
};

let out = "";
for (const [k, v] of Object.entries(vars)) out += `${k}: ${JSON.stringify(String(v ?? ""))}\n`;
process.stdout.write(out);
