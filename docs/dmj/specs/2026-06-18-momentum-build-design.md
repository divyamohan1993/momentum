# Momentum — Build Design (as-built decisions)

> Date: 2026-06-18 · Author: Claude (build partner) · Brief: [`idea.md`](../../../idea.md)
> Tier: **Heavy** (security, auth, deploy, public surface) but executed **headless** (goal: "do not ping until complete"). Per the brainstorming skill's headless rule, user-owned decisions are recorded in the **Assumption Ledger** with the lowest-blast-radius safe default chosen; nothing deadlocks.
>
> The brief's **§16** is already a 4-lens-reviewed, locked design. This doc does **not** re-litigate it — it records the **as-built** decisions and every **deviation** from §16, with rationale, plus machine-checkable acceptance criteria.

---

## 1. Scope (what "complete end to end" means here)

Build, deploy (Cloud Run asia-east1), and browser-test the **§16.7 spine + the cinematic UI (§16.6 KEEP) + the web-push reminder ladder**, all at ₹0:

**IN (must work, deployed, tested):**
1. Cinematic "mission-control" Kanban: columns **To-Do** (`backlog`+`todo`) / **Doing** (`in_progress`) / **Done**; cards with priority, dueAt, effort, cognitive load, tags, `isBlocked` badge; drag-and-drop (dnd-kit), inline edit, soft-delete, archive, 10s Undo. Realtime-ish via 3s polling (not Firestore client listeners — see §4). Aurora WebGL background (lazy, `prefers-reduced-motion`), ⌘K palette (cmdk), Focus Mode, per-card pressure gauge.
2. **Capture (voice-first):** capture box; Win+H dictates text → Gemini parses → structured `Task[]` with confidence; ambiguity surfaced inline ("'Sunday' → 22 Jun?"). One-click **mic** (MediaRecorder → server → Gemini audio) as included fast-follow.
3. **Voice commands:** verbs `want|doing|done|blocked|query` inferred **semantically** (no keyword tables) → board actions; confidence gate = ask-don't-guess; reversible + Undo.
4. **Brain:** server-side Gemini behind one thin function (capture, intent-classify, rank-reason, optional decompose), Zod-validated JSON, deterministic fallback for **ranking only**, daily quota counter.
5. **Reminders + escalation:** reminder fires **at `dueAt`** (rung 0 web push); repeat every 10 min, max 3, then climb to rung 1 (high-priority "alarm" push); cancel on ack (done / card→Done), pause on card→Doing, snooze = +1h. Driven by a **1-minute Cloud Scheduler sweep** (OIDC-authed) → `/api/sweep`.
6. **Auth:** server-side **owner passphrase gate** + signed HttpOnly session cookie, rate-limited (see Deviation D1).
7. **Cost guards (§16.1):** Cloud Run `max-instances=1`, in-app atomic Firestore daily counter before every Gemini call, free-tier-only resources, budget alert.
8. **PWA:** manifest + service worker (push handler + notification action buttons + offline shell).
9. **Deploy:** Cloud Run asia-east1, `min=0 max=1`, source-deploy via Cloud Build (no local Docker). Secrets in Secret Manager. Scheduler sweep job. **Suitable URL** = `https://momentum-107722137045.asia-east1.run.app` (+ optional `momentum.dmj.one` CF record handed to user).
10. **Tested in a real browser (Playwright)** against the deployed URL.

**DEFERRED (recorded honestly, per §16.6 DEFER + my headless deviations):** adaptive per-channel/time ML model (→ fixed intervals 30/10/3 min), auto-decompose default-on, hybrid-LLM nuance ranking + Eisenhower, calendar/energy routing, weekly narrated briefings, stale-task LLM triage, dependency/critical-path graph, Cloud Tasks precise per-reminder firing (→ 1-min sweep covers correctness, ≤60s latency), Firebase Google sign-in (→ passphrase gate, D1), field-level quantum crypto + `/super-admin` (already deferred by §16.5).

## 2. Stack (locked by §16.6)

Single **Next.js (App Router) 15** app, TypeScript, on Node 22 runtime. Tailwind v4 + a custom mission-control token set (no heavy UI kit; hand-built for distinctiveness per `frontend-design`). Motion (Framer) for physics. dnd-kit for DnD. cmdk for ⌘K. Zod for all contracts. `web-push` for VAPID. `firebase-admin` for Firestore (server only). `@google/genai` (or raw REST) for Gemini. Deployed as a Docker container (`output: "standalone"`) built by Cloud Build.

## 3. Architecture (as-built)

