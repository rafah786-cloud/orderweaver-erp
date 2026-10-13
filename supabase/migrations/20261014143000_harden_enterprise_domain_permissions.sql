-- Harden the additive enterprise capability tables.
-- Earlier company_scope policies checked only can_view (via has_company_access),
-- allowing view-only users to mutate operational records.
-- Map CRUD to per-company access flags and make the audit log append-only for clients.

do $migration$
declare
  p record;
  affected_tables text[];
  v_table text;
begin
  select array_agg(distinct tablename order by tablename)
    into affected_tables
  from pg_policies
  where schemaname = 'public'
    and policyname like 'company_scope%'
    and exists (
      select 1 from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = pg_policies.tablename
        and c.column_name = 'company_id'
    );

  foreach v_table in array coalesce(affected_tables, array[]::text[])
  loop
    -- PostgreSQL ORs permissive policies together, so remove every old broad policy.
    for p in
      select policyname from pg_policies
      where schemaname = 'public'
        and tablename = v_table
        and policyname like 'company_scope%'
    loop
      execute format('drop policy if exists %I on public.%I', p.policyname, v_table);
    end loop;

    execute format('drop policy if exists company_permission_select on public.%I', v_table);
    execute format('drop policy if exists company_permission_insert on public.%I', v_table);
    execute format('drop policy if exists company_permission_update on public.%I', v_table);
    execute format('drop policy if exists company_permission_delete on public.%I', v_table);

    if v_table = 'erp_domain_audit_log' then
      -- SECURITY DEFINER audit triggers write events; clients get read-only access.
      execute format(
        'create policy company_permission_select on public.%I for select using (public.is_approved(auth.uid()) and company_id = public.current_company_id() and public.has_company_access(company_id))',
        v_table
      );
    else
      execute format(
        'create policy company_permission_select on public.%I for select using (public.is_approved(auth.uid()) and company_id = public.current_company_id() and exists (select 1 from public.user_company_access a where a.user_id = auth.uid() and a.company_id = %I.company_id and a.can_view))',
        t.tablename, t.tablename
      );
      execute format(
        'create policy company_permission_insert on public.%I for insert with check (public.is_approved(auth.uid()) and company_id = public.current_company_id() and exists (select 1 from public.user_company_access a where a.user_id = auth.uid() and a.company_id = %I.company_id and a.can_view and a.can_create))',
        t.tablename, t.tablename
      );
      execute format(
        'create policy company_permission_update on public.%I for update using (public.is_approved(auth.uid()) and company_id = public.current_company_id() and exists (select 1 from public.user_company_access a where a.user_id = auth.uid() and a.company_id = %I.company_id and a.can_view and a.can_edit)) with check (public.is_approved(auth.uid()) and company_id = public.current_company_id() and exists (select 1 from public.user_company_access a where a.user_id = auth.uid() and a.company_id = %I.company_id and a.can_view and a.can_edit))',
        t.tablename, t.tablename, t.tablename
      );
      execute format(
        'create policy company_permission_delete on public.%I for delete using (public.is_approved(auth.uid()) and company_id = public.current_company_id() and exists (select 1 from public.user_company_access a where a.user_id = auth.uid() and a.company_id = %I.company_id and a.can_view and a.can_delete))',
        t.tablename, t.tablename
      );
    end if;
  end loop;
end
$migration$;
