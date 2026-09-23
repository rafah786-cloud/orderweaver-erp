# Executable database validation

This runner is fail-closed. It accepts only an explicit managed TEST project URL and matching expected identity, displays and verifies that identity before any mutating SQL, loads synthetic fixtures, applies `../001_accounting_foundation.sql` unchanged, and runs SQL/concurrency checks. Generic `TEST_DATABASE_URL`, local databases, the production project, and inherited preview/production connection variables are not accepted.

```text
MANAGED_TEST_DATABASE_URL='postgresql://...?sslmode=require' \
EXPECTED_TEST_PROJECT_REF='<test-project-ref>' \
EXPECTED_TEST_DATABASE='postgres' \
ALLOW_PHASE1_DATABASE_TESTS='managed-test-only' \
python3 accounting-phase1/tests/run_database_suite.py
```

`managed_security_checks.sql` verifies grants/direct-write denial after managed authentication is configured. `preflight.sql` is read-only and is intended for a safe copied dataset. `direct-write-audit.sh` inventories application call sites that still bypass the controlled RPC path.
