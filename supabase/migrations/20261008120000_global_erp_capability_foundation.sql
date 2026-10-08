-- Mattress Maestro ERP: enterprise capability foundation
-- Safe additive migration. Existing accounting, inventory and Tally posting paths remain authoritative.

create extension if not exists pgcrypto;

create table if not exists public.erp_domain_audit_log(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 module text not null, entity_type text not null, entity_id uuid, action text not null,
 before_data jsonb, after_data jsonb, reason text, actor_id uuid, created_at timestamptz not null default now()
);
create index if not exists idx_erp_audit_company_time on public.erp_domain_audit_log(company_id,created_at desc);

-- 1. MPS / MRP / capacity / routing
create table if not exists public.mps_plans(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 plan_number text not null, name text not null, horizon_start date not null, horizon_end date not null,
 status text not null default 'draft' check(status in('draft','approved','released','closed','cancelled')),
 planning_policy text not null default 'make_to_stock', notes text, created_by uuid, approved_by uuid,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(company_id,plan_number), check(horizon_end>=horizon_start)
);
create table if not exists public.mps_lines(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 plan_id uuid not null references public.mps_plans(id) on delete cascade, model_id uuid references public.product_models(id),
 period_start date not null, quantity numeric(18,4) not null check(quantity>=0),
 committed_quantity numeric(18,4) not null default 0, safety_stock numeric(18,4) not null default 0,
 demand_source text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.work_centers(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 code text not null, name text not null, department text, work_center_type text not null default 'machine',
 capacity_minutes_per_day numeric(18,2) not null default 0, efficiency_pct numeric(7,3) not null default 100,
 utilization_pct numeric(7,3) not null default 100, setup_minutes numeric(18,2) not null default 0,
 active boolean not null default true, notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(company_id,code), check(efficiency_pct>=0)
);
create table if not exists public.work_center_calendars(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 work_center_id uuid not null references public.work_centers(id) on delete cascade, work_date date not null,
 available_minutes numeric(18,2) not null default 0, planned_minutes numeric(18,2) not null default 0,
 actual_minutes numeric(18,2) not null default 0, reason text, unique(work_center_id,work_date)
);
create table if not exists public.routings(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 code text not null, name text not null, model_id uuid references public.product_models(id),
 revision text not null default '1', status text not null default 'draft' check(status in('draft','approved','obsolete')),
 effective_from date, effective_to date, notes text, created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(company_id,code,revision)
);
create table if not exists public.routing_operations(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 routing_id uuid not null references public.routings(id) on delete cascade, operation_no integer not null,
 operation_code text not null, name text not null, work_center_id uuid references public.work_centers(id),
 setup_minutes numeric(18,2) not null default 0, run_minutes_per_unit numeric(18,6) not null default 0,
 queue_minutes numeric(18,2) not null default 0, move_minutes numeric(18,2) not null default 0,
 scrap_pct numeric(7,4) not null default 0, mandatory_qc boolean not null default false, subcontracted boolean not null default false,
 unique(routing_id,operation_no)
);
create table if not exists public.routing_operation_dependencies(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 routing_id uuid not null references public.routings(id) on delete cascade, predecessor_operation_id uuid not null references public.routing_operations(id) on delete cascade,
 successor_operation_id uuid not null references public.routing_operations(id) on delete cascade, dependency_type text not null default 'finish_to_start',
 lag_minutes numeric(18,2) not null default 0, unique(predecessor_operation_id,successor_operation_id),
 check(predecessor_operation_id<>successor_operation_id)
);
create table if not exists public.mrp_runs(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 plan_id uuid references public.mps_plans(id), run_number text not null, run_at timestamptz not null default now(),
 horizon_start date not null, horizon_end date not null, status text not null default 'running' check(status in('running','completed','failed','cancelled')),
 planning_parameters jsonb not null default '{}'::jsonb, completed_at timestamptz, error_message text, created_by uuid,
 unique(company_id,run_number)
);
create table if not exists public.mrp_planned_orders(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 mrp_run_id uuid not null references public.mrp_runs(id) on delete cascade, stock_item_id uuid references public.stock_items(id),
 model_id uuid references public.product_models(id), order_type text not null check(order_type in('purchase','production','transfer')),
 due_date date not null, quantity numeric(18,4) not null check(quantity>0), firmed boolean not null default false,
 converted_source_type text, converted_source_id uuid, shortage_reason text, source_snapshot jsonb not null default '{}'::jsonb
);
create table if not exists public.mrp_exceptions(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 mrp_run_id uuid not null references public.mrp_runs(id) on delete cascade, severity text not null default 'warning' check(severity in('info','warning','critical')),
 exception_type text not null, stock_item_id uuid references public.stock_items(id), model_id uuid references public.product_models(id),
 due_date date, message text not null, recommended_action text, resolved boolean not null default false, resolved_by uuid, resolved_at timestamptz
);
create table if not exists public.production_operations(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 production_order_id uuid not null references public.production_orders(id) on delete cascade, routing_operation_id uuid references public.routing_operations(id),
 sequence_no integer not null, status text not null default 'pending' check(status in('pending','ready','running','paused','completed','blocked','cancelled')),
 planned_start timestamptz, planned_end timestamptz, actual_start timestamptz, actual_end timestamptz,
 planned_qty numeric(18,4) not null default 0, good_qty numeric(18,4) not null default 0, scrap_qty numeric(18,4) not null default 0,
 rework_qty numeric(18,4) not null default 0, setup_minutes numeric(18,2) not null default 0, run_minutes numeric(18,2) not null default 0,
 downtime_minutes numeric(18,2) not null default 0, operator_id uuid, notes text, unique(production_order_id,sequence_no)
);

-- 2. Quality / inspection / CAPA
create table if not exists public.quality_plans(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 code text not null, name text not null, model_id uuid references public.product_models(id), routing_operation_id uuid references public.routing_operations(id),
 revision text not null default '1', status text not null default 'draft' check(status in('draft','approved','obsolete')),
 sampling_method text not null default '100_percent', acceptance_rule jsonb not null default '{}'::jsonb, effective_from date, effective_to date,
 unique(company_id,code,revision)
);
create table if not exists public.quality_inspections(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 inspection_number text not null, quality_plan_id uuid references public.quality_plans(id), production_order_id uuid references public.production_orders(id),
 purchase_bill_id uuid references public.purchase_bills(id), stock_item_id uuid references public.stock_items(id), batch_id uuid references public.stock_batches(id),
 stage text not null, inspected_at timestamptz not null default now(), inspector_id uuid,
 quantity_inspected numeric(18,4) not null default 0, quantity_accepted numeric(18,4) not null default 0, quantity_rejected numeric(18,4) not null default 0,
 status text not null default 'open' check(status in('open','passed','failed','conditional','cancelled')), notes text, unique(company_id,inspection_number)
);
create table if not exists public.quality_results(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 inspection_id uuid not null references public.quality_inspections(id) on delete cascade, characteristic_code text not null, characteristic_name text not null,
 target_value numeric(18,6), lower_limit numeric(18,6), upper_limit numeric(18,6), measured_value numeric(18,6), unit text,
 result text not null default 'not_tested' check(result in('pass','fail','not_tested','na')), evidence jsonb not null default '{}'::jsonb
);
create table if not exists public.quality_nonconformances(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 nc_number text not null, inspection_id uuid references public.quality_inspections(id), production_order_id uuid references public.production_orders(id), supplier_id uuid references public.suppliers(id),
 severity text not null default 'minor' check(severity in('minor','major','critical')), defect_code text not null, description text not null,
 disposition text check(disposition in('use_as_is','rework','scrap','return_to_supplier','hold','concession')),
 status text not null default 'open' check(status in('open','investigating','dispositioned','closed')), root_cause text, containment_action text,
 created_at timestamptz not null default now(), closed_at timestamptz, unique(company_id,nc_number)
);
create table if not exists public.quality_capa_actions(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 nc_id uuid not null references public.quality_nonconformances(id) on delete cascade, action_type text not null check(action_type in('containment','corrective','preventive','verification')),
 action_text text not null, owner_id uuid, due_date date, status text not null default 'open' check(status in('open','in_progress','done','overdue','cancelled')),
 effectiveness_result text, completed_at timestamptz
);

-- 3. Maintenance / assets / downtime
create table if not exists public.maintenance_assets(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 asset_code text not null, asset_name text not null, asset_type text not null, serial_number text, manufacturer text, model_number text,
 work_center_id uuid references public.work_centers(id), acquisition_date date, acquisition_cost numeric(18,2) not null default 0,
 useful_life_months integer, criticality text not null default 'medium' check(criticality in('low','medium','high','critical')),
 status text not null default 'active' check(status in('active','inactive','under_maintenance','retired')),
 last_service_at timestamptz, next_service_at timestamptz, notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(company_id,asset_code)
);
create table if not exists public.maintenance_plans(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 asset_id uuid not null references public.maintenance_assets(id) on delete cascade, code text not null, name text not null,
 frequency_type text not null check(frequency_type in('calendar','meter','condition')), frequency_value numeric(18,4), frequency_unit text,
 next_due_at timestamptz, checklist jsonb not null default '[]'::jsonb, active boolean not null default true, unique(company_id,code)
);
create table if not exists public.maintenance_work_orders(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 work_order_number text not null, asset_id uuid not null references public.maintenance_assets(id), maintenance_plan_id uuid references public.maintenance_plans(id),
 maintenance_type text not null check(maintenance_type in('preventive','breakdown','corrective','inspection','calibration')),
 priority text not null default 'medium' check(priority in('low','medium','high','emergency')),
 status text not null default 'open' check(status in('open','assigned','in_progress','waiting_parts','completed','cancelled')),
 reported_at timestamptz not null default now(), started_at timestamptz, completed_at timestamptz, reported_by uuid, assigned_to uuid,
 failure_code text, root_cause text, resolution text, downtime_minutes numeric(18,2) not null default 0, labor_cost numeric(18,2) not null default 0,
 parts_cost numeric(18,2) not null default 0, other_cost numeric(18,2) not null default 0, unique(company_id,work_order_number)
);
create table if not exists public.maintenance_meter_readings(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 asset_id uuid not null references public.maintenance_assets(id) on delete cascade, meter_type text not null, reading_value numeric(18,4) not null,
 reading_at timestamptz not null default now(), recorded_by uuid
);
create table if not exists public.maintenance_spares(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 work_order_id uuid not null references public.maintenance_work_orders(id) on delete cascade, stock_item_id uuid references public.stock_items(id),
 quantity numeric(18,4) not null check(quantity>0), unit_cost numeric(18,4) not null default 0, issued_stock_movement_id uuid
);

-- 4. PLM / BOM revision / ECO
create table if not exists public.bom_revisions(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 model_id uuid not null references public.product_models(id), revision text not null, status text not null default 'draft' check(status in('draft','review','approved','released','obsolete')),
 effective_from date, effective_to date, change_summary text, approved_by uuid, approved_at timestamptz, created_by uuid, created_at timestamptz not null default now(),
 unique(company_id,model_id,revision)
);
create table if not exists public.bom_revision_lines(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 bom_revision_id uuid not null references public.bom_revisions(id) on delete cascade, raw_material_id uuid references public.raw_materials(id),
 stock_item_id uuid references public.stock_items(id), quantity_per_unit numeric(18,6) not null check(quantity_per_unit>=0), scrap_pct numeric(7,4) not null default 0,
 operation_no integer, substitute_group text
);
create table if not exists public.engineering_change_orders(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 eco_number text not null, title text not null, reason text, priority text not null default 'medium' check(priority in('low','medium','high','critical')),
 status text not null default 'draft' check(status in('draft','review','approved','released','rejected','cancelled')), requested_by uuid, approved_by uuid,
 effective_from date, released_at timestamptz, created_at timestamptz not null default now(), unique(company_id,eco_number)
);
create table if not exists public.engineering_change_order_lines(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 eco_id uuid not null references public.engineering_change_orders(id) on delete cascade, entity_type text not null, entity_id uuid not null,
 change_type text not null check(change_type in('add','modify','remove','replace')), old_value jsonb, new_value jsonb, reason text
);

-- 5. Procurement / RFQ / supplier score / 3-way match
create table if not exists public.rfqs(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 rfq_number text not null, title text not null, status text not null default 'draft' check(status in('draft','sent','quoted','evaluating','awarded','closed','cancelled')),
 issue_date date not null default current_date, response_due_date date, buyer_id uuid, currency_id uuid references public.currencies(id), notes text,
 created_at timestamptz not null default now(), unique(company_id,rfq_number)
);
create table if not exists public.rfq_lines(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 rfq_id uuid not null references public.rfqs(id) on delete cascade, stock_item_id uuid references public.stock_items(id), raw_material_id uuid references public.raw_materials(id),
 description text not null, quantity numeric(18,4) not null check(quantity>0), required_date date, specification jsonb not null default '{}'::jsonb
);
create table if not exists public.supplier_quotes(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 rfq_id uuid not null references public.rfqs(id) on delete cascade, supplier_id uuid not null references public.suppliers(id), quote_number text, quote_date date, valid_until date,
 payment_terms text, delivery_days numeric(18,2), freight numeric(18,2) not null default 0, other_charges numeric(18,2) not null default 0,
 status text not null default 'received' check(status in('received','shortlisted','awarded','rejected','expired')), total_value numeric(18,2) not null default 0
);
create table if not exists public.supplier_quote_lines(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 supplier_quote_id uuid not null references public.supplier_quotes(id) on delete cascade, rfq_line_id uuid not null references public.rfq_lines(id),
 unit_price numeric(18,6) not null check(unit_price>=0), quantity numeric(18,4) not null check(quantity>0), tax_rate numeric(9,4) not null default 0, promised_date date
);
create table if not exists public.supplier_scorecards(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 supplier_id uuid not null references public.suppliers(id), period_start date not null, period_end date not null,
 on_time_pct numeric(7,3) not null default 0, quality_pct numeric(7,3) not null default 0, price_score numeric(7,3) not null default 0,
 responsiveness_score numeric(7,3) not null default 0, overall_score numeric(7,3) not null default 0, notes text, unique(supplier_id,period_start,period_end)
);
create table if not exists public.purchase_receipts(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 receipt_number text not null, supplier_id uuid references public.suppliers(id), purchase_bill_id uuid references public.purchase_bills(id),
 received_at timestamptz not null default now(), status text not null default 'draft' check(status in('draft','received','inspected','accepted','rejected','cancelled')),
 received_by uuid, notes text, unique(company_id,receipt_number)
);
create table if not exists public.purchase_receipt_lines(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 receipt_id uuid not null references public.purchase_receipts(id) on delete cascade, purchase_bill_item_id uuid references public.purchase_bill_items(id),
 stock_item_id uuid references public.stock_items(id), quantity numeric(18,4) not null check(quantity>=0), accepted_quantity numeric(18,4) not null default 0,
 rejected_quantity numeric(18,4) not null default 0, batch_id uuid references public.stock_batches(id)
);
create table if not exists public.three_way_match_results(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 purchase_bill_id uuid not null references public.purchase_bills(id) on delete cascade, purchase_order_id uuid, receipt_id uuid references public.purchase_receipts(id),
 status text not null default 'pending' check(status in('pending','matched','variance','blocked','waived')),
 quantity_variance numeric(18,4) not null default 0, price_variance numeric(18,2) not null default 0, tax_variance numeric(18,2) not null default 0,
 evaluated_at timestamptz not null default now(), evaluated_by uuid, exceptions jsonb not null default '[]'::jsonb, unique(purchase_bill_id)
);

-- 6. Warehouse / cycle counts / landed cost
create table if not exists public.warehouse_zones(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 godown_id uuid not null references public.godowns(id) on delete cascade, code text not null, name text not null, zone_type text not null default 'storage', active boolean not null default true, unique(godown_id,code)
);
create table if not exists public.warehouse_bins(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 zone_id uuid not null references public.warehouse_zones(id) on delete cascade, code text not null, name text, capacity_qty numeric(18,4), active boolean not null default true, unique(zone_id,code)
);
create table if not exists public.stock_counts(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 count_number text not null, godown_id uuid references public.godowns(id), count_date date not null default current_date,
 count_type text not null default 'cycle' check(count_type in('cycle','abc','annual','spot')), status text not null default 'draft' check(status in('draft','counting','review','posted','cancelled')),
 blind_count boolean not null default false, created_by uuid, posted_at timestamptz, unique(company_id,count_number)
);
create table if not exists public.stock_count_lines(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 stock_count_id uuid not null references public.stock_counts(id) on delete cascade, stock_item_id uuid references public.stock_items(id),
 batch_id uuid references public.stock_batches(id), bin_id uuid references public.warehouse_bins(id), system_qty numeric(18,4) not null default 0,
 counted_qty numeric(18,4), variance_qty numeric(18,4), unit_cost numeric(18,6) not null default 0, notes text
);
create table if not exists public.landed_cost_vouchers(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 voucher_number text not null, receipt_id uuid references public.purchase_receipts(id), total_cost numeric(18,2) not null default 0,
 allocation_method text not null default 'value' check(allocation_method in('value','quantity','weight','volume','manual')),
 status text not null default 'draft' check(status in('draft','approved','posted','reversed')), created_by uuid, posted_at timestamptz, unique(company_id,voucher_number)
);
create table if not exists public.landed_cost_allocations(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 landed_cost_voucher_id uuid not null references public.landed_cost_vouchers(id) on delete cascade, receipt_line_id uuid references public.purchase_receipt_lines(id),
 allocated_amount numeric(18,2) not null default 0, allocated_qty numeric(18,4) not null default 0
);

-- 7. Finance / budgets / bank reconciliation / fixed assets
create table if not exists public.budgets(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 budget_code text not null, name text not null, fiscal_year_id uuid references public.financial_years(id),
 status text not null default 'draft' check(status in('draft','submitted','approved','locked','closed')), version integer not null default 1,
 currency_id uuid references public.currencies(id), approved_by uuid, approved_at timestamptz, created_at timestamptz not null default now(),
 unique(company_id,budget_code,version)
);
create table if not exists public.budget_lines(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 budget_id uuid not null references public.budgets(id) on delete cascade, ledger_account_id uuid references public.ledger_accounts(id),
 cost_center_id uuid references public.cost_centers(id), period_start date not null, amount numeric(18,2) not null default 0, notes text
);
create table if not exists public.bank_reconciliations(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 bank_account_id uuid not null references public.bank_accounts(id), reconciliation_number text not null, statement_date date not null,
 opening_balance numeric(18,2) not null default 0, closing_balance numeric(18,2) not null default 0, book_balance numeric(18,2) not null default 0,
 difference numeric(18,2) not null default 0, status text not null default 'open' check(status in('open','review','reconciled','locked')),
 prepared_by uuid, approved_by uuid, reconciled_at timestamptz, unique(company_id,reconciliation_number)
);
create table if not exists public.bank_reconciliation_items(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 reconciliation_id uuid not null references public.bank_reconciliations(id) on delete cascade, bank_transaction_id uuid references public.bank_transactions(id),
 matched_voucher_id uuid references public.vouchers(id), status text not null default 'unmatched' check(status in('unmatched','matched','excluded','suggested')),
 match_score numeric(7,4), difference numeric(18,2) not null default 0, reviewer_note text
);
create table if not exists public.fixed_assets(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 asset_code text not null, asset_name text not null, category text not null, serial_number text, purchase_bill_id uuid references public.purchase_bills(id),
 acquisition_date date not null, acquisition_cost numeric(18,2) not null default 0, residual_value numeric(18,2) not null default 0,
 useful_life_months integer not null default 60, depreciation_method text not null default 'straight_line',
 status text not null default 'active' check(status in('draft','active','disposed','impaired')), disposal_date date, disposal_value numeric(18,2),
 ledger_account_id uuid references public.ledger_accounts(id), created_at timestamptz not null default now(), unique(company_id,asset_code)
);
create table if not exists public.fixed_asset_depreciation(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 fixed_asset_id uuid not null references public.fixed_assets(id) on delete cascade, period_start date not null, period_end date not null,
 depreciation_amount numeric(18,2) not null default 0, accumulated_depreciation numeric(18,2) not null default 0,
 posted_voucher_id uuid references public.vouchers(id), posted_at timestamptz, unique(fixed_asset_id,period_start,period_end)
);

-- 8. CRM / opportunities / activities
create table if not exists public.crm_leads(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 lead_number text not null, name text not null, company_name text, email text, phone text, source text,
 status text not null default 'new' check(status in('new','qualified','contacted','converted','lost','junk')),
 owner_id uuid, estimated_value numeric(18,2) not null default 0, expected_close_date date, notes text, created_at timestamptz not null default now(),
 unique(company_id,lead_number)
);
create table if not exists public.crm_opportunities(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 opportunity_number text not null, party_id uuid references public.parties(id), lead_id uuid references public.crm_leads(id), name text not null,
 stage text not null default 'qualification', probability_pct numeric(7,3) not null default 10 check(probability_pct between 0 and 100),
 amount numeric(18,2) not null default 0, expected_close_date date, owner_id uuid,
 status text not null default 'open' check(status in('open','won','lost','on_hold')), lost_reason text, created_at timestamptz not null default now(),
 unique(company_id,opportunity_number)
);
create table if not exists public.crm_activities(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 activity_type text not null check(activity_type in('call','meeting','email','task','note')), subject text not null, due_at timestamptz, completed_at timestamptz,
 owner_id uuid, party_id uuid references public.parties(id), lead_id uuid references public.crm_leads(id), opportunity_id uuid references public.crm_opportunities(id), notes text, created_at timestamptz not null default now()
);

-- 9. Logistics / returns
create table if not exists public.shipments(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 shipment_number text not null, sales_order_id uuid references public.sales_orders(id), party_id uuid references public.parties(id), shipment_date date, promised_date date,
 transporter_name text, tracking_number text, status text not null default 'draft' check(status in('draft','packed','dispatched','in_transit','delivered','cancelled','returned')),
 shipping_address jsonb not null default '{}'::jsonb, freight_amount numeric(18,2) not null default 0, e_way_bill_id uuid references public.e_way_bills(id),
 delivered_at timestamptz, created_at timestamptz not null default now(), unique(company_id,shipment_number)
);
create table if not exists public.shipment_lines(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 shipment_id uuid not null references public.shipments(id) on delete cascade, sales_order_item_id uuid references public.sales_order_items(id),
 stock_item_id uuid references public.stock_items(id), batch_id uuid references public.stock_batches(id), quantity numeric(18,4) not null check(quantity>0)
);
create table if not exists public.sales_returns(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 return_number text not null, invoice_id uuid references public.invoices(id), party_id uuid references public.parties(id), return_date date not null default current_date,
 reason_code text, status text not null default 'draft' check(status in('draft','approved','received','inspected','posted','rejected','cancelled')),
 refund_method text, total_value numeric(18,2) not null default 0, created_by uuid, unique(company_id,return_number)
);
create table if not exists public.sales_return_lines(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 sales_return_id uuid not null references public.sales_returns(id) on delete cascade, invoice_item_id uuid references public.invoice_items(id),
 stock_item_id uuid references public.stock_items(id), batch_id uuid references public.stock_batches(id), quantity numeric(18,4) not null check(quantity>0),
 accepted_quantity numeric(18,4) not null default 0, rejected_quantity numeric(18,4) not null default 0, unit_price numeric(18,6) not null default 0,
 tax_rate numeric(9,4) not null default 0, disposition text
);

-- 10. Projects / workflow / data governance / AI freshness
create table if not exists public.projects(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 project_code text not null, name text not null, party_id uuid references public.parties(id), manager_id uuid, start_date date, end_date date,
 status text not null default 'planned' check(status in('planned','active','on_hold','completed','cancelled')),
 budget_amount numeric(18,2) not null default 0, actual_amount numeric(18,2) not null default 0, description text, created_at timestamptz not null default now(),
 unique(company_id,project_code)
);
create table if not exists public.project_tasks(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 project_id uuid not null references public.projects(id) on delete cascade, parent_task_id uuid references public.project_tasks(id), task_code text not null, name text not null,
 start_date date, due_date date, status text not null default 'todo' check(status in('todo','in_progress','blocked','done','cancelled')),
 priority text not null default 'medium', assignee_id uuid, estimated_hours numeric(18,2) not null default 0, actual_hours numeric(18,2) not null default 0,
 percent_complete numeric(7,3) not null default 0 check(percent_complete between 0 and 100), dependency_task_id uuid references public.project_tasks(id)
);
create table if not exists public.workflow_definitions(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 code text not null, name text not null, entity_type text not null, active boolean not null default true, version integer not null default 1,
 definition jsonb not null default '{}'::jsonb, created_by uuid, created_at timestamptz not null default now(), unique(company_id,code,version)
);
create table if not exists public.workflow_instances(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 workflow_definition_id uuid not null references public.workflow_definitions(id), entity_type text not null, entity_id uuid not null,
 status text not null default 'pending' check(status in('pending','in_progress','approved','rejected','cancelled')),
 current_step text, initiated_by uuid, initiated_at timestamptz not null default now(), completed_at timestamptz
);
create table if not exists public.workflow_tasks(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 workflow_instance_id uuid not null references public.workflow_instances(id) on delete cascade, step_code text not null, step_order integer not null,
 assignee_id uuid, role_code text, status text not null default 'pending' check(status in('pending','approved','rejected','skipped')),
 due_at timestamptz, acted_at timestamptz, decision_note text, unique(workflow_instance_id,step_code)
);
create table if not exists public.data_quality_issues(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 entity_type text not null, entity_id uuid, rule_code text not null, severity text not null default 'warning' check(severity in('info','warning','critical')),
 message text not null, detected_at timestamptz not null default now(), status text not null default 'open' check(status in('open','acknowledged','resolved','ignored')),
 resolved_at timestamptz, resolved_by uuid, details jsonb not null default '{}'::jsonb
);
create table if not exists public.ai_data_freshness(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 source_system text not null, source_scope text not null default 'erp', last_success_at timestamptz, last_attempt_at timestamptz,
 status text not null default 'unknown' check(status in('current','pending','stale','failed','unknown')), watermark text, record_count bigint, error_message text,
 updated_at timestamptz not null default now(), unique(company_id,source_system,source_scope)
);

-- Indexes
create index if not exists idx_mps_lines_plan_period on public.mps_lines(plan_id,period_start);
create index if not exists idx_mrp_orders_run_due on public.mrp_planned_orders(mrp_run_id,due_date);
create index if not exists idx_prod_ops_order_status on public.production_operations(production_order_id,status);
create index if not exists idx_quality_inspections_stage_date on public.quality_inspections(company_id,stage,inspected_at desc);
create index if not exists idx_nc_status_severity on public.quality_nonconformances(company_id,status,severity);
create index if not exists idx_maintenance_wo_asset_status on public.maintenance_work_orders(asset_id,status);
create index if not exists idx_rfqs_status_due on public.rfqs(company_id,status,response_due_date);
create index if not exists idx_bank_recon_status on public.bank_reconciliations(bank_account_id,status,statement_date desc);
create index if not exists idx_crm_opp_stage on public.crm_opportunities(company_id,status,stage);
create index if not exists idx_shipments_status_date on public.shipments(company_id,status,shipment_date desc);
create index if not exists idx_project_tasks_status_due on public.project_tasks(project_id,status,due_date);
create index if not exists idx_workflow_tasks_status_due on public.workflow_tasks(company_id,status,due_at);
create index if not exists idx_dq_status_severity on public.data_quality_issues(company_id,status,severity);

-- Deterministic calculation helpers.
create or replace function public.mrp_shortage(required_qty numeric,available_qty numeric,safety_qty numeric default 0)
returns numeric language sql immutable as $f$ select greatest(coalesce(required_qty,0)+coalesce(safety_qty,0)-coalesce(available_qty,0),0) $f$;
create or replace function public.capacity_available_minutes(available_minutes numeric,planned_minutes numeric,efficiency_pct numeric default 100)
returns numeric language sql immutable as $f$ select greatest(coalesce(available_minutes,0)*greatest(coalesce(efficiency_pct,100),0)/100-coalesce(planned_minutes,0),0) $f$;
create or replace function public.quality_acceptance(passed_count integer,failed_count integer)
returns text language sql immutable as $f$ select case when coalesce(failed_count,0)=0 and coalesce(passed_count,0)>0 then 'passed' when coalesce(passed_count,0)=0 and coalesce(failed_count,0)>0 then 'failed' when coalesce(passed_count,0)>0 and coalesce(failed_count,0)>0 then 'conditional' else 'open' end $f$;
create or replace function public.three_way_match_status(quantity_variance numeric,price_variance numeric,tolerance_amount numeric default .01)
returns text language sql immutable as $f$ select case when abs(coalesce(quantity_variance,0))<=.0001 and abs(coalesce(price_variance,0))<=coalesce(tolerance_amount,.01) then 'matched' else 'variance' end $f$;
create or replace function public.straight_line_depreciation(acquisition_cost numeric,residual_value numeric,useful_life_months integer)
returns numeric language sql immutable as $f$ select case when coalesce(useful_life_months,0)<=0 then 0 else greatest(coalesce(acquisition_cost,0)-coalesce(residual_value,0),0)/useful_life_months end $f$;

-- Company RLS for every new domain table.
do $f$
declare t text; tables text[] := array[
'erp_domain_audit_log','mps_plans','mps_lines','work_centers','work_center_calendars','routings','routing_operations','routing_operation_dependencies','mrp_runs','mrp_planned_orders','mrp_exceptions','production_operations',
'quality_plans','quality_inspections','quality_results','quality_nonconformances','quality_capa_actions',
'maintenance_assets','maintenance_plans','maintenance_work_orders','maintenance_meter_readings','maintenance_spares',
'bom_revisions','bom_revision_lines','engineering_change_orders','engineering_change_order_lines',
'rfqs','rfq_lines','supplier_quotes','supplier_quote_lines','supplier_scorecards','purchase_receipts','purchase_receipt_lines','three_way_match_results',
'warehouse_zones','warehouse_bins','stock_counts','stock_count_lines','landed_cost_vouchers','landed_cost_allocations',
'budgets','budget_lines','bank_reconciliations','bank_reconciliation_items','fixed_assets','fixed_asset_depreciation',
'crm_leads','crm_opportunities','crm_activities','shipments','shipment_lines','sales_returns','sales_return_lines',
'projects','project_tasks','workflow_definitions','workflow_instances','workflow_tasks','data_quality_issues','ai_data_freshness'];
begin
 foreach t in array tables loop
  execute format('alter table public.%I enable row level security',t);
  execute format('drop policy if exists company_scope_select on public.%I',t);
  execute format('drop policy if exists company_scope_insert on public.%I',t);
  execute format('drop policy if exists company_scope_update on public.%I',t);
  execute format('drop policy if exists company_scope_delete on public.%I',t);
  execute format('create policy company_scope_select on public.%I for select using (company_id=public.current_company_id() and public.has_company_access(company_id))',t);
  execute format('create policy company_scope_insert on public.%I for insert with check (company_id=public.current_company_id() and public.has_company_access(company_id))',t);
  execute format('create policy company_scope_update on public.%I for update using (company_id=public.current_company_id() and public.has_company_access(company_id)) with check (company_id=public.current_company_id() and public.has_company_access(company_id))',t);
  execute format('create policy company_scope_delete on public.%I for delete using (company_id=public.current_company_id() and public.has_company_access(company_id))',t);
 end loop;
end $f$;

drop trigger if exists trg_mps_plans_updated_at on public.mps_plans;
create trigger trg_mps_plans_updated_at before update on public.mps_plans for each row execute function public.touch_updated_at();
drop trigger if exists trg_work_centers_updated_at on public.work_centers;
create trigger trg_work_centers_updated_at before update on public.work_centers for each row execute function public.touch_updated_at();
drop trigger if exists trg_routings_updated_at on public.routings;
create trigger trg_routings_updated_at before update on public.routings for each row execute function public.touch_updated_at();
drop trigger if exists trg_maintenance_assets_updated_at on public.maintenance_assets;
create trigger trg_maintenance_assets_updated_at before update on public.maintenance_assets for each row execute function public.touch_updated_at();
drop trigger if exists trg_ai_data_freshness_updated_at on public.ai_data_freshness;
create trigger trg_ai_data_freshness_updated_at before update on public.ai_data_freshness for each row execute function public.touch_updated_at();

comment on table public.mps_plans is 'Master Production Schedule foundation; deterministic planning only.';
comment on table public.mrp_runs is 'Planning snapshot. It never mutates posted accounting or inventory.';
comment on table public.bom_revisions is 'Effective-dated BOM revision history; release requires controlled approval.';
comment on table public.three_way_match_results is 'PO/receipt/bill control result; does not post accounting automatically.';
comment on table public.ai_data_freshness is 'Explicit freshness state so stale/failed source data cannot masquerade as current zero.';
