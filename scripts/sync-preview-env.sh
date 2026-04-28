#!/usr/bin/env bash
# Manually push Doppler stg config → Vercel Preview env.
#
# Why this exists: Doppler free tier allows 5 config syncs across the workspace.
# We use the prd → Production slot for auto-sync. Preview env vars are pushed
# manually from this script. Re-run after any Doppler stg secret change.
#
# Usage: just sync-preview-env  (or run this script directly)
# Prereq: doppler + vercel CLIs logged in; project linked at .vercel/project.json
#         (run `vercel link --yes --project last-person-standing --scope lennons301s-projects`
#          once if not yet linked).

set -euo pipefail

DOPPLER_PROJECT="last-person-standing"
DOPPLER_CONFIG="stg"
VERCEL_ENV="preview"

KEYS=(
  DATABASE_URL
  BETTER_AUTH_SECRET
  BETTER_AUTH_URL
  CRON_SECRET
  FOOTBALL_DATA_API_KEY
  QSTASH_TOKEN
  QSTASH_CURRENT_SIGNING_KEY
  QSTASH_NEXT_SIGNING_KEY
)

cd "$(dirname "$0")/.."

if [ ! -f .vercel/project.json ]; then
  echo "✗ Vercel project not linked. Run:"
  echo "    vercel link --yes --project last-person-standing --scope lennons301s-projects"
  exit 1
fi

echo "Pushing Doppler/$DOPPLER_CONFIG → Vercel/$VERCEL_ENV (project: $DOPPLER_PROJECT)"
echo ""

for k in "${KEYS[@]}"; do
  val=$(doppler secrets get "$k" --plain --project "$DOPPLER_PROJECT" --config "$DOPPLER_CONFIG" 2>/dev/null || true)
  if [ -z "$val" ]; then
    echo "  $k: skipping (empty in Doppler $DOPPLER_CONFIG)"
    continue
  fi
  # Remove any existing preview value (ignore errors when it doesn't exist)
  vercel env rm "$k" "$VERCEL_ENV" --yes >/dev/null 2>&1 || true
  # Push the new value via stdin (non-interactive)
  printf '%s' "$val" | vercel env add "$k" "$VERCEL_ENV" >/dev/null 2>&1
  echo "  $k: ✓"
done

echo ""
echo "Done. Re-trigger any open PR previews to pick up new values."
echo ""
echo "NOTE: BETTER_AUTH_URL is fixed in Doppler/stg (currently a placeholder)."
echo "      Per-PR preview URLs differ from this value, so auth flows may be"
echo "      inconsistent on previews. Builds + static rendering are fine."
