# Mattress ERP Build Plan

A large multi-module app. I'll deliver it in phases so you can verify each layer before stacking the next.

## Tech & Foundation
- React + TanStack Start (existing template)
- Lovable Cloud (Supabase) for DB + Auth
- Clean professional UI: neutral palette, sidebar layout, data-dense tables, semantic tokens in `src/styles.css`
- Auth: email/password; signup creates a `pending` profile — admin must approve & assign role before login works

## Phase 1 — Foundation (this turn)
1. Enable Lovable Cloud
2. Database schema + RLS:
   - `profiles` (id, name, status: pending/approved/rejected)
   - `app_role` enum: admin, sales, production, hr, customer, employee
   - `user_roles` (separate table, security-definer `has_role()`)
   - `parties` (customers/vendors, outstanding_balance, oldest_unpaid_date)
   - `invoices` + `invoice_items`
   - `sales_orders` + `production_orders` (status enum)
   - `employees`, `pay_structures`, `attendance`, `payslips`
3. Auth pages: Login, Signup (pending approval screen), Reset password
4. Role-aware sidebar shell + dashboard route stubs
5. Admin "User Approvals" page (approve user + assign role)

## Phase 2 — Sales & Invoicing
- Party master CRUD
- Invoice create form with **block rule**:
  - Outstanding ≥ ₹1,50,000 → block
  - Outstanding ≥ ₹50,000 AND oldest unpaid > 90 days → block
  - Show blocking reason in dialog
- Invoice list, party outstanding view
- Server fn enforces the rule (not just client) so it can't be bypassed

## Phase 3 — Production
- Sales order → auto-create production order (DB trigger)
- Kanban + table view: Received → In Production → QC → Ready → Dispatched
- Sales staff: read-only live status of their own orders

## Phase 4 — HR & Attendance
- Employee master + pay structure (basic, DA, allowances, OT rate, daily wage)
- Daily attendance: manual entry + CSV import (configurable column mapping for biometric exports)
- Monthly payslip generation (auto-calc from attendance × pay structure)
- Employee self-service: own attendance + payslips

## Phase 5 — Admin Dashboard
- KPI cards: total outstanding, overdue >90d, orders in pipeline, today's attendance %
- Charts: production pipeline funnel, top 10 customers by sales (last 90 days)
- Recent activity feed

## Role Access Matrix (enforced via RLS + route guards)
| Role | Sees |
|---|---|
| Admin | Everything + approvals + dashboard |
| Sales | Parties, own invoices, own orders' production status |
| Production | Production module only |
| HR | Employees, attendance, payroll |
| Customer | Own orders + invoices |
| Employee | Own attendance + payslips |

## Notes
- This is ~4–5 turns of work. Phase 1 lands a working skeleton you can log into and approve users on. Each later phase is shippable independently.
- CSV biometric import: I'll default to common format (employee_id, date, in_time, out_time). Tell me your device's export format if different.
- Currency: ₹ (INR), date format dd/mm/yyyy.

Approve and I'll start with Phase 1.
