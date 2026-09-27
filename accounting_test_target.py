#!/usr/bin/env python3
"""Fail-closed connection guard for managed accounting test databases."""

import os
import re
import subprocess
from dataclasses import dataclass
from urllib.parse import parse_qs, unquote, urlparse


PRODUCTION_PROJECT_REF = "ysaocrumxikgywdotkne"


def clean_psql_environment() -> dict[str, str]:
    """Never allow libpq to inherit another connection or session setting."""
    return {
        key: value for key, value in os.environ.items()
        if not key.startswith(("PG", "SUPABASE_", "VITE_SUPABASE_"))
        and key not in {"DATABASE_URL", "TEST_DATABASE_URL"}
    }


@dataclass(frozen=True)
class ManagedTestTarget:
    url: str
    project_ref: str
    database: str
    host: str


def load_managed_test_target(phase_flag: str) -> ManagedTestTarget:
    if os.environ.get(phase_flag) != "managed-test-only":
        raise SystemExit(f"REFUSED: set {phase_flag}=managed-test-only")

    url = os.environ.get("MANAGED_TEST_DATABASE_URL", "").strip()
    expected_ref = os.environ.get("EXPECTED_TEST_PROJECT_REF", "").strip()
    expected_database = os.environ.get("EXPECTED_TEST_DATABASE", "").strip()
    if not url or not expected_ref or not expected_database:
        raise SystemExit(
            "BLOCKED: MANAGED_TEST_DATABASE_URL, EXPECTED_TEST_PROJECT_REF, and "
            "EXPECTED_TEST_DATABASE must be set explicitly"
        )
    if os.environ.get("TEST_DATABASE_URL"):
        raise SystemExit("REFUSED: TEST_DATABASE_URL is not accepted for managed validation")
    if not re.fullmatch(r"[a-z]{20}", expected_ref):
        raise SystemExit("REFUSED: expected TEST project reference has an invalid format")
    if expected_ref == PRODUCTION_PROJECT_REF:
        raise SystemExit("REFUSED: expected TEST project is the production project")

    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    database = unquote(parsed.path.lstrip("/"))
    sslmode = parse_qs(parsed.query).get("sslmode", [""])[0]
    if parsed.scheme not in {"postgres", "postgresql"}:
        raise SystemExit("REFUSED: managed TEST URL must use PostgreSQL")
    if not host or host in {"localhost", "127.0.0.1", "::1"}:
        raise SystemExit("REFUSED: local databases are not managed TEST projects")
    if host != f"db.{expected_ref}.supabase.co":
        raise SystemExit("REFUSED: direct managed TEST host must exactly match expected project")
    if parsed.username != "postgres":
        raise SystemExit("REFUSED: direct managed TEST connection must use the postgres database user")
    if sslmode not in {"require", "verify-ca", "verify-full"}:
        raise SystemExit("REFUSED: managed TEST URL must require TLS with sslmode=require or stronger")
    if database != expected_database:
        raise SystemExit("REFUSED: URL database does not match EXPECTED_TEST_DATABASE")

    return ManagedTestTarget(url=url, project_ref=expected_ref, database=database, host=host)


def verify_and_display_identity(target: ManagedTestTarget) -> None:
    print("TARGET_ENVIRONMENT\tMANAGED_TEST")
    print(f"TARGET_PROJECT_REF_CONFIGURED\t{target.project_ref}")
    print(f"TARGET_HOST_CONFIGURED\t{target.host}")
    print(f"TARGET_DATABASE_CONFIGURED\t{target.database}")
    print("TARGET_IDENTITY_PROBE\tSTARTING_READ_ONLY")
    identity_sql = (
        "SELECT current_database(), current_user, "
        "COALESCE(inet_server_addr()::text,''), inet_server_port()"
    )
    try:
        completed = subprocess.run(
            ["psql", target.url, "-q", "-v", "ON_ERROR_STOP=1", "-At", "-F", "\t", "-c", identity_sql],
            text=True, capture_output=True, check=True, env=clean_psql_environment(),
        )
    except subprocess.CalledProcessError:
        raise SystemExit("REFUSED: managed TEST identity probe failed; no migration or fixture SQL executed") from None
    rows = [line for line in completed.stdout.splitlines() if line.strip()]
    if len(rows) != 1:
        raise SystemExit("REFUSED: could not resolve one TEST database identity")
    database, user, address, port = rows[0].split("\t")
    if database != target.database:
        raise SystemExit("REFUSED: resolved database identity does not match the explicit TEST database")

    print(f"TARGET_PROJECT_REF_VERIFIED\t{target.project_ref}")
    print(f"TARGET_DATABASE_VERIFIED\t{database}")
    print(f"TARGET_SERVER_VERIFIED\t{address}:{port}")
    print(f"TARGET_USER_VERIFIED\t{user}")
    print("TARGET_IDENTITY_VERIFIED\tPASS")