# Executable database validation

This runner is fail-closed. It requires `TEST_DATABASE_URL` and `ALLOW_PHASE1_DATABASE_TESTS=isolated-only`, refuses a URL containing the connected shared database host, loads synthetic fixtures, applies `../001_accounting_foundation.sql` unchanged, and runs SQL/concurrency checks.

```text
TEST_DATABASE_URL=postgresql://... ALLOW_PHASE1_DATABASE_TESTS=isolated-only python3 accounting-phase1/tests/run_database_suite.py
```

`managed_security_checks.sql` verifies grants/direct-write denial after managed authentication is configured. `preflight.sql` is read-only and is intended for a safe copied dataset. `direct-write-audit.sh` inventories application call sites that still bypass the controlled RPC path.
