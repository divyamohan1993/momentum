#!/usr/bin/env bash
# Momentum — idempotent deploy to Cloud Run (₹0: min=0, max=1, free-tier only).
# Prereqs: gcloud authed; secrets pushed (scripts/provision done); APIs enabled.
set -euo pipefail

PROJ="${GCP_PROJECT:-dmjone}"
REGION="${RUN_REGION:-asia-east1}"
SERVICE="${SERVICE:-momentum}"
PROJ_NUM="$(gcloud projects describe "$PROJ" --format='value(projectNumber)')"
RUN_SA="momentum-run@${PROJ}.iam.gserviceaccount.com"
SWEEP_SA="momentum-sweeper@${PROJ}.iam.gserviceaccount.com"
URL="https://${SERVICE}-${PROJ_NUM}.${REGION}.run.app"

echo "Deploying ${SERVICE} → ${URL}"

# Secret Manager bindings: env-var = SECRET NAME : version (names only, never values). pragma: allowlist secret
SECRETS="OWNER_PASSPHRASE_HASH=momentum-owner-hash:latest,SESSION_SECRET=momentum-session-secret:latest,FIELD_KEY=momentum-field-key:latest,GEMINI_API_KEY=momentum-gemini-key:latest,VAPID_PUBLIC_KEY=momentum-vapid-public:latest,VAPID_PRIVATE_KEY=momentum-vapid-private:latest" # pragma: allowlist secret

gcloud run deploy "$SERVICE" \
  --source . \
  --project="$PROJ" \
  --region="$REGION" \
  --service-account="$RUN_SA" \
  --min-instances=0 \
  --max-instances=1 \
  --memory=512Mi \
  --cpu=1 \
  --concurrency=80 \
  --timeout=60 \
  --allow-unauthenticated \
  --quiet \
  --set-env-vars="OWNER_EMAIL=divyamohan1993@gmail.com,GEMINI_MODEL=gemini-2.5-flash,GEMINI_DAILY_CAP=200,VAPID_SUBJECT=mailto:divyamohan1993@gmail.com,GCP_PROJECT=${PROJ},NODE_ENV=production,TZ=Asia/Kolkata,SWEEP_INVOKER_SA=${SWEEP_SA},SWEEP_AUDIENCE=${URL}/api/sweep,APP_BASE_URL=${URL},TASKS_LOCATION=asia-east1,TASKS_QUEUE=momentum-reminders" \
  --set-secrets="$SECRETS"

echo "Deployed: ${URL}"