```
Browser PWA ──HTTPS──> Cloud Run "momentum" (Next.js, asia-east1, min0/max1)
  - Server Actions + /api route handlers (all owner-gated)
  - Firestore Admin SDK ──cross-region──> Firestore (default) asia-south2  [FREE TIER]
  - Gemini brain ──> generativelanguage.googleapis.com  (key in Secret Manager, daily-capped)
  - web-push ──VAPID──> FCM ──> device notifications
Cloud Scheduler (1 job, * * * * *) ──OIDC──> /api/sweep  (fire due reminders, climb rungs, archive)
```

All state in Firestore. No client Firestore SDK → no client-side rules dependency for our data. Realtime board = client polls `/api/board` every 3s (cheap, scales to zero, no held-open instance).

## 4. Key decisions & deviations from §16 (the ledger)

| # | Decision | §16 said | As-built | Why | Reversible? |
|---|---|---|---|---|---|
| **D1** | **Auth = server passphrase gate**, not Firebase Google sign-in | §16.5 mandates Firebase Auth Google sign-in locked to `OWNER_EMAIL` | One owner passphrase (Argon2id-hashed, in Secret Manager) → signed HttpOnly `momentum_session` cookie (HMAC, 7-day, rotating secret); rate-limited w/ exponential backoff; all data access server-side via Admin SDK (owner implicit, never from client body) | Google OAuth provider + consent screen + authorized domains are **console operations I cannot complete headlessly**. A single-secret server gate is *secure-by-construction* for a single-owner tool (no third-party OAuth surface), "easy to use," and isolated behind one `getOwner(req)` boundary so swapping to Firebase later is a small change. | Yes — swap `getOwner()` impl |
| **D2** | **Project = `dmjone`** | §16.1 mandates a dedicated `momentum` project (blast-radius isolation) | Deploy into `dmjone` | **Explicit user override** ("use dmjone") — user instruction beats brief. | n/a (user choice) |
| **D3** | **Firestore = `(default)` asia-south2**, namespaced `momentum_*` collections | §9 owner-scoped under UID in the app's own DB | Shared `(default)` DB (only one with free tier), collections `momentum_tasks/_reminders/_nudgeEvents/_meta/_audit`, every doc stamped `ownerId` | Only `(default)` carries the ₹0 free quota; named DBs are metered (`freeTier:false`). Admin-SDK-only access. **Residual risk** logged in §7. | Yes — migrate to named DB if sensitive data added |
| **D4** | **Reminders = 1-min Scheduler sweep**, not Cloud Tasks chains | §16.3 chained Cloud Tasks + 1-min sweep safety-net | Single Scheduler job → `/api/sweep` does the firing AND the climb; Firestore `reminders` doc is source of truth, each fire self-suppresses if acked | Removes Cloud Tasks IAM/queue setup; correctness identical, ≤60s latency (fine for personal nudges); strictly within free quota. The §16.3 semantics (fire at dueAt, 10-min repeat ×3 then climb, ack=cancel, Doing=pause, snooze=+1h) are preserved in the sweep logic. | Yes — add Cloud Tasks for sub-minute precision later |
| **D5** | Voice v1 path | §16.6: Win+H→text→Gemini core; big-mic audio = Phase-2 | Build **both** (text path is core; mic→Gemini-audio included) | Cheap to add, demonstrates the vision; both land in the same command pipeline. | n/a |

## 5. Data model (Firestore `(default)`, collection-namespaced)

`momentum_tasks/{taskId}`: `ownerId, title, description, status(backlog|todo|in_progress|done), priority(low|med|high), isBlocked:bool, blockedReason?, dueAt?(ISO), effortMins?, cognitiveLoad(deep|shallow)?, projectId?, tags[], dependsOn[], blocks[], escalationPolicy(default|important|critical), rankScore, rankReason, createdAt, updatedAt, completedAt?, archivedAt?, deletedAt?`
`momentum_reminders/{reminderId}`: `ownerId, taskId, fireAt, currentRung(0|1), repeatCount, status(pending|sent|acknowledged|paused|cancelled), nextCheckAt, lastError?`
`momentum_nudgeEvents/{id}`: `taskId, channel, sentAt, action, hourOfDay` (logged for future adaptivity; not yet used to adapt)
`momentum_meta/{singleton}`: `geminiCallsToday, geminiQuotaDate, pushSubscriptions[]` (per §16: store only subscription, no phone number)
`momentum_audit/{id}`: append-only `{at, kind, detail}` (auth, webhook-verify, sends, spend-affecting)

Status/column map per §16.4 exactly. `blocked` is boolean `isBlocked`, NOT a status. Climb-eligible = `status ∈ {backlog, todo}`.

## 6. Brain contracts (Zod, strict JSON)

