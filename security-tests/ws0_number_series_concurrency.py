#!/usr/bin/env python3
"""Concurrent uniqueness test for the additive WS0 number allocator.

Requires psql and WS0_DB_URL pointing at the disposable local Supabase database.
Uses only the synthetic requester fixture created by ws0_foundation_assertions.sql.
"""
import concurrent.futures
import os
import re
import subprocess
import sys

DB_URL = os.environ.get("WS0_DB_URL")
USER_ID = os.environ.get("WS0_TEST_USER", "10000000-0000-4000-8000-000000000002")
WORKERS = int(os.environ.get("WS0_NUMBER_WORKERS", "40"))
if not DB_URL:
    raise SystemExit("WS0_DB_URL is required; refusing to guess a database target")
if WORKERS < 2 or WORKERS > 200:
    raise SystemExit("WS0_NUMBER_WORKERS must be between 2 and 200")

def allocate(index: int) -> str:
    claims = f'{{"sub":"{USER_ID}","role":"authenticated"}}'
    sql = (
        "SET ROLE authenticated; "
        f"SELECT set_config('request.jwt.claim.sub','{USER_ID}',false); "
        f"SELECT set_config('request.jwt.claims','{claims}',false); "
        "SELECT public.ws0_next_document_number("
        "(SELECT id FROM public.companies WHERE code='ABOOD'),"
        "NULL,'WS0TEST','2026-27');"
    )
    proc = subprocess.run(
        ["psql", DB_URL, "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-c", sql],
        text=True, capture_output=True, check=False,
    )
    if proc.returncode:
        raise RuntimeError(f"allocation {index} failed: {proc.stderr.strip()}")
    lines = [line.strip() for line in proc.stdout.splitlines() if line.strip()]
    if not lines:
        raise RuntimeError(f"allocation {index} returned no number")
    value = lines[-1]
    if not re.fullmatch(r"WS0TEST-[0-9]{6,}", value):
        raise RuntimeError(f"allocation {index} returned malformed value: {value!r}")
    return value

with concurrent.futures.ThreadPoolExecutor(max_workers=min(WORKERS, 40)) as pool:
    values = list(pool.map(allocate, range(WORKERS)))

duplicates = sorted({v for v in values if values.count(v) > 1})
if duplicates:
    print(f"FAIL: duplicate generated numbers: {duplicates}", file=sys.stderr)
    raise SystemExit(1)
if len(set(values)) != WORKERS:
    raise SystemExit(f"FAIL: expected {WORKERS} unique numbers, got {len(set(values))}")
print(f"PASS: {WORKERS} concurrent allocations produced {len(set(values))} unique numbers.")
print("Allocated values: " + ", ".join(sorted(values)))
