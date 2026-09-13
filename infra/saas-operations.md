# Momentum SaaS operations

## Access and workspace identity

Every verified Google account may create its own private workspace through the existing `dmjone` Google/Firebase provider. Password, anonymous, custom-token and wrong-project identities are rejected. The Admin SDK verifies token authenticity and revocation, and the application checks the provider, verified email, subject and recent authentication.

New workspace IDs are derived from the Firebase UID with a reserved prefix. Requests cannot supply or change this identity. Each task read checks ownership before decryption; mutations, AI context, exports, projects, version counters and preferences use the authenticated workspace. Projects and sensitive task fields use workspace-derived HKDF/AES-GCM keys with authenticated workspace context.

The original owner's pinned Firebase UID maps to the existing legacy owner key; both its Google subject and email must still match. This retains task IDs, ciphertext compatibility and queued reminder links without reassigning data by email. On first SaaS login, the original owner's global preferences/version/notification metadata are copied into their workspace. New users never receive those records. Old encrypted fields remain readable only in that legacy workspace; new/updated fields use scoped encryption.

## Sessions and shared-device privacy

Portal sessions last eight hours and are stored by credential hash. The opaque credential includes a purpose-specific MAC so random cookies are rejected before database access. A separate authenticated device cookie is required, and its server binding must agree with the session's workspace. Cookies are Secure, HttpOnly, host-only and SameSite=Strict. Authentication checks include current Firebase account status and token-revocation time.

Signing into another account changes the device binding and makes the previous account's sessions and notification actions on that device unusable. Logout revokes the session and clears the account binding. Browser tabs receive an account-change signal and reload without retaining the prior board. Dynamic responses are private/no-store and scripts require a nonce.

Push subscriptions are private per workspace and device. Delivery checks the current device owner and Google identity/revocation state. Only supported HTTPS push-provider endpoints are accepted. Notification actions require both a task-bound signed capability and a matching account-bound device; they cannot authenticate to the portal or Vertex. Legacy notification subscriptions must be re-enabled after migration to bind them to the current account/device.

## Data and practical features

Each account gets projects, tags/search/filtering, notes, subtasks, priorities, focus mode, recurring tasks, timezone settings and reminders. Recurrence preserves local time across daylight saving and month-end anchors; completing a recurring task concurrently creates only one next occurrence. Reminders are capped at six deliveries per task/deadline and are paused/cancelled on the relevant task changes.

JSON exports include only the user's tasks/projects/settings and no session, push or OAuth credentials. CSV output neutralizes spreadsheet formulas. Calendar exports escape and fold user text. Imports validate the complete batch before writing, generate fresh task and project IDs, remap project relationships within the destination workspace, and disable reminders for review. Imports never overwrite another workspace or existing tasks. Task deletion removes the task record and releases its storage slot; historical deleted legacy records are not silently purged during migration.

Calendar free/busy integration, if separately configured, stores tokens per workspace. Calendar-file export is available without granting additional Google scopes.

## Fair-use and cost controls

The service is free to users; cloud costs remain with the operator.

- Vertex: pinned `gemini-2.5-flash-lite`, global endpoint, keyless runtime credentials.
- Per workspace: 10 AI attempts/day by default, capped at 20 by configuration; 3/minute.
- Shared Vertex budget: at most 200 attempts/day and 10/minute. Every retry reserves again.
- Prompts: 16,000 UTF-8 bytes; output: 2,048 tokens; thinking disabled; no external model tools.
- AI board context is bounded and explicitly marks omitted tasks rather than silently implying it is complete.
- Task storage: up to 5,000 records/workspace. Writes: 1,000/day and 200/minute/workspace, with a shared 10,000/day write budget.
- Imports: at most 200 tasks and 1 MB per request. Push: at most five registered devices/workspace.

Quota dates use one shared India-time reset and cannot be reset by changing a user's timezone. Limits fail closed. AI exhaustion leaves manual task management available; write/storage exhaustion returns a fair-use error. These application limits are not a project-wide billing ceiling, and public login pages can still receive unwanted traffic.

## Cloud and deployment

The application remains on Cloud Run in `asia-east1`, with zero minimum and one maximum instance. `APP_ORIGIN` is `https://momentum.dmj.one`; browser entry through Cloud Run aliases redirects there. Existing internal Cloud Tasks URLs/audiences retain `APP_BASE_URL`. Task callbacks require the pinned Google service identity and resolve the workspace from the stored task; user-triggered callbacks can operate only on the current user's task.

