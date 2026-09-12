# Momentum

**An AI chief-of-staff that refuses to let things slip.**

Dump the chaos of your week into one box — typed or spoken. Momentum *understands* it: splits a brain-dump into real tasks, resolves "tomorrow evening" to a concrete time, infers priority and effort, ranks everything for you, and surfaces the **one thing to do next**. When a deadline nears and you've ignored it, it gets louder — a quiet push, then a full-screen alarm — and stops the instant you act.

🔗 **Live:** https://momentum-107722137045.asia-east1.run.app

![board](docs/board.png)

## Why it's different

- **Intelligence is the product.** Natural-language capture, semantic voice control (no trigger words), auto-ranking with visible reasons ("ranked #1: due in 18h"), adaptive escalation. Not a CRUD board with a cron.
- **Cinematic.** A mission-control cockpit: deep-space dark, a drifting aurora, cards that lift under your cursor, a ⌘K command palette, and a Focus Mode that brings one card full-screen with a live countdown ring.
- **Bounded running costs.** Cloud Run scales to zero; reminders use event-driven Cloud Tasks. The brain uses paid Vertex AI Gemini 2.5 Flash-Lite with at most 200 attempts/day (including retries), 10/minute, 16 KB of prompt text and 2,048 output tokens per attempt. Thinking is disabled. See [Vertex operations](infra/vertex-operations.md).
- **Secure by default.** Owner-locked, field-level AES-256-GCM encryption on task text, Google-only sign-in pinned to the owner identity, revocable server-side sessions, OIDC-verified internal calls. Secrets live as GitHub Actions secrets and are injected as Cloud Run env vars at deploy (no paid Secret Manager).
- **CI/CD.** Push to `main` → GitHub Actions builds from source and deploys to Cloud Run automatically. CI typechecks + builds every push and PR.

## Speak, and the board obeys

> *"I'm doing the deck and the verifier PR."* → both cards move To-Do → Doing.
> *"finished the deck, starting the bug fix"* → one Done, one Doing, in a single breath.

Intent is inferred semantically — say it however it comes out. Ambiguous? It asks instead of guessing.

## Stack

Next.js 15 (App Router) · TypeScript · Tailwind v4 · Motion · dnd-kit · cmdk · Firestore (Admin SDK) · Vertex AI Gemini 2.5 Flash-Lite · Web Push (VAPID) · Cloud Run · Cloud Tasks (event-driven reminders) — deployed from source via Cloud Build.

Authentication setup and security boundaries: [Google sign-in operations](infra/google-auth-operations.md).

## Run it

```bash
pnpm install
node scripts/gen-secrets.mjs        # NEW installation only; writes encryption/push secrets
gcloud auth application-default login # local keyless Vertex + Firestore access
pnpm dev                            # http://localhost:3000
```

Deploy (Cloud Run): `bash deploy.sh && bash setup-tasks.sh`. Architecture and locked decisions: [`docs/dmj/specs`](docs/dmj/specs/2026-06-18-momentum-build-design.md) and [`idea.md`](idea.md).

---

Built by Divya Mohan with Claude Opus as co-architect. Aatmnirbhar Bharat — quality tools, built free.