- `capture(text)` → `{ tasks: Task[] }` each with `confidence` flags on inferred dueAt/priority/policy.
- `command(text | audio)` → `{ transcript, commands: Command[] }`, `Command = {verb, cardRef?, newTask?, deadlineIST?, confidence}`. Intent **semantic only**; low confidence / ambiguous `cardRef` ⇒ ask. Destructive/bulk ⇒ explicit confirm regardless of confidence (§16.5 prompt-injection guard). Model never picks channel/recipient; server resolves `cardRef` against owner's own cards.
- `rank(tasks, now)` → ordered `{taskId, rankScore, rankReason}`; **deterministic fallback** (deadline proximity + blocking + age) if Gemini unavailable or over daily cap.
- Every call: counter check **before** call; on parse failure → deterministic/skip, never crash.

## 7. Security (MVP bar per §16.5, with recorded residual risk)

- Owner gate on **every** route (Server Actions + API); unauth → 401/redirect. Constant-time passphrase compare via Argon2id verify; exponential backoff on failures; audit-logged.
- `/api/sweep` accepts ONLY a valid OIDC token from the scheduler SA (verified `aud` + SA email) **or** a one-time internal call; rejects everything else.
- Push click-action callback authenticated with a signed, single-use token tied to `reminderId+owner`.
- Gemini key, VAPID private key, session secret, owner passphrase hash → **Secret Manager only**, injected at runtime; never in client bundle or repo. `.env.example` with dummies.
- Structured logs with redaction allowlist (never log task bodies, push endpoints, tokens). Append-only `momentum_audit`.
- **Residual risk (D3):** Momentum shares `(default)` with other dmjone apps. If another app's Firestore rules contain a catch-all `allow read: if request.auth != null`, a user authenticated to *that* app could read `momentum_*` (data is personal tasks, no credentials). Mitigation: Admin-SDK-only, namespaced collections; will verify `(default)` rules at deploy and, if a catch-all allow exists, escalate to the user. Field-level crypto deferred per §16.5.

## 8. Cost guards (₹0, §16.1) — built Phase 0/1 not last

`max-instances=1` on the service (hard ceiling). In-app atomic Firestore transaction increments `geminiCallsToday`; hard-stop at **800/day** (under the free RPD); resets on date change. No Cloud Tasks/NAT/LB/multi-region. One Scheduler job. Budget alert on dmjone billing (notify). `infra/cost-budget.json` is the single source of the numbers (populated from the live-verification agent).

## 9. Acceptance criteria (machine-checkable)

- **AC1** `GET $URL/api/health` → 200 `{status:"ok"}`.
- **AC2** `POST /api/capture {text:"finish the IICA deck tomorrow, call mom sunday"}` (authed) → ≥2 tasks, each with a resolved `dueAt`, `confidence` present.
- **AC3** Playwright on $URL: pass gate → create card → drag To-Do→Doing → reload → card persists in Doing (Firestore round-trip).
- **AC4** Register a real push subscription (Playwright, notifications granted); insert a due reminder; `POST /api/sweep` (authed) → web-push accepted (201) + reminder `status=sent`; ack → `status=acknowledged` and no further sends.
- **AC5** Force `geminiCallsToday ≥ cap` → `/api/capture` returns deterministic result, **zero** Gemini HTTP calls (asserted).
- **AC6** `gcloud run services describe momentum --region=asia-east1` → `min=0, max=1`, ready; URL returns 200.
- **AC7** Unauthed `GET /api/board` → 401; wrong passphrase ×N → backoff; correct → session cookie set.
- **AC8** `prefers-reduced-motion` → aurora/WebGL not mounted; board fully keyboard-navigable; cards have ARIA labels.

## 10. Assumption Ledger (headless — user to ratify)

1. **Auth model D1** (passphrase, not Google sign-in) — PARKED for user ratification; safe default chosen.
2. **Owner passphrase** generated strong + stored hashed; the plaintext is surfaced to the user **once** in the final report so they can log in. (Cannot use Google identity headlessly.)
3. **dmjone + shared `(default)` DB** (D2/D3) — user said "use dmjone"; residual cross-app read risk accepted for MVP, flagged.
4. **Gemini key** minted via `gcloud services api-keys create` on dmjone; relies on generativelanguage free-tier RPD. If billing-enabled project = pay-as-you-go (agent verifying), the 800/day in-app cap + free RPD keep spend ~₹0; if any risk, cap tighter.
5. **URL** = Cloud Run `run.app` (works immediately, ₹0). `momentum.dmj.one` custom domain needs a **CF DNS record the user must add** (handed over, non-blocking).
6. **Reminder latency** ≤60s (sweep granularity) accepted.

## 11b. Adversarial review resolutions (security+cost lens, 2026-06-18) — BINDING

A fresh-context review found two *unlogged* §16.1 drops + the Gemini-on-Blaze billing reality. Resolutions (built in, not deferred):

