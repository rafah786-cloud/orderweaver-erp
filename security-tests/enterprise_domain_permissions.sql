-- Run after 20261014143000_harden_enterprise_domain_permissions.sql.
-- Read-only assertions: abort if broad policies or incomplete CRUD guards remain.

do $test$
declare
  v_remaining_broad integer;
  v_missing_policy integer;
  v_audit_writes integer;
begin
  select count(*) into v_remaining_broad
  from pg_policies
  where schemaname = 'public' and policyname like 'company_scope%';

  if v_remaining_broad > 0 then
    raise exception 'Broad company_scope policies remain: %', v_remaining_broad;
  end if;

  select count(*) into v_missing_policy
  from (
    select distinct p.tablename
    from pg_policies p
    where p.schemaname = 'public' and p.policyname like 'company_permission_%'
  ) protected_tables
  where not exists (
    select 1 from pg_policies p
    where p.schemaname = 'public'
      and p.tablename = protected_tables.tablename
      and p.policyname = 'company_permission_select'
  )
  or (
    protected_tables.tablename <> 'erp_domain_audit_log'
    and (
      not exists (select 1 from pg_policies p where p.schemaname='public' and p.tablename=protected_tables.tablename and p.policyname='company_permission_insert' and p.with_check like '%can_create%')
      or not exists (select 1 from pg_policies p where p.schemaname='public' and p.tablename=protected_tables.tablename and p.policyname='company_permission_update' and p.qual like '%can_edit%' and p.with_check like '%can_edit%')
      or not exists (select 1 from pg_policies p where p.schemaname='public' and p.tablename=protected_tables.tablename and p.policyname='company_permission_delete' and p.qual like '%can_delete%')
    )
  );

  if v_missing_policy > 0 then
    raise exception 'Permission policy coverage is incomplete for % table(s)', v_missing_policy;
  end if;

  select count(*) into v_audit_writes
  from pg_policies
  where schemaname='public' and tablename='erp_domain_audit_log'
    and cmd in ('INSERT','UPDATE','DELETE','ALL');

  if v_audit_writes > 0 then
    raise exception 'Authenticated write policy exists on append-only audit log';
  end if;
end
$test$;
