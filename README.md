# Momentum

A free, private task workspace for every Google account.

**Live: https://momentum.dmj.one**

Sign in with Google to get your own board, projects, notes, reminders and AI assistance. Personal workspaces stay private. Optional shared lists let couples, friends, and groups manage common tasks together.

## Included for free

- Kanban board, quick task capture, notes, priorities, tags, search and project filters.
- Recurring tasks, editable subtasks, focus mode and deadline reminders.
- Personal timezone settings with daylight-saving-aware deadlines and recurrence.
- AI capture, task breakdown, stale-task triage, board questions and weekly briefings.
- JSON backups, spreadsheet CSV export, calendar-file export and safe JSON imports.
- Shared lists with Google-email-bound invitations, assignments, notes, priorities, due dates, and member controls.
- Private notifications bound to the account currently using each device.

There are no paid plans or payment-card requirements. Hosting and Vertex AI still cost the operator money, so fair-use limits apply: 10 AI attempts per workspace/day within a shared 200/day budget, up to 5,000 stored tasks, and 1,000 task changes per workspace/day within a shared 10,000/day write budget. Imports accept up to 200 tasks/1 MB at a time and create copies with reminders disabled for review.

Open **Shared lists** from your board, create a list, then expand **Members & invitations**. Enter the recipient's Google email and send them the generated link. They sign in and accept to join. Invite up to 20 members per list; you can belong to 20 lists, each with up to 200 tasks. Invitations expire in seven days and can be revoked.

## Security and isolation

Google verifies the account. Opaque, authenticated session and device cookies map to revocable server records; user-supplied owner IDs never select a workspace. Tasks, projects, preferences, AI usage and notification subscriptions are scoped on the server. Task text uses workspace-derived AES-GCM keys. Direct browser access to Momentum's Firestore collections is denied.

Vertex uses the Cloud Run runtime identity and the pinned Gemini 2.5 Flash-Lite model. Browser Firebase configuration grants only specific authentication API methods and cannot call Vertex. Requests, token counts, retries and shared quotas are bounded. These controls do not make a compromised cloud administrator, runtime or valid account credential harmless.

See [SaaS operations](infra/saas-operations.md) for migration, quotas, deployment and verification details.

## Development and checks

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm test:workspaces       # Java 21+; local Firebase Auth/Firestore emulators only
pnpm typecheck
pnpm build
pnpm audit --prod
```

Copy `.env.example` for local configuration. Google login needs a development OAuth/Firebase setup with an appropriately restricted development key; production browser keys intentionally do not authorize localhost. `scripts/gen-secrets.mjs` is for a new installation only and must not replace keys protecting existing data.

Changes stay on `main`. CI and deployment run unit tests, three-account emulator checks and a production dependency audit before Cloud Build deploys the app. `bash deploy.sh` performs the same checks for a manual deployment.

## Stack

Next.js 15 · React · TypeScript · Tailwind CSS · Firestore Admin SDK · Firebase Google Authentication · Vertex AI · Cloud Run · Cloud Tasks · Web Push.
