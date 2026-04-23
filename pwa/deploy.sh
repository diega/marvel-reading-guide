#!/usr/bin/env bash
# Deploy pwa/ to Cloudflare Pages.
#
# The GitHub Actions workflow in .github/workflows/deploy.yml runs this
# pipeline on every push to main. This script mirrors those steps so you can
# deploy manually from your laptop if you need to.
#
# Requires:
#   CLOUDFLARE_API_TOKEN  Account: Cloudflare Pages:Edit
#   CLOUDFLARE_ACCOUNT_ID
#   CF_PAGES_PROJECT      Pages project name to deploy into.
#
# Usage:
#   cd pwa/
#   npm run build
#   CLOUDFLARE_API_TOKEN=... \
#   CLOUDFLARE_ACCOUNT_ID=... \
#   CF_PAGES_PROJECT=marvel-reading-guide \
#     ./deploy.sh

set -euo pipefail

: "${CLOUDFLARE_API_TOKEN:?set CLOUDFLARE_API_TOKEN}"
: "${CLOUDFLARE_ACCOUNT_ID:?set CLOUDFLARE_ACCOUNT_ID}"
: "${CF_PAGES_PROJECT:?set CF_PAGES_PROJECT (e.g. marvel-reading-guide)}"

PROJECT="$CF_PAGES_PROJECT"
BRANCH="main"

if [ ! -d "dist" ]; then
  echo "dist/ missing — running npm run build"
  npm run build
fi

echo "→ ensuring Pages project '$PROJECT' exists"
status=$(curl -sS -o /tmp/pages-get.json -w "%{http_code}" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/$PROJECT")
if [ "$status" = "404" ]; then
  echo "  creating…"
  curl -sS -X POST \
    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
    -H "Content-Type: application/json" \
    --data "{\"name\":\"$PROJECT\",\"production_branch\":\"$BRANCH\"}" \
    "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects" | head -c 400
  echo
fi

echo "→ deploying dist/ via wrangler pages deploy"
npx wrangler pages deploy dist --project-name="$PROJECT" --branch="$BRANCH" --commit-dirty=true

echo
echo "Done. Expected URL: https://$PROJECT.pages.dev"
