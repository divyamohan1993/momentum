# Momentum Vertex operations

> The Vertex repair described here is retained. Current per-workspace quotas and data isolation are documented in [SaaS operations](saas-operations.md).

The September 12, 2026 investigation found that the deployed app called the Gemini Developer API with an invalid key (`400 INVALID_ARGUMENT`, `API_KEY_INVALID`). It did not call Vertex. The runtime identity also lacked Vertex prediction permission. The Google-managed Vertex service agent already held `roles/aiplatform.serviceAgent` and needed no changes.

Runtime: `momentum-run@dmjone.iam.gserviceaccount.com`. Its dedicated project custom role, `projects/dmjone/roles/momentumVertexPredictor`, grants only `aiplatform.endpoints.predict`. The existing Firestore and Cloud Tasks permissions are retained. There are no user-managed keys on this runtime identity. Do not grant the runtime the Google-managed service-agent role or Vertex administrator.

The application uses Application Default Credentials and short-lived OAuth access tokens from Cloud Run. There is no Gemini API key, credential file, user-controlled endpoint, model selection, grounding, code execution, or external tool access. The endpoint is fixed to Vertex's global endpoint and `gemini-2.5-flash-lite`. Model changes require a deliberate code/config change so there is no automatic upgrade to an expensive model.

Owner authentication and same-origin mutation guards run before body parsing or generation. Generation bodies are streamed with a 32 KB limit, text inputs are limited to 6,000 characters, and combined system/user prompts to 16,000 UTF-8 bytes. Every attempt, including retries, atomically reserves from the shared Firestore budget: at most 200/day (IST), 10/minute, two attempts/request, 2,048 output tokens/attempt, and thinking disabled. Invalid daily-cap configuration fails closed. These are application limits, not a project-wide billing ceiling or a defense against compromised cloud administrators. Shared-project IAM prediction permission is project-scoped, not a model-specific IAM grant.

Model output must pass Zod contracts before use. Task/action counts and card IDs are bounded; existing-task changes still require owner-scoped lookup. Board entries are passed as untrusted data, separate from system instructions. Low-confidence creation now uses the same confidence gate as other mutations. Prompt instructions reduce injection risk but do not prove semantic correctness. This is not a guarantee against all attacks, session theft or cloud-account compromise.

Capture retains manual fallback. New fallback captures preserve the full bounded original request in task descriptions even when the 20-card limit is reached. Last observed success/failure is stored in `momentum_meta/brain`; it never gates future Vertex calls. Ask remains available for retry. Safe structured logs use event `brain_unavailable` with a categorical reason only; prompts, responses, tokens and SDK exception bodies are not logged.

The prior fallback captures are ordinary task records and do not retain a reliable degraded marker or the full original prompt. They cannot be identified and reprocessed safely from status alone. This fix does not silently rewrite existing user tasks.

Current standard text prices are $0.10 per million input tokens and $0.40 per million output tokens. Vertex is paid; the old zero-cost claim does not apply. Google currently lists retirement on October 20, 2026: review and test a replacement before that date rather than enabling an unpriced automatic fallback.

Sources checked September 12, 2026:

- https://cloud.google.com/vertex-ai/generative-ai/pricing
- https://docs.cloud.google.com/vertex-ai/generative-ai/docs/access-control
- https://docs.cloud.google.com/vertex-ai/generative-ai/docs/learn/model-versions

To provision the narrow role in a fresh project (an administrator performs this once):

```bash
gcloud iam roles create momentumVertexPredictor --project=dmjone \
  --title='Momentum Vertex prediction only' \
  --permissions=aiplatform.endpoints.predict --stage=GA
gcloud projects add-iam-policy-binding dmjone \
  --member=serviceAccount:momentum-run@dmjone.iam.gserviceaccount.com \
  --role=projects/dmjone/roles/momentumVertexPredictor --condition=None
```

For local development, use `gcloud auth application-default login` with an account that already has the needed project access. For deployment, preserve existing runtime environment values and secret references; change only the Gemini model/location/cap and remove the obsolete `GEMINI_API_KEY`. Generated environment files are excluded from both source uploads and Docker contexts.

Verification: `pnpm test`, `pnpm typecheck`, `pnpm build`. Public `/api/health` remains inert and never spends a model call. Verify the real runtime by making an authenticated capture on a tagged revision, checking `degraded: false`, and removing only the synthetic test tasks before promotion.


Deployment verification on September 12, 2026:

- Final image: `sha256:fa183714d9ce40d1ce3100ff7d5111f616ce7b7102738a2378c94f3370408afb` (Cloud Build `60523a2f-dc8c-4ba6-a075-4b530357aca3`).
- Final revision: `momentum-00017-nof`; runtime remains `momentum-run@dmjone.iam.gserviceaccount.com`.
- 18 regression tests and TypeScript checks passed; the final Node 22 production container build succeeded.
- All six real brain endpoints returned `degraded: false` on the final revision, including a two-idea capture. Synthetic tasks were removed using the normal task deletion API.
- All six generation endpoints rejected unauthenticated requests. Cross-origin and oversized capture requests were rejected before generation.
- Browser verification showed the authenticated board, Brain online, capture and Ask controls, with no browser errors.
- Cloud Run service and revision maximum instance counts are both 1; minimum remains 0. The obsolete API-key variable is absent.
- After promotion, `momentum.dmj.one` returned an authenticated Ask response with `degraded: false`, and its board reported Brain online. All production traffic is on `momentum-00017-nof`; the temporary test tag was removed.
