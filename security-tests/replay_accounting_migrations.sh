#!/usr/bin/env bash
set -Eeuo pipefail

ARTIFACT_DIR="${ARTIFACT_DIR:-artifacts/accounting-replay}"
mkdir -p "$ARTIFACT_DIR"
START_LOG="$ARTIFACT_DIR/supabase-start.log"
RESET_LOG="$ARTIFACT_DIR/migration-reset.log"

finish() {
  local rc=$?
  printf 'exit_code=%s\n' "$rc" >> "$ARTIFACT_DIR/summary.txt"
  docker ps -a > "$ARTIFACT_DIR/docker-containers.txt" 2>&1 || true
}
trap finish EXIT

echo "phase=supabase_start" > "$ARTIFACT_DIR/summary.txt"
set +e
supabase start -x studio,imgproxy,edge-runtime,logflare,vector,supavisor > "$START_LOG" 2>&1
start_rc=$?
set -e
if [[ "$start_rc" -ne 0 ]]; then
  echo "supabase_start=failed exit_code=$start_rc" >> "$ARTIFACT_DIR/summary.txt"
  grep -E 'Applying migration .*\\.sql|ERROR:|SQLSTATE|At statement:|Try rerunning' "$START_LOG" | tail -25 >> "$ARTIFACT_DIR/summary.txt" || true
  exit 10
fi
echo "supabase_start=passed" >> "$ARTIFACT_DIR/summary.txt"

# Only the local CLI status is evaluated. No project-link or hosted DB command
# is used in this workflow.
set +e
eval "$(supabase status -o env 2> "$ARTIFACT_DIR/supabase-status.stderr")"
status_rc=$?
set -e
if [[ "$status_rc" -ne 0 || -z "${DB_URL:-}" ]]; then
  echo "local_db_url=unavailable" >> "$ARTIFACT_DIR/summary.txt"
  cat "$ARTIFACT_DIR/supabase-status.stderr" >> "$ARTIFACT_DIR/summary.txt" || true
  exit 11
fi

echo "phase=clean_migration_replay" >> "$ARTIFACT_DIR/summary.txt"
set +e
supabase db reset --local --no-seed > "$RESET_LOG" 2>&1
reset_rc=$?
set -e
if [[ "$reset_rc" -ne 0 ]]; then
  echo "clean_migration_replay=failed exit_code=$reset_rc" >> "$ARTIFACT_DIR/summary.txt"
  grep -E 'Applying migration .*\\.sql|ERROR:|SQLSTATE|At statement:|Try rerunning' "$RESET_LOG" | tail -30 >> "$ARTIFACT_DIR/summary.txt" || true
  psql "$DB_URL" -X -v ON_ERROR_STOP=1 -c 'select version from supabase_migrations.schema_migrations order by version' > "$ARTIFACT_DIR/migration-ledger-partial.txt" 2>&1 || true
  # The disposable Supabase DB currently runs PostgreSQL 17 while the
  # Ubuntu runner's default pg_dump is 16. Use the matching client bundled in
  # the DB container; never let a client/server version mismatch mask the
  # migration failure we are trying to capture.
  DB_CONTAINER="$(docker ps --filter 'name=supabase_db_' --format '{{.Names}}' | head -n 1)"
  if [[ -n "$DB_CONTAINER" ]]; then
    docker exec "$DB_CONTAINER" pg_dump -U postgres --schema-only --no-owner --no-privileges --schema=public > "$ARTIFACT_DIR/schema-partial.sql" 2> "$ARTIFACT_DIR/schema-partial.stderr" || true
  else
    echo "matching_pg_dump=unavailable" > "$ARTIFACT_DIR/schema-partial.stderr"
  fi
  exit 20
fi
echo "clean_migration_replay=passed" >> "$ARTIFACT_DIR/summary.txt"

psql "$DB_URL" -X -v ON_ERROR_STOP=1 -c 'select version from supabase_migrations.schema_migrations order by version' > "$ARTIFACT_DIR/migration-ledger.txt"
# Use the PostgreSQL client shipped with the disposable DB container so its
# pg_dump major version always matches the server's major version.
DB_CONTAINER="$(docker ps --filter 'name=supabase_db_' --format '{{.Names}}' | head -n 1)"
if [[ -z "$DB_CONTAINER" ]]; then
  echo "matching_pg_dump=unavailable" >> "$ARTIFACT_DIR/summary.txt"
  exit 12
fi
docker exec "$DB_CONTAINER" pg_dump -U postgres --schema-only --no-owner --no-privileges --schema=public > "$ARTIFACT_DIR/schema.sql"
echo "phase=accounting_security_integrity" >> "$ARTIFACT_DIR/summary.txt"
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f security-tests/accounting_migration_integrity.sql > "$ARTIFACT_DIR/accounting-integrity.log" 2>&1
echo "accounting_security_integrity=passed" >> "$ARTIFACT_DIR/summary.txt"
echo "overall=passed" >> "$ARTIFACT_DIR/summary.txt"
