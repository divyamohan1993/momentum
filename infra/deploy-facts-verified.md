# Build-Time Verified Fact Sheet — ₹0 GCP Deploy (Momentum)

Project: **dmjone** · Region: **asia-east1** · Verified: **2026-06-18** · Sources: official only (ai.google.dev, cloud.google.com, docs.cloud.google.com, firebase.google.com, nextjs.org, github.com/web-push-libs).

> Method note: ai.google.dev pricing/models tables are JS-rendered; the WebFetch summarizer garbled them (reported identical free/paid prices, which are false). Load-bearing values below were read from **raw page HTML/`.md.txt`** to defeat that. Numbers that only live in a JS table (current Gemini RPM/RPD/TPM) are marked **UNCONFIRMED** per instruction rather than shipped stale.

---

## 1. Gemini free tier (ai.google.dev / AI Studio)

### THE BUDGET-CRITICAL FACT — billing-enabled = PAID from request 1
**A Gemini API key created via `gcloud services api-keys create --api-target=service=generativelanguage.googleapis.com` on a billing-ENABLED project is on the PAID tier (Tier 1) and is billed per token from request 1. It does NOT retain a free allotment.**

- The Gemini **Developer API does NOT follow the GCP "Always-Free within limits even with billing on" model.** Free tier and billing are mutually exclusive project states.
- Verbatim tier table (`billing.md.txt`): `Free | Active project or free trial | N/A` vs `Tier 1 | Set up and link an active billing account | $250`. Free tier IS the no-billing state; linking billing = Tier 1 (paid). — https://ai.google.dev/gemini-api/docs/billing
- The pricing page renders the Free Tier value literally as **"Free of charge"** (a distinct $0 tier), not a $ rate — confirming free ≠ "discounted paid". — raw HTML of https://ai.google.dev/gemini-api/docs/pricing (updated 2026-06-15)
- Billing doc verbatim: *"AI Studio usage remains free of charge unless users link a paid API key."* Linking a paid key → charges. — https://ai.google.dev/gemini-api/docs/billing

**FORCED ARCHITECTURE (₹0 guardrail):** Cloud Run + Firestore + Scheduler **require** billing enabled on `dmjone`. Gemini's free tier **requires billing disabled**. Therefore the Gemini key MUST live on a **SEPARATE Google Cloud project with billing DISABLED** (or an AI Studio free key). Putting the Gemini key on `dmjone` (billing-on) = paid from request 1. Cost asymmetry forces this even under residual doubt: a no-billing project is free either way; a wrong "still free" assumption charges a user with ₹2.4L debt.

### Recommended model for fast structured JSON + multimodal audio
- **`gemini-3.5-flash`** — newest stable Flash (2026), listed with **Free of charge** tier. **Audio input RAW-CONFIRMED**: the official audio guide's examples use `gemini-3.5-flash` with `generateContent`, verbatim *"Gemini can analyze and understand audio input and generate text responses to it."* Best default for fast structured-JSON + audio. — https://ai.google.dev/gemini-api/docs/audio (.md.txt raw text) + pricing page
- **`gemini-2.5-flash`** — also stable + **Free of charge**; documented multimodal (audio) per its model card and a fine fallback. (Its audio support is in the JS-rendered models capability table, not raw-confirmed here; the audio *guide* leads with 3.5-flash.) — https://ai.google.dev/gemini-api/docs/models
- **`gemini-2.0-flash`** still free. Alias **`gemini-flash-latest`** EXISTS (auto-points to latest Flash; convenient but target/limits can shift under you — pin an explicit ID for reproducible cost). — raw HTML of https://ai.google.dev/gemini-api/docs/models + pricing page
- Structured output (`responseSchema` / JSON mode) is a standard Gemini API feature across the Flash family (config table is JS-rendered; not raw-confirmed per-model here). Native-audio/live variants (`gemini-2.5-flash-native-audio*`, `gemini-3.1-flash-live-preview`) are preview-only — avoid for a stable deploy; standard Flash accepts audio as ordinary multimodal `inline_data`/Files-API input.

### Free-tier rate limits (RPM / RPD / TPM)
- **UNCONFIRMED for June 2026.** The rate-limits page no longer publishes a static table; it defers to the JS-rendered AI Studio page (`aistudio.google.com/rate-limit`), which can't be statically scraped. — https://ai.google.dev/gemini-api/docs/rate-limits
- Last *static* figures (gemini-2.5-flash free): ~10 RPM / 250 RPD / 250,000 TPM — but these are from a **mid-2025 snapshot** and 2026 forum threads report RPD cuts (threads citing "25 RPD", "20 RPD", "92% quota reduction"). **Do NOT write 250 RPD into cost-budget.json as fact.** Read live limits from AI Studio at deploy time. — https://discuss.ai.google.dev (multiple 2026 threads)

