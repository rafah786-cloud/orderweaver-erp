from pathlib import Path

MIGRATION = Path(__file__).resolve().parents[1] / "supabase/migrations/20261014143000_harden_enterprise_domain_permissions.sql"
SQL = MIGRATION.read_text(encoding="utf-8").lower()


def test_enterprise_crud_policies_use_individual_permission_flags():
    assert "a.can_view and a.can_create" in SQL
    assert "a.can_view and a.can_edit" in SQL
    assert "a.can_view and a.can_delete" in SQL
    assert "public.is_approved(auth.uid())" in SQL
    assert "public.current_company_id()" in SQL


def test_audit_log_is_read_only_to_authenticated_clients():
    branch = SQL.split("if v_table = 'erp_domain_audit_log' then", 1)[1].split("else", 1)[0]
    assert "for select" in branch
    assert "for insert" not in branch
    assert "for update" not in branch
    assert "for delete" not in branch


def test_migration_is_limited_to_additive_domains():
    selector = SQL.split("select array_agg", 1)[1].split("and exists", 1)[0]
    assert "'vouchers'" not in selector
    assert "'invoices'" not in selector
    assert "'stock_movements'" not in selector
    assert "'mps_plans'" in selector
    assert "'production_operations'" in selector


def test_old_permissive_policies_are_removed_before_replacement():
    assert "policyname like 'company_scope%'" in SQL
    assert "drop policy if exists %i on public.%i" in SQL
