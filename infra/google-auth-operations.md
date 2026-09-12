# Google-only owner authentication — historical rollout

> This records the earlier single-owner rollout. The current multi-user design, migration rules and limits are in [SaaS operations](saas-operations.md).

Momentum reuses the enabled Google provider in the `dmjone` Firebase/Identity Platform project. Only `momentum.dmj.one` was appended to the project's authorized domains; other applications' configuration was preserved. The Firebase web app is `1:107722137045:web:47107f34c4466ef4de315c`, with the existing `dmjone.firebaseapp.com` OAuth handler.

## Admission policy

Only `divyamohan1993@gmail.com` is allowed, pinned to Firebase UID `e2e-admin-1778404528125` and Google subject `117046041061265402598`. Email alone is not sufficient. The Admin SDK verifies the Firebase signature, issuer, project audience, expiry, disablement and revocation. The application additionally requires the pinned UID and Google identity, verified email, `google.com` sign-in provider, no tenant, and authentication/token issuance within five minutes. Password, custom-token and anonymous identities are rejected.

The browser uses Firebase's managed Google popup flow with in-memory persistence, exchanges its short-lived ID token over a same-origin POST, then signs out of the Firebase browser SDK. No refresh token is intentionally retained in localStorage or IndexedDB. The public Firebase configuration is delivered at request time, not baked into a container build.

The exchange requires an authenticated, five-minute browser CSRF proof and exact configured Origin. Every accepted ID token is marked as used in a Firestore transaction so it cannot be exchanged twice. At most 20 exchanges may remain unexpired, and at most five browser sessions are retained. Public login requests also have a bounded process-wide rate limit before token validation. These limits complement, rather than replace, Google's own abuse protection.

Portal sessions are 256-bit random opaque credentials. Only SHA-256 hashes are stored in `momentum_meta/browser_sessions`. The `__Host-momentum_session` cookie is Secure, HttpOnly, SameSite=Strict, path `/`, without a Domain attribute, and expires after eight hours. Every protected request checks the server record, expiry, pinned identity, Firebase account disablement, linked Google identity and token revocation time. Logout deletes that session record immediately without signing the owner out of other applications. A stolen `SESSION_SECRET` alone cannot create a portal login session; this secret remains for CSRF proofs and purpose-separated notification tokens.

Password login returns HTTP 410 and cannot create sessions. Old password JWTs, Firebase ID tokens and notification tokens are never accepted as portal cookies. The previous password hash is removed from the serving runtime and deployment scripts. Browser entry through a Cloud Run hostname redirects to the canonical Momentum domain so old notification links also reach the working Google login.

## Browser and backend boundaries

Middleware provides only navigation hints; every protected page and API verifies authorization on the server. Each dynamic response gets a fresh script nonce, no unsafe-inline script permission, and private/no-store caching. Google popups use `Cross-Origin-Opener-Policy: same-origin-allow-popups`. Hostname or Fetch Metadata headers cannot override the exact Origin requirement for session-authenticated mutations.

Cloud Tasks/Scheduler calls still require a valid Google OIDC token with the exact configured service-account email and endpoint audience; missing configuration now fails closed. Notification action tokens are task-bound, purpose-separated and limited to their existing three notification actions. They grant neither portal access nor Vertex access. Old notification action tokens are retired by the purpose-key change; newly delivered notifications use the new tokens.

The current shared Firestore security rules contain no client allow rule for any `momentum_*` collection. Thus browser clients, including Firebase-authenticated clients, cannot read or write Momentum sessions/data directly. No shared Firestore rules were changed. This default-deny property must be preserved in future rules deployments.

## Cloud permissions and keys

Runtime identity: `momentum-run@dmjone.iam.gserviceaccount.com`. A dedicated custom role `projects/dmjone/roles/momentumAuthVerifier` grants only `firebaseauth.users.get` for identity/revocation checks. No Firebase user administration, token-creation or service-account signing privilege was granted.

