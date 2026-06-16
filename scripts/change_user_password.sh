#!/usr/bin/env bash
#
# Change the password of an existing Supabase user account.
#
# Usage:
#   ./scripts/change_user_password.sh <email> <new-password>
#
# Reads VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env.local.
# Looks up the user by email, then sets the given password. The user's
# email remains confirmed.

set -u
set -o pipefail

usage() {
  echo "Usage: $0 <email> <new-password>" >&2
  exit 64
}

[ $# -eq 2 ] || usage
EMAIL="$1"
NEW_PASSWORD="$2"

[ -n "$EMAIL" ] || usage
[ -n "$NEW_PASSWORD" ] || usage

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

# We use python3 (already part of this project's stack) instead of jq to parse
# JSON responses and build the request body safely.
PY=python3
if ! command -v "$PY" >/dev/null 2>&1; then
  echo "Error: python3 is required but not found." >&2
  exit 69
fi

# Find the user by email. The admin list endpoint supports a free-text filter;
# curl --data-urlencode handles URL-encoding the email for us.
lookup=$(curl -sS -G "$VITE_SUPABASE_URL/auth/v1/admin/users" \
  --data-urlencode "filter=$EMAIL" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY")

# Extract the id of the user whose email matches exactly (case-insensitive).
# Prints "ERR:<message>" if the response was an API error object.
user_id=$(printf '%s' "$lookup" | EMAIL="$EMAIL" "$PY" -c '
import json, os, sys
email = os.environ["EMAIL"].lower()
try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(0)
if isinstance(data, dict) and "users" not in data:
    msg = data.get("msg") or data.get("error_description") or data.get("error")
    if msg:
        print("ERR:" + str(msg))
        sys.exit(0)
users = data.get("users", []) if isinstance(data, dict) else data
for u in users:
    if str(u.get("email", "")).lower() == email:
        print(u.get("id", ""))
        break
')

case "$user_id" in
  ERR:*)
    echo "Error looking up user: ${user_id#ERR:}" >&2
    exit 1
    ;;
esac

if [ -z "$user_id" ]; then
  echo "Error: no user found with email: $EMAIL" >&2
  exit 1
fi

# Build the JSON body safely (handles quotes, backslashes, etc. in the password).
body=$(NEW_PASSWORD="$NEW_PASSWORD" "$PY" -c '
import json, os
print(json.dumps({"password": os.environ["NEW_PASSWORD"]}))
')

response=$(curl -sS -X PUT "$VITE_SUPABASE_URL/auth/v1/admin/users/$user_id" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  --data "$body")

# Did the update succeed? Print the id on success, else the error message.
result=$(printf '%s' "$response" | "$PY" -c '
import json, sys
try:
    data = json.load(sys.stdin)
except Exception:
    print("ERR:unparseable response")
    sys.exit(0)
if isinstance(data, dict) and data.get("id"):
    print("OK:" + data["id"])
else:
    msg = data.get("msg") or data.get("error_description") or data.get("error") if isinstance(data, dict) else None
    print("ERR:" + (str(msg) if msg else "unknown error"))
')

case "$result" in
  OK:*)
    echo "Password updated for: $EMAIL"
    ;;
  *)
    echo "Failed to update password for $EMAIL — ${result#ERR:}" >&2
    exit 1
    ;;
esac
