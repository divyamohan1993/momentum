#!/usr/bin/env bash
# Provisions the event-driven reminder infra: a Cloud Tasks queue + IAM.
# No cron — reminders schedule one task at their exact fire time, so idle = zero compute.
# Run once (idempotent). Cloud Tasks free tier: 1M ops/month.
set -euo pipefail

PROJ="${GCP_PROJECT:-dmjone}"
TASKS_LOCATION="${TASKS_LOCATION:-asia-east1}"
QUEUE="${TASKS_QUEUE:-momentum-reminders}"
RUN_SA="momentum-run@${PROJ}.iam.gserviceaccount.com"
SWEEP_SA="momentum-sweeper@${PROJ}.iam.gserviceaccount.com"

gcloud services enable cloudtasks.googleapis.com --project="$PROJ" >/dev/null 2>&1 || true

gcloud tasks queues create "$QUEUE" --location="$TASKS_LOCATION" --project="$PROJ" 2>/dev/null \
  && echo "created queue $QUEUE" || echo "queue $QUEUE exists"

# Runtime SA: create + DELETE tasks (enqueuer alone cannot delete -> use queue-scoped admin),
# and actAs the sweeper SA to mint the OIDC token the /api/fire endpoint verifies.
gcloud tasks queues add-iam-policy-binding "$QUEUE" --location="$TASKS_LOCATION" --project="$PROJ" \
  --member="serviceAccount:${RUN_SA}" --role="roles/cloudtasks.admin" >/dev/null
gcloud iam service-accounts add-iam-policy-binding "$SWEEP_SA" --project="$PROJ" \
  --member="serviceAccount:${RUN_SA}" --role="roles/iam.serviceAccountUser" >/dev/null

echo "Cloud Tasks reminder infra ready (queue=$QUEUE @ $TASKS_LOCATION)."
