-- Harden the additive enterprise capability tables.
-- Earlier company_scope policies checked only can_view (via has_company_access),
-- allowing view-only users to mutate operational records.
-- Map CRUD to per-company access flags and make the audit log append-only for clients.

do $migration$
declare
  t record;
  p record;
begin
  for t in
    select distinct tablename
    from pg_policies
    where schemaname = 'public' and policyname like 'company_scope%'
  loop
    -- PostgreSQL ORs permissive policies together, so remove every old broad policy.
    for p in
      select policyname from pg_policies
      where schemaname = 'public'
        and tablename = t.tablename
        and policyname like 'company_scope%'
    loop
      execute format('drop policy if exists %I on public.%I', p.policyname, t.tablename);
    end loop;

    execute format('drop policy if exists company_permission_select on public.%I', t.tablename);
    execute format('drop policy if exists company_permission_insert on public.%I', t.tablename);
    execute format('drop policy if exists company_permission_update on public.%I', t.tablename);
    execute format('drop policy if exists company_permission_delete on public.%I', t.tablename);

    if t.tablename = 'erp_domain_audit_log' then
      -- SECURITY DEFINER audit triggers write events; clients get read-only access.
      execute format(
        'create policy company_permission_select on public.%I for select using (public.is_approved(auth.uid()) and company_id = public.current_company_id() and public.has_company_access(company_id))',
        t.tablename
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
