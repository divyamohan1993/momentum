# MOMENTUM — Phase 1 Implementation Plan (the thin end-to-end spine)

**Goal:** Ship a ₹0, owner-locked web app where you voice-capture a task (Win+H → text → Gemini), see it on a realtime Kanban you can also drag/edit, and get one repeating web-push reminder that fires at the deadline and cancels the instant you act — with hard cost ceilings live from task 0.
**Architecture:** One Next.js (App Router) app on Cloud Run (`min-instances=0`, `max-instances=1`), Firestore (realtime board + owner-locked rules), Cloud Tasks (one reminder fired at `dueAt`) + one Cloud Scheduler safety-net sweep, Gemini Flash reached only through a server proxy for voice→command parsing. Cloudflare in front. Dedicated GCP project `momentum`.
**Tech stack:** TypeScript, Next.js App Router (RSC + Server Actions + route handlers), Firestore (Admin SDK server-side, client SDK for realtime), Firebase Auth (single owner-UID allowlist), Tailwind + Motion, dnd-kit, Zod, Gemini Flash (key in Secret Manager), pnpm.
**Execution:** dmj:team-driven-development. Tasks are checkboxes. Source of truth for behaviour: `idea.md` **§16** (authoritative).

---

## Deviations from global CLAUDE.md (deliberate, on record)

- **Firestore, not Drizzle/SQL.** Chosen for realtime listeners + free tier + the no-card Spark escape path. Drizzle does not target Firestore. All data access goes through one thin typed repository module (`lib/repo/*`) — that is the swappable boundary if we ever migrate.
- **Field-level quantum-safe crypto + full `/super-admin` deferred** (idea.md §16.5 recorded deviation). MVP boundary = Firestore at-rest encryption + owner-lock + rules.
- **No Telegram rung** (§16.2, user choice). Ladder = web push → phone-PWA alarm (alarm is Phase 2).
- **Observability/DAST trimmed for MVP.** Phase 1 CI = typecheck + lint + unit test + secret-scan (free GitHub Actions). Sentry/OpenTelemetry/CodeQL/ZAP deferred to Phase 5.

## Out of scope here (each its own plan)

- **Phase 2:** one-click big-mic → Gemini-audio path; multi-item + fuzzy-match polish; phone-PWA full-screen alarm rung; snooze/quiet-hours.
- **Phase 3:** cinematic "mission-control" UI layer (WebGL aurora lazy + Focus mode + pressure gauge), built cost-cheap.
- **Phase 4:** deferred intelligence — deterministic ranking/Next-Best, then optional LLM nuance.
- **Phase 5:** field-level crypto, `/super-admin`, Sentry/OTel, CodeQL/ZAP, Dependabot.

---

## File map (Phase 1)

