#!/usr/bin/env bash
# Momentum — manual deploy to Cloud Run (₹0: min=0, max=1). Secrets come from local
# secrets.json/.env → plain Cloud Run env vars (no Secret Manager). CI does the same from
# GitHub Actions secrets. Prereqs: gcloud authed; secrets.json + .env present; APIs enabled.
set -euo pipefail

PROJ="${GCP_PROJECT:-dmjone}"
REGION="${RUN_REGION:-asia-east1}"
SERVICE="${SERVICE:-momentum}"
PROJ_NUM="$(gcloud projects describe "$PROJ" --format='value(projectNumber)')"
RUN_SA="momentum-run@${PROJ}.iam.gserviceaccount.com"
SWEEP_SA="momentum-sweeper@${PROJ}.iam.gserviceaccount.com"
URL="https://${SERVICE}-${PROJ_NUM}.${REGION}.run.app"

ENVFILE="env.deploy.yaml"
trap 'rm -f "$ENVFILE"' EXIT
APP_URL="$URL" SWEEP_SA="$SWEEP_SA" node scripts/make-env-yaml.mjs > "$ENVFILE"

echo "Deploying ${SERVICE} → ${URL}"
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
  --clear-secrets \
  --env-vars-file="$ENVFILE"

echo "Deployed: ${URL}"
