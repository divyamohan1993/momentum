// Deletes Momentum test data for a clean handoff. Uses ADC (gcloud).
// Usage: node scripts/wipe-data.mjs            -> wipes tasks/reminders/audit
//        node scripts/wipe-data.mjs all        -> also wipes meta (counters, push subs)
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

initializeApp({ projectId: process.env.GCP_PROJECT || "dmjone", credential: applicationDefault() });
const db = getFirestore();

const cols = ["momentum_tasks", "momentum_reminders", "momentum_audit", "momentum_nudgeEvents"];
if (process.argv[2] === "all") cols.push("momentum_meta");

for (const c of cols) {
  const snap = await db.collection(c).get();
  let n = 0;
  for (const d of snap.docs) {
    await d.ref.delete();
    n++;
  }
  console.log(`${c}: deleted ${n}`);
}
console.log("done");
