#!/usr/bin/env bash
#
# Bulk-create Supabase user accounts for summer camp students.
#
# Usage:
#   ./scripts/bulk_create_camp_users.sh <count> [output.csv]
#
# Reads VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env.local.
# Creates <count> confirmed Supabase users (count between 1 and 99) with:
#   - email    facelab.team##@gmail.com  (## zero-padded 01..count)
#   - password purdue###                 (### three random digits)
#   - user_metadata.access_level = "camps"
# Writes email,password pairs to [output.csv] (default: camp_users.csv).
#
# Accounts are expected to be deleted before re-running. If an account with
# one of the target emails already exists, the script errors out.

set -u
set -o pipefail

usage() {
  echo "Usage: $0 <count> [output.csv]" >&2
  exit 64
}

[ $# -ge 1 ] || usage
COUNT="$1"
OUTPUT_FILE="${2:-camp_users.csv}"

# Validate count: integer between 1 and 99.
case "$COUNT" in
  ''|*[!0-9]*)
    echo "Error: count must be a positive integer (got: $COUNT)" >&2
    exit 64
    ;;
esac
COUNT=$((10#$COUNT))
if [ "$COUNT" -lt 1 ] || [ "$COUNT" -gt 99 ]; then
  echo "Error: count must be between 1 and 99 (got: $COUNT)" >&2
  exit 64
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env.local"

if [ ! -f "$ENV_FILE" ]; then
  echo "Error: .env.local not found at $ENV_FILE" >&2
  exit 78
fi

# Parse .env.local without sourcing — values may contain commas, spaces, etc.
# that bash would try to evaluate. We extract only the two keys we need.
read_env_var() {
  local key="$1"
  local line value
  line=$(grep -E "^[[:space:]]*${key}=" "$ENV_FILE" | tail -n1) || true
  [ -z "$line" ] && return 0
  value="${line#*=}"
  # Strip surrounding single or double quotes if present.
  case "$value" in
    \"*\") value="${value#\"}"; value="${value%\"}" ;;
    \'*\') value="${value#\'}"; value="${value%\'}" ;;
  esac
  # Strip trailing CR (from CRLF files).
  value="${value%$'\r'}"
  printf '%s' "$value"
}

VITE_SUPABASE_URL=$(read_env_var VITE_SUPABASE_URL)
SUPABASE_SERVICE_ROLE_KEY=$(read_env_var SUPABASE_SERVICE_ROLE_KEY)

: "${VITE_SUPABASE_URL:?VITE_SUPABASE_URL not set in .env.local}"
: "${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY not set in .env.local (add it from Supabase dashboard -> Project Settings -> API)}"

HAS_JQ=0
if command -v jq >/dev/null 2>&1; then
  HAS_JQ=1
fi

gen_password() {
  # "purdue" followed by three random digits.
  printf 'purdue%03d' $((RANDOM % 1000))
}

# Write CSV header (overwrites any existing file).
echo "email,password" >"$OUTPUT_FILE"

created=0

for i in $(seq 1 "$COUNT"); do
  email=$(printf 'facelab.team%02d@gmail.com' "$i")
  password="$(gen_password)"

  body=$(printf '{"email":"%s","password":"%s","email_confirm":true,"user_metadata":{"access_level":"camps"}}' \
    "$email" "$password")

  response=$(curl -sS -X POST "$VITE_SUPABASE_URL/auth/v1/admin/users" \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Content-Type: application/json" \
    --data "$body")

  if [ "$HAS_JQ" -eq 1 ]; then
    user_id=$(printf '%s' "$response" | jq -r '.id // empty')
    err_msg=$(printf '%s' "$response" | jq -r '.msg // .error_description // .error // empty')
    err_code=$(printf '%s' "$response" | jq -r '.error_code // .code // empty')
  else
    user_id=$(printf '%s' "$response" | grep -o '"id"[[:space:]]*:[[:space:]]*"[^"]*"' | head -n1 | sed 's/.*"\([^"]*\)"$/\1/')
    err_msg=$(printf '%s' "$response" | grep -o '"msg"[[:space:]]*:[[:space:]]*"[^"]*"' | head -n1 | sed 's/.*"\([^"]*\)"$/\1/')
    err_code=""
  fi

  if [ -n "$user_id" ]; then
    printf '%s,%s\n' "$email" "$password" >>"$OUTPUT_FILE"
    echo "created: $email"
    created=$((created + 1))
  else
    if [ -z "$err_msg" ]; then
      err_msg="$response"
    fi
    # A pre-existing account is a hard error — the user must delete accounts first.
    case "$err_code$err_msg" in
      *email_exists*|*already*registered*|*already*been*registered*|*[Aa]lready*exists*|*[Dd]uplicate*)
        echo "Error: account already exists: $email" >&2
        echo "Delete existing facelab.team## accounts before re-running." >&2
        echo "(Created $created accounts before stopping; see $OUTPUT_FILE)" >&2
        exit 1
        ;;
    esac
    echo "Error: failed to create $email — $err_msg" >&2
    echo "(Created $created accounts before stopping; see $OUTPUT_FILE)" >&2
    exit 1
  fi
done

echo
echo "Done. Created: $created"
echo "CSV written to: $OUTPUT_FILE"