### REST endpoint — CONFIRMED
- `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key=API_KEY` ✅ exact shape confirmed. API version `v1beta`. Key passable as `?key=` query param OR `x-goog-api-key` header. — https://ai.google.dev/api/generate-content

### 2026 bonus — Google Cloud Starter Tier
Billing doc mentions a new **Google Cloud Starter Tier** that "lets you publish up to 2 full stack [apps]" — may be relevant to a portfolio deploy. Verify scope before relying on it. — https://ai.google.dev/gemini-api/docs/billing → https://docs.cloud.google.com/docs/starter-tier

---

## 2. Cloud Run (2026) — billing ENABLED on dmjone, free within Always-Free limits

- **Always-free monthly allowance (account-wide, us-central1-priced as Tier-1 discount):** request-based **180,000 vCPU-sec + 360,000 GiB-sec + 2,000,000 requests**/mo (still current — verified, NOT changed). Instance-based billing: 240,000 vCPU-sec + 450,000 GiB-sec. Egress free 1 GiB/mo **North-America-source only**. — https://cloud.google.com/run/pricing + https://docs.cloud.google.com/free/docs/free-cloud-features (2026-06-16)
- **`--min-instances=0 --max-instances=1`:** scale-to-zero = **$0 idle**. Verbatim: *"Idle instances that are not minimum instances are not charged."* **CLIFF:** `min-instances≥1` bills one warm instance's CPU+memory 24/7 at the idle rate even at zero traffic. Keep min-instances=0. `max-instances=1` alone has no idle cost. — https://cloud.google.com/run/pricing
- **`gcloud run deploy --source .`:** builds via **Cloud Build → Artifact Registry, NO local Docker** (*"without having to install Docker on your machine"*). Uses your Dockerfile if present, else buildpacks; auto-creates `cloud-run-source-deploy` AR repo. Enable APIs: Cloud Run Admin + Cloud Build + Artifact Registry. — https://docs.cloud.google.com/run/docs/deploying-source-code
- **Request timeout:** default **300s (5 min)**, max **3600s (60 min)**. — https://docs.cloud.google.com/run/docs/configuring/request-timeout
- **Unauthenticated:** requires `--allow-unauthenticated` (grants `allUsers` the Invoker role). **ORG-POLICY GOTCHA — CONFIRMED:** *"won't succeed if your project is under a domain restricted sharing organization policy that restricts granting IAM roles to the `allUsers` member type"* (`constraints/iam.allowedPolicyMemberDomains`). Workaround: disable the Cloud Run Invoker IAM check. — https://docs.cloud.google.com/run/docs/authenticating/public
- **Node buildpack:** Node **22 AND 24** both supported (default builder `google-24`). Official Cloud Run Next.js path uses `--source .` (Cloud Build auto-generates a Dockerfile) — a hand-written Dockerfile works but is not required. — Cloud Run Next.js quickstart

---

## 3. Firestore (2026) — billing ENABLED on dmjone, (default) DB free within daily quota

- **(default) DB always-free DAILY quota — CONFIRMED current:** **50,000 reads/day · 20,000 writes/day · 20,000 deletes/day · 1 GiB stored · 10 GiB/mo egress.** Resets ~midnight Pacific. Excluded from free tier: TTL deletes, PITR, backup/restore/clone. — https://firebase.google.com/docs/firestore/quotas + /pricing (both 2026-06-17)
- **CLIFF EDGE — CONFIRMED:** *"Cloud Firestore allows exactly one free database per project."* / *"The first database you create (regardless of its ID) qualifies for the free quota... All subsequent database will be charged on usage incurred on those databases."* → **Use ONLY `(default)`. Any second/named DB is billed from operation #1.** — https://firebase.google.com/docs/firestore/pricing
- **Admin SDK on Cloud Run uses ADC, NO key file — CONFIRMED:** initialize with no args (`initializeApp()`); ADC uses the Cloud Run runtime service account. *"strongly recommended for applications running in Google environments such as ... Cloud Run."* — https://firebase.google.com/docs/admin/setup
- **Cross-region read (Cloud Run asia-east1 → Firestore (default) asia-south2) — ALLOWED.** No co-location requirement; docs frame co-location as a latency-only optimization (*"store your data close to the users and services that need it"*). Firestore location is fixed at creation (*"you cannot change its location setting"*). Both asia-south2 (Delhi) and asia-east1 (Taiwan) are valid Firestore locations. (Exact path inferred from "co-location is optional/latency-only" framing; not a verbatim sentence.) — https://firebase.google.com/docs/firestore/locations

---

## 4. Web Push / VAPID (2026)