- **B2 (₹0 wall):** Gemini key minted on a **billing-UNLINKED** project (structurally free-tier-only; cannot bill). dmjone (Blaze) hosts only Cloud Run + Firestore (free-quota'd). In-app Gemini cap = **200/day**. Attempt a GCP quota override on `generativelanguage` as a platform backstop; if headless-blocked, document the console step.
- **B6 (data leak):** Firestore rules are a **union with no deny-override** → namespaced deny can't claw back another app's catch-all on shared `(default)`. **Un-defer field crypto:** AES-256-GCM encrypt `title`, `description`, `blockedReason` (key in Secret Manager, `FIELD_KEY`). Cross-app read yields ciphertext. Transparent encrypt-on-write/decrypt-on-read in the store layer.
- **B4/B5 (pre-auth CPU/spend DoS):** cheap in-memory token-bucket IP limiter runs **before** Argon2id; only lockout-threshold crossings persist to Firestore (bounded writes). `min=0/max=1` self-DoS accepted (H6).
- **B7 (sweep auth):** `/api/sweep` verifies OIDC via `google-auth-library` — signature, `iss∈{accounts.google.com,…}`, `aud`=exact sweep URL, `email`=exact scheduler SA, `email_verified`, `exp`. Also callable by a live owner session (for tests). Sweep makes **no Gemini calls**.
- **B3 (edge boundary):** optional `EDGE_SECRET` header check — when set (behind Cloudflare), direct `run.app` hits get a static 403 before any work; when unset (pre-CF), the passphrase gate + IP limiter + `max=1` are the boundary. Recorded as the one residual: the run.app URL is directly reachable until CF is fronted; spend is still bounded (auth-gated Gemini/Firestore, `max=1`). CF record handed to user.
- **H1/H2/H3/H4:** session cookie `Secure`+`SameSite=Lax`+`iat`; `momentum_meta.minValidIat` revokes all sessions; explicit `Origin`/`Sec-Fetch-Site` check on every mutating route handler; reminder fire = transactional claim (no double-send); push click-token = transactional single-use consume + 24h TTL.
- **H5:** one `requireOwner()` guard first in every handler; `/api/health` is the only public route and is inert (no Firestore/Gemini/push).

## 11c. Deploy bugs caught + fixed (during headless deploy)

1. **BuildKit `--mount=type=cache` unsupported on Cloud Build legacy docker builder** → removed the cache mount from the Dockerfile.
2. **pnpm version skew**: container corepack pulled pnpm 11.8 which enforces a `minimumReleaseAge` supply-chain policy and rejected two transitive deps (`anynum`, `strnum`) published <24h prior; local pnpm 10.30.1 has no such policy → builds diverged. Pinned `packageManager: pnpm@10.30.1` + `corepack prepare … --activate` for local/container parity. (The policy is itself sound supply-chain hygiene; pinning restores reproducibility — revisit when those deps age out.)
3. **Local-only**: Windows blocks `output: standalone` symlinks (EPERM) — irrelevant to the Linux container build. And Next/`@next/env` runs dotenv-expand, which mangled `$` in the Argon2id hash in `.env` (escaped with `\$`); Cloud Run `--set-secrets` injects env directly with no dotenv, so production is unaffected.
4. **Session cookie `Secure`** made conditional on `NODE_ENV==="production"` so local http testing works; prod stays Secure.
5. **Firestore `settings()` once-only** guarded against re-entry (HMR / re-eval) to avoid a 500.

## 11d. Reminders: D4 sweep → event-driven Cloud Tasks (post-deploy, user ₹0 requirement)

The user required "not billed when not using it." A periodic sweep (even at */5) is continuous background compute against the *shared* vCPU-sec free tier. **Superseded D4:** reminders now use **event-driven Cloud Tasks** — `armReminder` enqueues one task at the exact `fireAt` (queue `momentum-reminders`); the task POSTs `/api/fire` (OIDC-pinned); `fireAndChain` fires + enqueues the next rung; ack/done/pause/snooze DELETE the pending task. **No cron.** Idle (nothing due) = empty queue = zero compute = structural ₹0. The §16.3 escalation semantics (rung-0 ×3 @10min → rung-1 @policy-interval, ack=cancel, Doing=pause, snooze resets) are preserved inside `fireReminderForTask`'s transactional claim. `/api/sweep` survives only as an owner-triggered manual reconcile. (IAM: runtime SA needs queue-scoped `cloudtasks.admin` — `enqueuer` cannot delete — plus `serviceAccountUser` on the sweeper SA for OIDC minting.) Verified: create→1 queued, done→0 queued, fire→`/api/fire` 200 + next rung chained.

## 11. Build order (parallelized where independent)

Sequential backbone first (shared types + app skeleton + Firestore data layer + auth boundary), then fan out independent modules (WebGL aurora, brain module, web-push module, PWA SW, deploy scripts) to parallel agents, then integrate, then deploy, then Playwright-test. Provisioning (Gemini key, secrets, Firestore indexes, Scheduler) runs as its own parallel track.