Firestore's current shared rules contain no browser/client allow rule for `momentum_*` collections. That default-deny property must be retained; no unrelated applications' rules were changed. The runtime has narrow custom Vertex prediction and Firebase-user-read roles plus its existing data/queue permissions. The browser Auth key is restricted to the required six authentication methods and the two required domains; it cannot authorize Vertex.

A previous CI credential file was found in a private source archive. The bucket had no public IAM grant. That deployment key was replaced in GitHub and disabled, the affected archive was removed, and `gha-creds-*.json` is now excluded from Git, Docker contexts and Cloud Run uploads. Generated environment files and emulator build outputs are also excluded.

Next.js and transitive dependencies were patched; the unused image optimizer is disabled. CI and the deployment workflow run unit tests, two-account emulator tests and a production dependency audit before deployment. Work remains on `main`; PR #1's lossless screenshot optimization was merged while preserving the current favicon, its branch was removed, and automatic branch deletion is enabled.

## Verification and limits

`pnpm test:workspaces` runs against the `demo-momentum` Auth/Firestore emulators bound to loopback, never production. It checks two real HTTP sessions, legacy migration, private projects/tasks/exports, cross-user denial, import ownership/ID remapping, deletion, recurring-task idempotency, direct Firestore denial, token replay, logout, shared-device switching and notification isolation. Unit tests additionally exercise credentials, encryption scope, CSV/calendar safety, timezone recurrence and Vertex transport bounds. Production refuses emulator configuration.

A cloud administrator, runtime or database writer remains trusted, and a fully compromised account/device is a security incident. This is server-side encryption, not end-to-end encryption. Google account MFA/passkeys are controlled by the user's Google account. No claim of absolute breach-proof or abuse-proof operation is made.

Local release checks: 49 unit tests and 45 two-account integration checks passed, the production build passed, and the production dependency audit reported no known vulnerabilities. Browser verification covered authenticated board rendering, manual creation/search, and workspace/data controls. The nonce script explicitly accounts for browser nonce-attribute masking during hydration.

## Shared lists

`/shared` offers optional common lists alongside the private board. A verified Google user can create up to 20 lists or memberships, with 20 members and 200 tasks per list. Tasks support notes, completion/in-progress status, priority, a calendar due date, and assignment to a current member. All members may manage tasks. Only the creator may rename/delete the list, invite people, revoke invitations, or remove members; other members may leave. Personal tasks, AI context, exports, calendars, and push subscriptions stay personal.

The server stores each bounded list in `momentum_shared_lists`, with a private per-UID index in `momentum_shared_memberships`. Names, task titles, and notes use an independent list-scoped encryption key. Membership checks precede decryption; all mutations recheck membership inside the same Firestore transaction as the write. Removing membership immediately prevents subsequent reads/writes. Task revisions reject conflicting updates with HTTP 409. Lists are capped at 800 KB of serialized encrypted data below Firestore's document ceiling. Every mutation consumes the acting user's existing write quota and the global write quota. Shared list operations never call Vertex.

Invitations require an explicit acceptance by the verified Google email specified by the owner. Tokens contain 256 random bits; only their SHA-256 digests are stored. They expire after seven days, are single-use, can be revoked, and are replaced when reinviting the same email. Shareable links put tokens in the URL fragment, keeping them out of HTTP URLs and referrers. `/shared` displays Google sign-in for guests and preserves the fragment through that sign-in, then removes it from the address bar on the acceptance screen. No email is sent by the application. Members' Google emails are visible to other members, explained before acceptance.

Emulator integration checks cover three Google accounts, invitation email binding, replay/expiry/revocation, non-member and removed-member access, owner/member permissions, concurrent edits, direct Firestore denial, encryption, deletion cleanup, and separation from private task endpoints. The UI polls only while visible, rechecks session identity, and clears list content when access is unavailable.

Both shared collections are fetched only by document ID. Production has collection-scoped `*` single-field index exemptions on `momentum_shared_lists` and `momentum_shared_memberships` to avoid indexing encrypted task arrays and unused membership data. Reproduce with `gcloud firestore indexes fields update '*' --collection-group=COLLECTION --database='(default)' --disable-indexes --project=dmjone`. No existing application indexes are changed. This follows [Firestore's guidance for unqueried large arrays/maps](https://firebase.google.com/docs/firestore/best-practices).
