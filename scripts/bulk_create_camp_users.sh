#!/usr/bin/env bash
#
# Bulk-create Supabase user accounts for summer camp students.
#
# Usage:
#   ./scripts/bulk_create_camp_users.sh <emails.txt> [output.csv]
#
# Reads VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env.local.
# For each email in <emails.txt> (one per line, blank/# lines ignored),
# creates a confirmed Supabase user with a random 10-char alphanumeric
# password and user_metadata.access_level = "camps". Writes email,password
# pairs to [output.csv] (default: camp_users.csv).

set -u
set -o pipefail

usage() {
  echo "Usage: $0 <emails.txt> [output.csv]" >&2
  exit 64
}

[ $# -ge 1 ] || usage
INPUT_FILE="$1"
OUTPUT_FILE="${2:-camp_users.csv}"

if [ ! -f "$INPUT_FILE" ]; then
  echo "Error: input file not found: $INPUT_FILE" >&2
  exit 66
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
  LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 10
}

# Write CSV header (overwrites any existing file).
echo "email,password" >"$OUTPUT_FILE"

created=0
failed=0

while IFS= read -r raw_line || [ -n "$raw_line" ]; do
  # Trim leading/trailing whitespace and CR.
  email="${raw_line%$'\r'}"
  email="${email#"${email%%[![:space:]]*}"}"
  email="${email%"${email##*[![:space:]]}"}"

  # Skip blanks and comments.
  [ -z "$email" ] && continue
  case "$email" in \#*) continue ;; esac

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
  else
    user_id=$(printf '%s' "$response" | grep -o '"id"[[:space:]]*:[[:space:]]*"[^"]*"' | head -n1 | sed 's/.*"\([^"]*\)"$/\1/')
    err_msg=$(printf '%s' "$response" | grep -o '"msg"[[:space:]]*:[[:space:]]*"[^"]*"' | head -n1 | sed 's/.*"\([^"]*\)"$/\1/')
  fi

  if [ -n "$user_id" ]; then
    printf '%s,%s\n' "$email" "$password" >>"$OUTPUT_FILE"
    echo "created: $email"
    created=$((created + 1))
  else
    if [ -z "$err_msg" ]; then
      err_msg="$response"
    fi
    echo "failed:  $email — $err_msg" >&2
    failed=$((failed + 1))
  fi
done <"$INPUT_FILE"

echo
echo "Done. Created: $created  Failed: $failed"
echo "CSV written to: $OUTPUT_FILE"
