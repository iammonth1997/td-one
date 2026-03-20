#!/usr/bin/env bash
set -euo pipefail

WORKER_NAME="tdone-remix"
ENVIRONMENT_NAME=""
SKIP_LOGIN="false"
SKIP_DEPLOY="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --worker-name)
      WORKER_NAME="${2:-}"
      shift 2
      ;;
    --env)
      ENVIRONMENT_NAME="${2:-}"
      shift 2
      ;;
    --skip-login)
      SKIP_LOGIN="true"
      shift
      ;;
    --skip-deploy)
      SKIP_DEPLOY="true"
      shift
      ;;
    *)
      echo "Unknown argument: $1"
      echo "Usage: ./scripts/setup-cloudflare.sh [--worker-name <name>] [--env <env>] [--skip-login] [--skip-deploy]"
      exit 1
      ;;
  esac
done

required_secrets=(
  "NEXT_PUBLIC_SUPABASE_URL"
  "NEXT_PUBLIC_SUPABASE_ANON_KEY"
  "SUPABASE_SERVICE_ROLE_KEY"
  "RESET_PIN_SECRET"
  "CRON_SECRET"
  "NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME"
  "CLOUDINARY_API_KEY"
  "CLOUDINARY_API_SECRET"
  "LINE_CHANNEL_ACCESS_TOKEN"
  "LINE_ADMIN_API_KEY"
)

echo "=== TDOne Remix Cloudflare Setup ==="
echo "Worker: ${WORKER_NAME}"
if [[ -n "${ENVIRONMENT_NAME}" ]]; then
  echo "Environment: ${ENVIRONMENT_NAME}"
fi

if [[ "${SKIP_LOGIN}" != "true" ]]; then
  echo
  echo "Step 1/4: Login to Cloudflare"
  npx wrangler login
fi

echo
echo "Step 2/4: Configure required secrets"
for secret_name in "${required_secrets[@]}"; do
  while true; do
    read -r -s -p "${secret_name}: " secret_value
    echo
    if [[ -z "${secret_value}" ]]; then
      echo "Value cannot be empty. Please re-enter ${secret_name}."
      continue
    fi

    args=(wrangler secret put "${secret_name}" --name "${WORKER_NAME}")
    if [[ -n "${ENVIRONMENT_NAME}" ]]; then
      args+=(--env "${ENVIRONMENT_NAME}")
    fi

    printf '%s' "${secret_value}" | npx "${args[@]}"
    unset secret_value
    break
  done
done

echo
echo "Step 3/4: Validate project"
npm run typecheck
npm run build

if [[ "${SKIP_DEPLOY}" != "true" ]]; then
  echo
  echo "Step 4/4: Deploy worker"
  npm run deploy
fi

echo
echo "=== Post-deploy cron endpoint test command ==="
echo 'curl -H "Authorization: Bearer <CRON_SECRET>" https://tdone-erp.com/api/cron/cleanup-cancelled-leave-files'

echo
echo "Done."
