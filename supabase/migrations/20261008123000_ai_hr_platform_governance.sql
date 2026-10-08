-- Mattress Maestro ERP: AI 2.0, HR lifecycle and platform governance expansion

create table if not exists public.employee_lifecycle_events(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 employee_id uuid not null references public.employees(id) on delete cascade, event_type text not null,
 effective_date date not null, old_value jsonb, new_value jsonb, reason text, approved_by uuid, created_by uuid, created_at timestamptz not null default now()
);
create table if not exists public.employee_performance_cycles(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 employee_id uuid not null references public.employees(id) on delete cascade, cycle_name text not null, period_start date not null, period_end date not null,
 status text not null default 'draft' check(status in('draft','self_review','manager_review','calibration','finalized')),
 overall_score numeric(7,3), goals jsonb not null default '[]'::jsonb, strengths text, development_plan text, manager_id uuid, finalized_at timestamptz
);
create table if not exists public.employee_training_records(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 employee_id uuid not null references public.employees(id) on delete cascade, training_name text not null, provider text, scheduled_date date,
 completed_date date, status text not null default 'planned' check(status in('planned','in_progress','completed','cancelled')), score numeric(7,3), certificate_reference text, expiry_date date, notes text
);
create table if not exists public.employee_leave_requests(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 employee_id uuid not null references public.employees(id) on delete cascade, leave_type text not null, start_date date not null, end_date date not null,
 days numeric(8,2) not null default 0, status text not null default 'pending' check(status in('pending','approved','rejected','cancelled')),
 reason text, approver_id uuid, approved_at timestamptz
);

-- AI governance: evidence, freshness, proactive alerts, context, actions and evaluation.
create table if not exists public.ai_skills(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 skill_code text not null, name text not null, description text, retrieval_contract jsonb not null default '{}'::jsonb,
 action_policy text not null default 'read_only' check(action_policy in('read_only','draft_only','approval_required')),
 active boolean not null default true, version integer not null default 1, unique(company_id,skill_code,version)
);
create table if not exists public.ai_alerts(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 alert_code text not null, severity text not null default 'info' check(severity in('info','warning','critical')), title text not null, message text not null,
 source_module text not null, entity_type text, entity_id uuid, detected_at timestamptz not null default now(), status text not null default 'open' check(status in('open','acknowledged','resolved','dismissed')),
 evidence jsonb not null default '{}'::jsonb, resolved_at timestamptz, resolved_by uuid
);
create table if not exists public.ai_context_bindings(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 screen_key text not null, entity_type text not null, entity_id uuid, context_payload jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now(),
 unique(company_id,screen_key,entity_type,entity_id)
);
create table if not exists public.ai_action_proposals(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 action_type text not null, entity_type text not null, entity_id uuid, title text not null, rationale text not null,
 proposed_payload jsonb not null default '{}'::jsonb, status text not null default 'draft' check(status in('draft','pending_approval','approved','rejected','executed','cancelled')),
 proposed_by uuid, approved_by uuid, approved_at timestamptz, executed_at timestamptz, result jsonb
);
create table if not exists public.ai_answer_evaluations(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 conversation_id uuid references public.ai_conversations(id) on delete cascade, answer_id uuid, evaluation_type text not null,
 score numeric(7,3), expected_state text, observed_state text, notes text, evaluator_id uuid, created_at timestamptz not null default now()
);
create table if not exists public.ai_forecast_models(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 metric_code text not null, model_type text not null, history_months integer not null default 0, mape numeric(12,4), mae numeric(18,6),
 confidence_level numeric(7,4) not null default .95, trained_at timestamptz, parameters jsonb not null default '{}'::jsonb, status text not null default 'candidate' check(status in('candidate','validated','retired')),
 unique(company_id,metric_code,model_type)
);

-- Integration/API/DR observability.
create table if not exists public.integration_runs(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 integration_code text not null, started_at timestamptz not null default now(), completed_at timestamptz, status text not null default 'running' check(status in('running','success','partial','failed','cancelled')),
 records_read bigint not null default 0, records_written bigint not null default 0, records_failed bigint not null default 0,
 watermark text, error_summary text, metadata jsonb not null default '{}'::jsonb
);
create table if not exists public.integration_health(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 integration_code text not null, status text not null default 'unknown' check(status in('healthy','degraded','failed','unknown')),
 last_success_at timestamptz, last_failure_at timestamptz, latency_ms numeric(18,2), failure_count integer not null default 0, checked_at timestamptz not null default now(),
 unique(company_id,integration_code)
);
create table if not exists public.backup_verification_runs(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 started_at timestamptz not null default now(), completed_at timestamptz, backup_reference text, status text not null default 'pending' check(status in('pending','verified','failed')),
 restore_tested boolean not null default false, checksum text, findings text, verified_by uuid
);
create table if not exists public.master_data_quality_rules(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 rule_code text not null, entity_type text not null, name text not null, severity text not null default 'warning' check(severity in('info','warning','critical')),
 rule_definition jsonb not null default '{}'::jsonb, active boolean not null default true, unique(company_id,rule_code)
);

do $f$
declare t text; tables text[] := array[
'employee_lifecycle_events','employee_performance_cycles','employee_training_records','employee_leave_requests',
'ai_skills','ai_alerts','ai_context_bindings','ai_action_proposals','ai_answer_evaluations','ai_forecast_models',
'integration_runs','integration_health','backup_verification_runs','master_data_quality_rules'];
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

create index if not exists idx_employee_lifecycle_employee_date on public.employee_lifecycle_events(employee_id,effective_date desc);
create index if not exists idx_performance_employee_period on public.employee_performance_cycles(employee_id,period_end desc);
create index if not exists idx_ai_alerts_status_time on public.ai_alerts(company_id,status,detected_at desc);
create index if not exists idx_ai_actions_status on public.ai_action_proposals(company_id,status,proposed_by);
create index if not exists idx_integration_runs_code_time on public.integration_runs(company_id,integration_code,started_at desc);
create index if not exists idx_backup_verification_status on public.backup_verification_runs(company_id,status,started_at desc);

drop trigger if exists trg_ai_context_bindings_updated_at on public.ai_context_bindings;
create trigger trg_ai_context_bindings_updated_at before update on public.ai_context_bindings for each row execute function public.touch_updated_at();
drop trigger if exists trg_ai_data_freshness_updated_at on public.ai_data_freshness;
create trigger trg_ai_data_freshness_updated_at before update on public.ai_data_freshness for each row execute function public.touch_updated_at();
