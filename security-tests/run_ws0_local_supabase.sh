#!/usr/bin/env bash
set -Eeuo pipefail

ARTIFACT_DIR="${ARTIFACT_DIR:-artifacts/ws0}"
mkdir -p "$ARTIFACT_DIR"
MIGRATION_DIR="supabase/migrations"
TEMP_MIGRATIONS="${RUNNER_TEMP:-/tmp}/ws0-migrations"
mkdir -p "$TEMP_MIGRATIONS"

WS0_MIGRATIONS=(
  "20261019100000_ws0_approval_core.sql"
  "20261019100100_ws0_approval_security.sql"
  "20261019100200_ws0_audit_core.sql"
  "20261019100300_ws0_audit_triggers.sql"
  "20261019100400_ws0_status_history.sql"
  "20261019100500_ws0_number_series.sql"
)

restore_ws0_migrations() {
  local name
  for name in "${WS0_MIGRATIONS[@]}"; do
    if [[ -f "$TEMP_MIGRATIONS/$name" ]]; then
      cp "$TEMP_MIGRATIONS/$name" "$MIGRATION_DIR/$name"
    fi
  done
}
trap restore_ws0_migrations EXIT

echo "phase=supabase_start" > "$ARTIFACT_DIR/summary.txt"
set +e
supabase start -x studio,imgproxy,edge-runtime,logflare,vector,supavisor > "$ARTIFACT_DIR/supabase-start.log" 2>&1
start_rc=$?
set -e
if [[ $start_rc -ne 0 ]]; then
  printf 'supabase_start=failed exit_code=%s\n' "$start_rc" >> "$ARTIFACT_DIR/summary.txt"
  docker ps -a > "$ARTIFACT_DIR/docker-containers.txt" 2>&1 || true
  exit 10
fi
printf 'supabase_start=passed\n' >> "$ARTIFACT_DIR/summary.txt"

# The local DB URL is derived only from local CLI status; no hosted project is linked or accessed.
set +e
eval "$(supabase status -o env 2> "$ARTIFACT_DIR/supabase-status.stderr")"
status_rc=$?
set -e
if [[ $status_rc -ne 0 || -z "${DB_URL:-}" ]]; then
  echo "local_db_url=unavailable" >> "$ARTIFACT_DIR/summary.txt"
  cat "$ARTIFACT_DIR/supabase-status.stderr" >> "$ARTIFACT_DIR/summary.txt" || true
  exit 11
fi
if [[ -n "${GITHUB_ENV:-}" ]]; then
  echo "WS0_DB_URL=$DB_URL" >> "$GITHUB_ENV"
fi

# Phase 1: replay the untouched authoritative baseline without the six WS0 files.
for name in "${WS0_MIGRATIONS[@]}"; do
  cp "$MIGRATION_DIR/$name" "$TEMP_MIGRATIONS/$name"
  rm "$MIGRATION_DIR/$name"
done
echo "phase=baseline_replay" >> "$ARTIFACT_DIR/summary.txt"
set +e
supabase db reset --local --no-seed > "$ARTIFACT_DIR/baseline-replay.log" 2>&1
baseline_rc=$?
set -e
restore_ws0_migrations
if [[ $baseline_rc -ne 0 ]]; then
  printf 'baseline_replay=failed exit_code=%s\n' "$baseline_rc" >> "$ARTIFACT_DIR/summary.txt"
  docker ps -a > "$ARTIFACT_DIR/docker-containers.txt" 2>&1 || true
  exit 20
fi
baseline_count="$(psql "$DB_URL" -X -qAt -v ON_ERROR_STOP=1 -c 'select count(*) from supabase_migrations.schema_migrations')"
printf 'baseline_replay=passed migration_count=%s\n' "$baseline_count" >> "$ARTIFACT_DIR/summary.txt"
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -c 'select version from supabase_migrations.schema_migrations order by version' > "$ARTIFACT_DIR/migration-ledger-baseline.txt"
pg_dump "$DB_URL" --schema-only --no-owner --no-privileges --schema=public > "$ARTIFACT_DIR/schema-baseline.sql"

# Phase 2: apply only the six new WS0 migrations after the baseline has passed.
echo "phase=ws0_apply" >> "$ARTIFACT_DIR/summary.txt"
set +e
supabase migration up --local > "$ARTIFACT_DIR/ws0-apply.log" 2>&1
ws0_rc=$?
set -e
if [[ $ws0_rc -ne 0 ]]; then
  printf 'ws0_apply=failed exit_code=%s\n' "$ws0_rc" >> "$ARTIFACT_DIR/summary.txt"
  pg_dump "$DB_URL" --schema-only --no-owner --no-privileges --schema=public > "$ARTIFACT_DIR/schema-after-ws0-failure.sql" 2> "$ARTIFACT_DIR/schema-after-ws0-failure.stderr" || true
  exit 30
fi
ws0_count="$(psql "$DB_URL" -X -qAt -v ON_ERROR_STOP=1 -c 'select count(*) from supabase_migrations.schema_migrations')"
printf 'ws0_apply=passed migration_count=%s\n' "$ws0_count" >> "$ARTIFACT_DIR/summary.txt"
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -c 'select version from supabase_migrations.schema_migrations order by version' > "$ARTIFACT_DIR/migration-ledger-after.txt"
pg_dump "$DB_URL" --schema-only --no-owner --no-privileges --schema=public > "$ARTIFACT_DIR/schema-after.sql"
diff -u "$ARTIFACT_DIR/schema-baseline.sql" "$ARTIFACT_DIR/schema-after.sql" > "$ARTIFACT_DIR/schema-diff.diff" || true

# Phase 3: SQL authorization/audit/status-history assertions, then concurrent numbering.
echo "phase=sql_assertions" >> "$ARTIFACT_DIR/summary.txt"
set +e
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f supabase/tests/ws0_foundation_assertions.sql > "$ARTIFACT_DIR/ws0-sql-tests.log" 2>&1
sql_rc=$?
set -e
if [[ $sql_rc -ne 0 ]]; then
  printf 'ws0_sql_tests=failed exit_code=%s\n' "$sql_rc" >> "$ARTIFACT_DIR/summary.txt"
  exit 40
fi
printf 'ws0_sql_tests=passed\n' >> "$ARTIFACT_DIR/summary.txt"

echo "phase=concurrent_numbering" >> "$ARTIFACT_DIR/summary.txt"
set +e
WS0_DB_URL="$DB_URL" WS0_TEST_USER="10000000-0000-4000-8000-000000000002" \
  python security-tests/ws0_number_series_concurrency.py > "$ARTIFACT_DIR/ws0-concurrency.log" 2>&1
concurrency_rc=$?
set -e
if [[ $concurrency_rc -ne 0 ]]; then
  printf 'ws0_concurrency=failed exit_code=%s\n' "$concurrency_rc" >> "$ARTIFACT_DIR/summary.txt"
  exit 50
fi
printf 'ws0_concurrency=passed\n' >> "$ARTIFACT_DIR/summary.txt"
echo "overall=passed" >> "$ARTIFACT_DIR/summary.txt"
