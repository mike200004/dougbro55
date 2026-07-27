#!/usr/bin/env bash
# One-shot finisher: paste the two secrets I can't retrieve for you, and this
# wires them into Vercel (production + preview) and .env.local, then redeploys.
#
# Get the values first:
#   SUPABASE_SERVICE_ROLE_KEY -> https://supabase.com/dashboard/project/gflkkgzwvghgsbkkzfgs/settings/api-keys
#                                (the "service_role" secret; or create an sb_secret_ key)
#   STRIPE_SECRET_KEY         -> https://dashboard.stripe.com/test/apikeys  (Secret key, sk_test_...)
#
# Usage:
#   SUPABASE_SERVICE_ROLE_KEY='eyJ...'  STRIPE_SECRET_KEY='sk_test_...'  bash scripts/finish-go-live.sh
set -euo pipefail
cd "$(dirname "$0")/.."

: "${SUPABASE_SERVICE_ROLE_KEY:?set SUPABASE_SERVICE_ROLE_KEY=... before running}"
: "${STRIPE_SECRET_KEY:?set STRIPE_SECRET_KEY=... before running}"

vc() { npx -y vercel@latest "$@"; }

set_env() {
  local name="$1" val="$2"
  for envn in production preview; do
    vc env rm "$name" "$envn" -y >/dev/null 2>&1 || true
    printf '%s' "$val" | vc env add "$name" "$envn" >/dev/null 2>&1 && echo "  Vercel: set $name ($envn)"
  done
}

echo "1/3  Setting Vercel env vars..."
set_env SUPABASE_SERVICE_ROLE_KEY "$SUPABASE_SERVICE_ROLE_KEY"
set_env STRIPE_SECRET_KEY "$STRIPE_SECRET_KEY"

echo "2/3  Updating .env.local..."
# Replace the placeholders in-place (macOS/BSD sed).
sed -i '' "s|^SUPABASE_SERVICE_ROLE_KEY=.*|SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}|" .env.local
sed -i '' "s|^STRIPE_SECRET_KEY=.*|STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY}|" .env.local
echo "  .env.local updated"

echo "3/3  Redeploying production (env changes need a fresh build)..."
vc redeploy pheme.deals || vc --prod --yes

echo
echo "Done. Test: sign up at https://pheme.deals/signup, approve the account in Supabase"
echo "(account_members.status -> 'active'), then Settings -> Plan & billing -> choose a plan,"
echo "and pay with Stripe test card 4242 4242 4242 4242 (any future date / any CVC)."