The public browser key `momentum-browser-auth` is restricted to referrers `https://momentum.dmj.one/*` and `https://dmjone.firebaseapp.com/*`, and these methods:

- `google.cloud.identitytoolkit.v1.ProjectConfigService.GetProjectConfig`
- `google.cloud.identitytoolkit.v1.AuthenticationService.CreateAuthUri`
- `google.cloud.identitytoolkit.v1.AuthenticationService.SignInWithIdp`
- `google.cloud.identitytoolkit.v1.AccountManagementService.GetAccountInfo`
- `google.cloud.identitytoolkit.v2.AuthenticationService.GetRecaptchaConfig`
- `google.identity.securetoken.v1.SecureToken.GrantToken`

The key does not authorize Vertex, password login, SMS sending or user administration. Referrer restrictions are supplemental controls, not proof of user identity. The public key is an application identifier, not a secret or a portal credential.

Vertex continues to use only the Cloud Run runtime's short-lived OAuth credentials. No route returns these credentials. The pinned Flash-Lite model, request/token bounds, daily budget and retry accounting remain in place; see [Vertex operations](vertex-operations.md).

## Deployment and verification

Required public runtime configuration: `APP_ORIGIN`, `OWNER_GOOGLE_UID`, `OWNER_GOOGLE_SUB`, `FIREBASE_API_KEY`, `FIREBASE_APP_ID`. `APP_BASE_URL` remains the existing Cloud Run URL to preserve scheduled Cloud Tasks audiences. Later CI deployments read and retain the serving public auth configuration; missing configuration fails deployment rather than silently reopening password access.

41 regression tests and TypeScript checks pass. Local production-browser verification confirmed the Google button, no browser errors, nonce CSP, retired password endpoint, CSRF enforcement and unauthenticated brain rejection. Google's live project configuration accepted the restricted browser key, while its password method returned `403 API_KEY_SERVICE_BLOCKED`.

A real owner's Google account approval requires the owner to interact with Google. No test password, custom-token login, synthetic production session or bypass endpoint is provided to simulate that approval.

## Limits

This is a shared Firebase identity project and its Google provider is trusted. A stolen valid owner credential, a compromised owner Google account, cloud administrator, runtime or server-side database writer remains a security incident; no application can promise immunity to those compromises. Google account MFA/passkeys are governed by the owner's Google account settings. Application budgets are not a project-wide billing ceiling, and public login pages can still receive unwanted traffic.

Official references:

- https://firebase.google.com/docs/auth/web/google-signin
- https://firebase.google.com/docs/auth/admin/verify-id-tokens
- https://firebase.google.com/docs/projects/api-keys
- https://developers.google.com/identity/openid-connect/openid-connect


Cloud Run verification: revision `momentum-00021-zuj` rejected retired password login, unknown/legacy-shaped sessions, invalid Google credentials, incorrect CSRF and unauthorized operations. Its runtime identity passed a read-only Firebase owner lookup in a temporary Cloud Run job. No test session was inserted into production. Google also rejected an owner OAuth credential with the wrong OAuth-client audience (`INVALID_IDP_RESPONSE`), as expected.


The final dependency audit identified advisories in the pre-existing Next.js 15.5.19 stack. Next.js is upgraded to 15.5.24 within the same release line. Overrides require patched PostCSS, nanoid, protobufjs and sharp, plus CommonJS-compatible uuid 11 for old uuid 9 consumers. The unused public image optimizer is disabled. CI and the deployment workflow now run production dependency audits and regression tests before deployment. A clean dependency audit is a dated check against published advisories, not a guarantee that undiscovered vulnerabilities do not exist.

Patch references:

- https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4
- https://github.com/vercel/next.js/releases/tag/v15.5.24

Post-patch local verification: production dependency audit reports no known vulnerabilities; all 41 tests and the Next.js 15.5.24 production build pass. The live Google popup was verified to reach the Google sign-in screen branded **dmj.one**, with the expected OAuth client and Firebase callback. The owner account approval remains an interactive step.
