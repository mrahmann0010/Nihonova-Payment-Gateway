#!/usr/bin/env bash
#
# Refresh the local Docker MongoDB with a copy of the real Atlas data.
#
#   cd apps/server && npm run db:copy
#
# Direction is hardcoded and one-way: Atlas is read, local is written. There is
# no argument that can point the *destination* at a remote cluster, because the
# destination is the compose service `mongo` and nothing else. A flag that could
# reverse this would eventually be typed by mistake, and the mistake would be
# overwriting production payment records.
#
# The source URI is read from .env.atlas — the retired production env file,
# which is gitignored. It is passed to the container as an environment variable
# and never appears in a command line, so it stays out of `ps` and shell history.
#
# Nothing is written to disk: mongodump streams an archive straight into
# mongorestore over a pipe, so there is no dump directory holding a plaintext
# copy of real payment data for someone to find later.

set -euo pipefail

cd "$(dirname "$0")/.."           # apps/server
REPO_ROOT="$(cd ../.. && pwd)"

SRC_ENV="${SRC_ENV:-.env.atlas}"

if [[ ! -f "$SRC_ENV" ]]; then
  echo "error: $SRC_ENV not found." >&2
  echo "       It holds the Atlas connection string and is gitignored, so it" >&2
  echo "       does not arrive with a clone. Copy .env.atlas.example and fill" >&2
  echo "       in MONGO_URI from the Atlas dashboard." >&2
  exit 1
fi

# Read MONGO_URI out of the env file without sourcing it — sourcing would run
# whatever else the file contains, and would also export the real WEBHOOK_SECRET
# and ADMIN_TOKEN into this shell for no reason.
SRC_URI="$(grep -E '^[[:space:]]*MONGO_URI=' "$SRC_ENV" | tail -n1 | cut -d= -f2- | sed -e 's/^["'\'']//' -e 's/["'\'']$//')"

if [[ -z "$SRC_URI" ]]; then
  echo "error: no MONGO_URI found in $SRC_ENV" >&2
  exit 1
fi

# Guard against the file having already been pointed at something local: a copy
# from local to local would silently wipe the local data with itself.
if [[ "$SRC_URI" == *"127.0.0.1"* || "$SRC_URI" == *"localhost"* || "$SRC_URI" == *"@mongo"* || "$SRC_URI" == *"//mongo:"* ]]; then
  echo "error: MONGO_URI in $SRC_ENV points at a local database." >&2
  echo "       That file is meant to hold the REAL Atlas connection string." >&2
  exit 1
fi

# The database name is the URI's path segment, minus any ?query.
DB_NAME="$(printf '%s' "$SRC_URI" | sed -E 's|^[^/]+//[^/]+/?||' | cut -d'?' -f1)"
DB_NAME="${DB_NAME:-primary-data}"

echo "  source : Atlas — database '$DB_NAME'"
echo "  target : local Docker mongo (127.0.0.1:27017), same database name"
echo "  note   : the local '$DB_NAME' is DROPPED and replaced."
echo

if [[ -z "${DB_COPY_YES:-}" && -t 0 ]]; then
  read -r -p "Replace the local database with a fresh copy? [y/N] " reply
  [[ "$reply" == [yY] ]] || { echo "aborted."; exit 1; }
fi

cd "$REPO_ROOT"

if ! docker compose ps --status running --services 2>/dev/null | grep -qx mongo; then
  echo "error: the local mongo container is not running. Start it with:" >&2
  echo "       docker compose up -d" >&2
  exit 1
fi

echo "copying…"

# Runs inside the compose network, so the destination resolves as the service
# hostname `mongo` — a name that only exists inside that network and cannot
# accidentally address anything on the internet.
#
# --nsInclude limits the stream to this one database. --drop replaces each
# collection as it is restored rather than merging into whatever is there, so a
# document deleted upstream does not survive locally as a ghost.
docker compose run --rm --no-deps -T \
  --entrypoint bash \
  -e SRC_URI="$SRC_URI" \
  -e DB_NAME="$DB_NAME" \
  mongo -c '
    set -euo pipefail
    mongodump --uri="$SRC_URI" --db="$DB_NAME" --archive --quiet \
      | mongorestore --uri="mongodb://mongo:27017" --archive --drop \
          --nsInclude="$DB_NAME.*" --quiet
  '

echo
echo "done. Local database '$DB_NAME' now mirrors Atlas as of $(date '+%Y-%m-%d %H:%M')."
