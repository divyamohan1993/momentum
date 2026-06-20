# Changelog

All notable changes to Momentum. Format: [Keep a Changelog](https://keepachangelog.com).

## [0.1.1] — 2026-06-20

### Changed
- **Secrets:** replaced Google Secret Manager with plain Cloud Run env vars sourced from GitHub Actions secrets (free, ₹0). Values are injected at deploy via a generated `--env-vars-file`.
- **CI/CD:** push to `main` now auto-deploys to Cloud Run (`.github/workflows/deploy.yml`, auth via a scoped deployer service account). Docs-only pushes skip the deploy.
- **Theme — "Sunrise Aurora":** light mode (warm cream + drifting positive aurora) and dark mode (pure black with colorful lightning). Theme **auto-follows the OS** (`prefers-color-scheme`) and live-updates with it; a manual toggle sets an explicit preference that then wins. Distinctive fonts (Bricolage Grotesque + Plus Jakarta Sans).
- **Branding:** refreshed favicon / app icon (sunrise-gradient ring + comet) used everywhere — browser tab (`icon.svg`), PWA install (192/512), iOS home screen (`apple-icon`), and the in-app header.

## [0.1.0] — 2026-06-18

### Added
- Cinematic mission-control Kanban: To-Do / Doing / Done, drag-and-drop (dnd-kit), inline quick actions, pressure gauges, ⌘K command palette, Focus Mode with countdown ring, drifting WebGL-free aurora, `prefers-reduced-motion` + full ARIA support.
- AI brain (Gemini 2.5 Flash): natural-language capture → structured tasks, fuzzy IST date resolution, priority/effort/cognitive-load inference, semantic voice commands (no trigger words), deterministic "what's next" ranking with visible reasons. Daily-cap guard + retry on transient 5xx; graceful degradation to manual when the brain is unavailable.
- Reminder + escalation engine: fires at `dueAt`, repeats, then climbs to a full-screen alarm rung; transactional claim-then-send (no double-send / no resurrection); ack cancels, Doing pauses, snooze re-arms. **Event-driven via Cloud Tasks** — one OIDC-authed task scheduled at each reminder's exact time and deleted on completion, so idle = zero compute (no cron). `/api/sweep` remains as an owner-triggered manual reconcile.
- Web Push (VAPID) + installable PWA (service worker, manifest, generated icons).
- Security: owner passphrase gate (Argon2id) with in-memory IP limiter + durable lockout, signed HttpOnly session with revocation, field-level AES-256-GCM encryption (title/description/blockedReason), OIDC verification on the sweep, optional Cloudflare edge-secret gate, Secret Manager for all secrets, append-only audit log.
- ₹0 deployment: Cloud Run (asia-east1, min=0/max=1) from source via Cloud Build; Gemini key on a billing-disabled project (cannot bill); Firestore `(default)` free tier; idempotent `deploy.sh` + `setup-scheduler.sh`; `infra/cost-budget.json` source of truth.

### Notes
- Deferred per review (recorded in the design doc): adaptive per-channel ML nudging (fixed intervals instead), one-click mic→Gemini-audio, calendar routing, weekly briefings, Firebase Google sign-in (passphrase gate instead). The `/super-admin` panel and quantum-safe field crypto beyond the three text fields remain a fast-follow.
