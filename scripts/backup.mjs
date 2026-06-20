// Local backup: exports Momentum's Firestore collections to a timestamped JSON.
// Uses ADC (your gcloud login). Field-encrypted values stay ciphertext (restore with FIELD_KEY).
// Usage: node scripts/backup.mjs              -> ./backups/momentum-<ISO>.json
//        BACKUP_FILE=path.json node scripts/backup.mjs
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { writeFileSync, mkdirSync } from "node:fs";

initializeApp({ projectId: process.env.GCP_PROJECT || "dmjone", credential: applicationDefault() });
const db = getFirestore();

const cols = ["momentum_tasks", "momentum_reminders", "momentum_meta", "momentum_audit", "momentum_nudgeEvents"];
const out = { exportedAt: new Date().toISOString(), collections: {} };
const counts = {};
for (const c of cols) {
  const snap = await db.collection(c).get();
  out.collections[c] = snap.docs.map((d) => ({ id: d.id, data: d.data() }));
  counts[c] = snap.size;
}

let file = process.env.BACKUP_FILE;
if (!file) {
  mkdirSync("backups", { recursive: true });
  file = `backups/momentum-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
}
writeFileSync(file, JSON.stringify(out, null, 2));
console.log("backed up", counts, "->", file);