| File | Responsibility |
|---|---|
| `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, `.env.example` | project + scripts + typed env (Zod-validated at boot) |
| `infra/setup-project.sh` | idempotent: create project `momentum`, enable APIs, set quota caps + Cloud Run `max-instances=1`, budget + kill-switch |
| `infra/killswitch/index.ts` | Pub/Sub-triggered fn: on budget breach, **unlink billing** |
| `.github/workflows/ci.yml` | typecheck → lint → test → secret-scan |
| `lib/env.ts` | Zod env schema; crash on misconfig |
| `lib/firebase/admin.ts`, `lib/firebase/client.ts` | Admin SDK (server) + client SDK (realtime) init |
| `lib/schema/task.ts`, `lib/schema/reminder.ts`, `lib/schema/command.ts` | Zod schemas + types (Task, Reminder, Command) |
| `lib/repo/tasks.ts`, `lib/repo/reminders.ts`, `lib/repo/audit.ts` | typed Firestore repository (the only data-access boundary) + append-only audit writer |
| `lib/auth/owner.ts` | owner-UID allowlist guard (server) |
| `firestore.rules` | owner-locked rules |
| `lib/cost/counter.ts` | transactional daily spend/call counter; hard-stop before Gemini/Task calls |
| `lib/brain/parseCommand.ts` | Gemini server proxy: text → `Command[]`; semantic, no keyword tables |
| `lib/brain/resolveCommand.ts` | deterministic validation: verb∈enum, server-side cardRef resolve, confidence gate, destructive→confirm |
| `lib/time/deadline.ts` | fuzzy time phrase → concrete IST datetime |
| `app/api/capture/route.ts` | capture endpoint (App Check + owner guard + counter + parse + resolve) |
| `app/api/reminders/fire/route.ts` | Cloud Tasks target: send push, chain next, self-suppress if acked |
| `app/api/reminders/sweep/route.ts` | Scheduler target: reconcile missed/stuck reminders |
| `app/api/reminders/ack/route.ts` | push-click ack/cancel: verify signed single-use token, cancel ladder |
| `lib/push/actionToken.ts` | sign + verify single-use action token bound to `reminderId+uid` |
| `app/api/push/subscribe/route.ts` | store VAPID subscription |
| `lib/push/send.ts` | VAPID web-push send |
| `public/sw.js` | service worker: show notification + click→ack action |
| `app/(board)/page.tsx`, `components/Board.tsx`, `components/Card.tsx`, `components/VoiceCapture.tsx` | realtime board, dnd, inline edit, 10s undo, capture box |
| `app/health/route.ts` | shallow health check |

---

## Sequencing

T0 (cost ceilings) **first and blocking** — nothing else runs against the project until the cage is up. Then T1 scaffold. T2/T3 (schema, auth+rules) parallel-safe. T4 (board) needs T2/T3. T5 (voice) needs T2/T3. T6 (reminder) needs T2/T5-capture. T7 (push) needs T6. T8 (deploy) last.

---

### Task 0: Cost cage — dedicated project + hard ceilings (BLOCKING)
**Depends on:** none · **Parallel-safe:** no
**Files:** Create `infra/setup-project.sh`, `infra/killswitch/index.ts`
**Acceptance:**
- `gcloud config get-value project` → `momentum` (NOT `dmjone`).
- `gcloud run services describe momentum --format='value(spec.template.metadata.annotations."autoscaling.knative.dev/maxScale")'` → `1`.
- Generative Language API + Cloud Tasks have a per-day quota override at/below free ceiling (`gcloud services quota list ...` shows the override).
- A billing budget exists with a Pub/Sub topic; the kill-switch fn is deployed and, in a dry-run unit test, calls `cloudbilling.projects.updateBillingInfo({billingAccountName:''})` (unlink) on a synthetic breach message.
- App-layer counter (Task 5) is the synchronous gate; this task is the backstop.

- [ ] Write `infra/setup-project.sh` (idempotent): create/select project `momentum`, link billing, enable APIs (run, firestore, cloudtasks, cloudscheduler, secretmanager, generativelanguage, pubsub, cloudbilling), set Cloud Run `--max-instances=1 --min-instances=0`, apply quota overrides, create budget + Pub/Sub topic. Re-runnable.
- [ ] Write `infra/killswitch/index.ts` + a unit test that feeds a synthetic budget-breach Pub/Sub message and asserts it calls billing-unlink (mock the client). Run → PASS.
- [ ] Verify acceptance commands, then commit.

### Task 1: Scaffold + env + CI
**Depends on:** T0 · **Parallel-safe:** no
**Files:** Create `package.json`, `tsconfig.json`, `.env.example`, `lib/env.ts`, `lib/env.test.ts`, `lib/firebase/admin.ts`, `lib/firebase/client.ts`, `.github/workflows/ci.yml`
**Acceptance:** `pnpm build` exit 0 · `pnpm test` → env tests pass · `pnpm lint` exit 0 · CI workflow runs the same.

- [ ] `pnpm create next-app` (App Router, TS, Tailwind); pin deps; add `pino`, `zod`, `dnd-kit`, `motion`, `firebase`, `firebase-admin`, `web-push`, `@google/generative-ai`.
- [ ] Failing test `lib/env.test.ts`: `loadEnv()` throws on missing `OWNER_EMAIL` (+ Firebase + Gemini keys). Run → FAIL. Implement `lib/env.ts` (Zod schema, crash on misconfig). Run → PASS.
- [ ] Init `lib/firebase/admin.ts` (Admin SDK, server-only) + `lib/firebase/client.ts` (client SDK) — **hoisted here so T2 and T3 are genuinely parallel-safe**.
- [ ] Add `.github/workflows/ci.yml` (typecheck, lint, test, `gitleaks` secret-scan). Verify, commit.

### Task 2: Schemas + repository
**Depends on:** T1 · **Parallel-safe:** yes (own files)
**Files:** Create `lib/schema/{task,reminder,command}.ts`, `lib/repo/{tasks,reminders}.ts`, `*.test.ts`
**Acceptance:** `pnpm test lib/schema lib/repo` → all pass; Task status enum is exactly `backlog|todo|in_progress|done`; `isBlocked:boolean`, `archivedAt`, `deletedAt` present; Command verb enum `want|doing|done|blocked|query`.

- [ ] Failing tests for Task/Reminder/Command Zod schemas per §16.4 (status enum, isBlocked, archivedAt≠deletedAt, escalationPolicy default `default`). Run → FAIL.
- [ ] Implement schemas + types. Run → PASS.
- [ ] Implement `lib/repo/*` against the Firestore emulator (CRUD + soft-delete sets `deletedAt`, never hard-delete). Emulator tests → PASS. Commit.

### Task 3: Auth + owner lock + Firestore rules
**Depends on:** T1 · **Parallel-safe:** yes (own files)
**Files:** Create `lib/auth/owner.ts`, `firestore.rules`, `firestore.rules.test.ts`, `lib/repo/audit.ts` (Firebase init is in T1)
**Acceptance:** rules-emulator test: **unauthenticated → denied** (login mandatory); authed as `OWNER_EMAIL` with `email_verified` → full read/write; **any other email → denied all**; `auditLog` client-write denied. `assertOwner(req)` rejects anyone but the verified owner email server-side.

- [ ] Failing emulator test: (a) no-auth denied, (b) wrong-email authed denied, (c) `OWNER_EMAIL`+verified allowed, (d) client write to `auditLog` denied. Run → FAIL.
- [ ] Write `firestore.rules` gating on `request.auth != null && request.auth.token.email == OWNER_EMAIL && request.auth.token.email_verified == true` (audit append-only/server-only) + `lib/auth/owner.ts` (verify Firebase ID token; assert email == `OWNER_EMAIL` && `email_verified`; never trust the body). Google is the only enabled sign-in provider. Run → PASS.
- [ ] Implement `lib/repo/audit.ts` (`appendAudit(action, meta)` → append-only `auditLog`, server-only) + test that a client write is denied. The capture/ack/spend paths call it (T5, T6b). Commit.

### Task 4: Realtime board (manual path)
**Depends on:** T2, T3 · **Parallel-safe:** no (shares schema/repo contracts)
**Files:** Create `app/(board)/page.tsx`, `components/{Board,Card,VoiceCapture}.tsx`, `components/Board.test.tsx`
**Acceptance:** `pnpm test components/Board.test.tsx` passes for: render 3 columns with status→column map (§16.4); drag To-Do→Doing updates status; inline-edit title; delete sets `deletedAt` + shows 10s undo that restores. Realtime: two clients see a change live (integration/emulator).

- [ ] Failing test: status→column mapping (`backlog`+`todo`→To-Do, `in_progress`→Doing, `done`→Done; `isBlocked` badge). Run → FAIL. Implement `Board`/`Card`. PASS.
- [ ] Failing test: dnd move calls repo.update(status); undo restores deletedAt=null. Implement (dnd-kit + Motion). PASS.
- [ ] Wire Firestore client realtime listener (owner-scoped query). Manual 2-tab check. Commit.

### Task 5: Voice capture → command (core)
**Depends on:** T2, T3 · **Parallel-safe:** no
**Files:** Create `lib/brain/{parseCommand,resolveCommand}.ts`, `lib/time/deadline.ts`, `lib/cost/counter.ts`, `app/api/capture/route.ts` + tests
**Acceptance:** `pnpm test lib/brain lib/time lib/cost` passes for: single create; multi-item ("finish A, start B") → 2 commands; ambiguous cardRef → `needsConfirmation` (does NOT act); empty/noise transcript → no-op; destructive verb (`done`) on important card → `needsConfirmation`; `"before evening"`→ 18:00 IST; counter at cap → call refused (no Gemini hit). Gemini is mocked; **no keyword matching anywhere** (assert classifier is the LLM, fallback is manual not keyword).

- [ ] Failing test `lib/cost/counter.test.ts`: transactional increment; `assertUnderCap()` throws at cap. Implement (Firestore transaction). PASS.
- [ ] Failing tests `lib/time/deadline.test.ts`: anchors + relative ("Sunday"=next future) + past-time-today→tomorrow, fixed IST. Implement. PASS.
- [ ] Failing tests `lib/brain/parseCommand.test.ts` (mock Gemini): returns Zod `Command[]`; system prompt = "return JSON only, infer intent semantically". Implement server proxy (key from env/Secret Manager, **server-only**). PASS.
- [ ] Failing tests `lib/brain/resolveCommand.test.ts`: verb∈enum; cardRef resolved server-side against owner's non-archived/non-done cards; confidence ≥0.80 AND gap ≥0.15 → act else ask; destructive/bulk → confirm regardless of confidence; best-effort multi-item (apply confident, collect rest). Implement. PASS.
- [ ] `resolveCommand` also **infers `escalationPolicy`** (`default|important|critical`) from urgency/`dueAt`, user-overridable, default `default` (§16.4). Failing test → implement → PASS.
- [ ] `app/api/capture/route.ts`: App Check + `assertOwner` + `assertUnderCap` BEFORE parse; calls `appendAudit('capture', …)` on each applied command; returns applied + needsConfirmation. Integration test. Commit.

### Task 6: One reminder — fire + cancel (tricky invariant)
**Depends on:** T2, T5 · **Parallel-safe:** no
**Files:** Create `app/api/reminders/{fire,sweep}/route.ts`, `lib/reminders/schedule.ts` + tests
**Acceptance:** `pnpm test lib/reminders app/api/reminders` (emulator + mocked Cloud Tasks): creating a task with `dueAt` enqueues exactly ONE Cloud Task at `dueAt`; firing sends a push and re-enqueues the next repeat (max 3 @10min) ONLY if not acked; "done" / move→Done sets `acknowledgedAt` and deletes the pending task; a fired task whose reminder is already acked **self-suppresses**; **move→Doing (`in_progress`) PAUSES the ladder** (halt repeat, keep reminder) and leaving Doing RE-ARMS it; sweep re-enqueues a reminder whose task name is missing. **One-outstanding-task invariant** asserted (never 2 pending).

- [ ] Failing test: `scheduleReminder(task)` creates reminder with `fireAt=task.dueAt`, one Cloud Task, singular `cloudTaskName`. Implement. PASS.
- [ ] Failing test: `fire` self-suppresses if `acknowledgedAt` set; else send push + chain next (≤3); cancel (done / →Done) deletes pending task + sets status. Implement. PASS.
- [ ] Failing test: **ack-vs-pause** — →Doing pauses (delete pending task, set `pausedAt`, no cancel); moving out of Doing re-arms at the remaining interval. Implement. PASS.
- [ ] Failing test: `sweep` reconciles missing/stuck. Implement. Commit.

### Task 6b: Ack endpoint + signed action token (push-click cancel path)
**Depends on:** T6 · **Parallel-safe:** no
**Files:** Create `app/api/reminders/ack/route.ts`, `lib/push/actionToken.ts` + tests
**Acceptance:** `pnpm test lib/push/actionToken app/api/reminders/ack`: `signActionToken({reminderId,uid,action})` → opaque token; `verifyActionToken` accepts it ONCE (replay/second-use rejected), rejects tampered/expired/foreign-uid tokens; the ack route, on a valid token, applies the action (done→cancel / snooze-stub) and calls `appendAudit('ack',…)`; an unauthenticated or bad-token POST is rejected with no state change.

- [ ] Failing test `lib/push/actionToken.test.ts`: sign→verify round-trip; single-use (second verify fails); tamper/expiry/foreign-uid rejected. Implement (HMAC over `reminderId|uid|action|nonce|exp`, nonce burned in Firestore). Run → PASS.
- [ ] Failing test `app/api/reminders/ack/route.test.ts`: valid token → cancel + audit; invalid → 401, no mutation. Implement. PASS. Commit.

### Task 7: Web push (rung 0, repeated)
**Depends on:** T6, T6b · **Parallel-safe:** no
**Files:** Create `app/api/push/subscribe/route.ts`, `lib/push/send.ts`, `public/sw.js` + tests
**Acceptance:** subscribe stores VAPID sub (owner-scoped); `sendPush` unit test (mock web-push) sends to stored sub; SW test: notificationclick posts a **signed single-use action token** to ack endpoint; repeated scheduling logic unit-tested (10min ×3 then climb-stub).

- [ ] Failing test `lib/push/send.test.ts` (mock `web-push`): sends payload (incl. a `signActionToken` from T6b) to sub; missing sub → no-op. Implement (VAPID keys from Secret Manager; public key to client only). PASS.
- [ ] `public/sw.js`: show notification; click → POST the signed token to `app/api/reminders/ack` (T6b). SW unit test. Commit.

### Task 8: Deploy behind Cloudflare at ₹0
**Depends on:** T4, T5, T6, T6b, T7 · **Parallel-safe:** no
**Files:** Create `Dockerfile`, `app/health/route.ts`, `infra/deploy.sh`
**Acceptance (machine-checkable):** `GET /health` → 200; `gcloud run services describe momentum` shows `min=0 max=1`; the client bundle contains no `run.app` URL and no `*_API_KEY` (grep); an unauth POST to `/api/capture` → 401/403 **before** any Gemini/Firestore work (App Check/owner guard at line 1).
**Manual post-deploy check (not CI — budgets lag hours-to-days, §16.1):** billing shows ₹0 after a quiet day.

- [ ] Multi-stage `Dockerfile` (non-root); `app/health/route.ts`. Build + run locally → /health 200.
- [ ] `infra/deploy.sh`: build, push, deploy to Cloud Run (min=0,max=1), wire Secret Manager. Provide the user the Cloudflare DNS record (manual step) — do not automate CF DNS.
- [ ] Verify acceptance, commit.

---

## Plan-review gate

Per writing-plans, a fresh-context teammate checks: every §16 requirement maps to a task; no placeholders; symbol/signature names consistent; dependency edges acyclic; each acceptance criterion machine-checkable.

**Ran 2026-06-18 (fresh-context Agent). Result: 3 blocking + 4 non-blocking — ALL fixed in this revision:**
- ✅ BLOCKING — push-click "tap Done → stops" endpoint + signed single-use token had no home task → added **Task 6b** (`app/api/reminders/ack/route.ts`, `lib/push/actionToken.ts`).
- ✅ BLOCKING — ack-vs-**pause** half (move→Doing pauses/re-arms) missing → added to **Task 6** acceptance + step.
- ✅ BLOCKING — T2/T3 falsely "parallel-safe" (T2 repo needs Firebase init) → Firebase init **hoisted to T1**; T2/T3 now genuinely parallel.
- ✅ non-blocking — escalationPolicy inference added to T5; audit-log **write** path added (`lib/repo/audit.ts`, T3 + called in T5/T6b); T8 idle-billing relabelled manual; T6/6b/7 acceptance now name `pnpm test`.

Coverage of Phase-1 §16 items confirmed (16.1 cost cage, 16.3 escalation incl. pause, 16.4 data model, 16.5 core security, 16.6 scope). Phase 2-5 items correctly deferred. Graph acyclic: T0→T1→{T2∥T3}→{T4,T5}→T6→T6b→T7→T8.
