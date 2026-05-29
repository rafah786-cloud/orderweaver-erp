## Biometric Attendance Integration — Implementation Plan

Adds real-time LAN biometric sync (Identix / ZKTeco-protocol device on TCP 4370), a public ingestion API, live feed UI, device settings, and attendance/payroll auto-calculation rules.

---

### 1. Local Sync Service (new folder `biometric-sync/`)

A standalone Node.js service the user runs on a PC inside the office LAN.

- `biometric-sync/package.json` — deps: `node-zklib` (Identix uses the ZKTeco protocol on port 4370), `axios`, `dotenv`, `better-sqlite3` (local queue).
- `biometric-sync/index.js`:
  - Reads `.env`: `DEVICE_IP`, `DEVICE_PORT=4370`, `ERP_URL`, `DEVICE_API_KEY`, `DEVICE_ID`, `POLL_INTERVAL_MS=5000`.
  - Connects via `node-zklib`, enables real-time event listener for punch events.
  - On punch → POST `{ employee_code, punch_type, punch_time, device_id }` to `/api/public/biometric/punch` with header `x-device-key`.
  - On network/device failure → enqueue to `queue.db` (SQLite); background worker drains queue every interval when connection restored.
  - Falls back to polling `getAttendances()` when real-time events aren't supported, deduping via last-synced timestamp.
- `biometric-sync/README.md` — install + run instructions for office IT.

### 2. Database (single migration)

- `device_settings` table: `id`, `device_id` (unique), `name`, `ip_address`, `port`, `poll_interval_ms`, `api_key_hash`, `last_seen_at`, `is_active`.
- `shift_settings` table (singleton row): `shift_start`, `shift_end`, `late_grace_minutes`, `half_day_hours`, `late_deduction_pct`, `half_day_deduction_pct`, `working_days_per_month`.
- `punch_events` table: `id`, `employee_id`, `employee_code`, `device_id`, `punch_type` (IN/OUT), `punch_time`, `raw_payload`, `created_at`. Realtime enabled.
- Extend `attendance`: ensure `first_in`, `last_out`, `is_late`, `is_early_exit`, `is_half_day` columns exist (add via ALTER).
- Trigger `on_punch_event_insert`: upsert `attendance` row for `(employee_id, date(punch_time))`, set first_in/last_out, recompute flags & hours; mark `half_day` if only one punch by EOD (cron — see step 5).
- RLS + GRANTs: admin/hr write, all employees read own; service_role full.
- `ALTER PUBLICATION supabase_realtime ADD TABLE punch_events;`

### 3. Public Ingestion Endpoint

- `src/routes/api/public/biometric/punch.ts` — POST handler:
  - Validate `x-device-key` against `device_settings.api_key_hash` (bcrypt compare via `supabaseAdmin`).
  - Zod-validate body, look up employee by `employee_code`, insert `punch_events` row (trigger handles attendance).
  - Update `device_settings.last_seen_at`.
  - Returns 200 `{ok:true}` or 401/404.

### 4. ERP UI

- `src/routes/_app.attendance.tsx` — full build:
  - **Live Feed panel**: subscribes to `punch_events` realtime channel, shows last 10 (employee name, time, IN green / OUT red badge).
  - **Daily register table**: date picker → employees × status (Present / Absent / Half Day / Late / Early Exit) with computed hours.
  - Manual entry dialog (admin/hr) retained.
- `src/routes/_app.settings.tsx` (new) — admin only:
  - Device config CRUD (IP, port, poll interval, regenerate API key — shown once).
  - Shift settings form (start/end/grace/deduction rules).
- `src/routes/_app.payslips.tsx` — generate-month action:
  - Server fn computes: `present_days`, `absent_days`, `late_count`, `half_day_count` from attendance.
  - Net = `(present_days / working_days_per_month) × monthly_ctc` − late/half-day deductions per shift_settings — write to `payslips`.

### 5. Cron / End-of-day pass

- pg_cron job at 23:55 IST: mark any attendance row with only one punch as `half_day`, mark employees with no punches as `absent` (skipping weekends per shift_settings).

### 6. Sidebar

- Add "Settings" link (admin only) to `AppSidebar.tsx`.

---

### Technical notes
- Identix devices in India almost universally speak the ZKTeco TCP protocol on 4370 — `node-zklib` covers both real-time push (`getRealTimeLogs`) and polling fallback (`getAttendances`).
- Device authenticates to ERP via shared API key (stored hashed) — no Supabase JWT needed since service is headless.
- Realtime feed uses existing Supabase realtime — no extra infra.
- All calculations server-side (server fns) so RLS-protected; UI just renders.

Approve and I'll implement.