- **`web-push` npm — current/standard, latest `3.6.7`** (stable; last publish ~Jan 2024 — mature, not churning). Standard Node.js library for VAPID Web Push. Repo already pins `web-push@^3.6.7`. — https://registry.npmjs.org/web-push/latest + https://github.com/web-push-libs/web-push
- **Payload size limit ~4096 bytes (4 KB)** a push service must support; usable payload slightly less after encryption (~4078 B pre-encryption). — https://web.dev/articles/push-notifications-web-push-protocol (IETF webpush / RFC 8291)
- **Chrome/Edge use the FCM endpoint transparently — NO Google/FCM server API key needed.** Standard VAPID Web Push needs only the **VAPID public/private keypair + the PushSubscription endpoint**; VAPID JWT goes in `Authorization: WebPush …`. Legacy `gcm_sender_id`/server-key flow is only for ancient Chrome ≤51. Modern Chrome 52+/Edge 17+/Firefox 46+/Safari 16+ all support VAPID. ✅ accurate for 2026. — https://github.com/web-push-libs/web-push
- **Generate keys:** `npx web-push generate-vapid-keys` (CLI) or `webpush.generateVAPIDKeys()` (programmatic, returns `{publicKey, privateKey}` URL-safe base64). — https://github.com/web-push-libs/web-push

---

## 5. Cloud Scheduler (2026)

- **Free = 3 jobs/month per BILLING ACCOUNT** (account-level, NOT per project, shared across all projects in the account). **CLIFF:** job #4 onward = **$0.10/job/month**. — https://cloud.google.com/scheduler/pricing → **dmjone gets 3 free scheduler jobs total across the whole billing account; stay ≤3.**
- **Every-minute → private Cloud Run with OIDC — CONFIRMED flags:**
  ```bash
  gcloud scheduler jobs create http JOB_ID \
    --location=asia-east1 \
    --schedule="* * * * *" \
    --uri=https://SERVICE-xxxxx.asia-east1.run.app/PATH \
    --http-method=POST \
    --oidc-service-account-email=SA_EMAIL \
    --oidc-token-audience=https://SERVICE-xxxxx.asia-east1.run.app
  ```
  (`--schedule` + `--uri` required; `--oidc-token-audience` should equal the Cloud Run base URL.) — https://docs.cloud.google.com/sdk/gcloud/reference/scheduler/jobs/create/http
- **Private Cloud Run invocation — CONFIRMED:** the scheduler's service account must have **`roles/run.invoker`** on the target service (when NOT `--allow-unauthenticated`). — https://docs.cloud.google.com/scheduler/docs/http-target-auth (2026-06-15)

---

## 6. Next.js on Cloud Run (2026)

- **Current stable Next.js: 16 (16.2.x; docs report 16.2.9).** NOT 15. ⚠️ **This repo pins `next@^15.5.4` — upgrade to `^16.2` recommended.** — https://nextjs.org/docs
- **Deploy pattern:** two official paths — (1) Cloud Run's own recommendation `gcloud run deploy --source .` (Cloud Build auto-generates the Dockerfile, no config change); (2) container mechanism `output: "standalone"` + multi-stage Dockerfile (smaller image, manual `server.js`). Gotcha for standalone: `public/` and `.next/static` are NOT auto-copied into `.next/standalone` — copy them in the Dockerfile. — https://nextjs.org/docs + Cloud Run Next.js quickstart
- **PORT contract — CONFIRMED:** Cloud Run injects `$PORT` (default **8080**); the app MUST listen on it. Next.js standalone `server.js` reads `process.env.PORT`. Also set `HOSTNAME=0.0.0.0`. — https://docs.cloud.google.com/run/docs/container-contract + Next.js docs

---

## ₹0 Budget Guardrails (the cliff edges that matter)
1. **Gemini key on a SEPARATE no-billing project** (or AI Studio free key). On billing-on `dmjone` = paid from request 1.
2. **Cloud Run `--min-instances=0`** always. `min-instances≥1` = 24/7 idle charge.
3. **One Firestore database only (`(default)`).** Any named/second DB = billed from op #1.
4. **≤3 Cloud Scheduler jobs total per billing account.** Job #4 = $0.10/mo.
5. asia-east1 has effectively **no free Cloud Run egress** (free 1 GiB is NA-source) — pennies for a portfolio app, but not zero; confirm the asia-east1 $/GiB SKU in the pricing calculator before finalizing the budget.
6. No service-account key files — ADC on Cloud Run (avoids a secret to manage, not a billing cliff).

### Provenance honesty
- **Strong (dated 2026-06 canonical pages):** all of §2–§6 core facts, §1 billing/endpoint.
- **UNCONFIRMED (instruction-permitted):** §1 current Gemini RPM/RPD/TPM (JS-only AI Studio table); exact asia-east1 Cloud Run egress $/GiB (JS SKU table).
- **Derived, not verbatim:** web-push publish date (~Jan 2024, npm operational field); Firestore exact asia-east1→asia-south2 path (inferred from "co-location optional" framing).
