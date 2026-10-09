"""Test the selected access-control migration on disposable PostgreSQL only."""
import os
import subprocess
import sys
import tempfile
from pathlib import Path

TABLES = ['crm_opportunities', 'crm_activities', 'shipments', 'budget_lines',
          'bank_reconciliation_items', 'crm_leads', 'budgets',
          'fixed_asset_depreciation', 'bank_reconciliations', 'fixed_assets']
PARENTS = {'budget_lines': ('budgets', 'budget_id'),
           'bank_reconciliation_items': ('bank_reconciliations', 'bank_reconciliation_id'),
           'fixed_asset_depreciation': ('fixed_assets', 'fixed_asset_id')}
U = '00000000-0000-0000-0000-000000000001'
A = '10000000-0000-0000-0000-000000000001'
B = '10000000-0000-0000-0000-000000000002'
ROW = '20000000-0000-0000-0000-000000000001'

def main():
    migration = Path(sys.argv[1]).resolve()
    with tempfile.TemporaryDirectory(prefix='selected-rls-') as temp:
        base = Path(temp)
        socket = base / 'socket'
        socket.mkdir()
        env = {k: v for k, v in os.environ.items() if not k.startswith(('PG', 'SUPABASE_', 'VITE_SUPABASE_')) and 'DATABASE_URL' not in k}
        env.update(PGHOST=str(socket), PGPORT='55448', PGDATABASE='postgres', PGUSER='postgres')
        def run(args, check=True):
            return subprocess.run(args, env=env, text=True, capture_output=True, check=check)
        def local(args):
            return ['setpriv', '--reuid=1000', '--regid=1000', '--clear-groups', *args] if os.geteuid() == 0 else args
        if os.geteuid() == 0:
            subprocess.run(['chown', '-R', 'lovable', temp], check=True)
        run(local(['initdb', '-D', str(base / 'data'), '-A', 'trust', '-U', 'postgres', '--no-instructions']))
        run(local(['pg_ctl', '-D', str(base / 'data'), '-o', f"-k {socket} -p 55448 -h ''", '-l', str(base / 'server.log'), 'start']))
        checks = 0
        try:
            def sql(query, caller=False, check=True):
                prefix = f"SET ROLE authenticated; SET request.jwt.claim.sub='{U}';" if caller else ''
                return run(['psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-c', prefix + query], check=check)
            def expect(name, condition):
                nonlocal checks
                if not condition:
                    raise AssertionError(name)
                checks += 1
            sql("CREATE ROLE authenticated; CREATE ROLE anon; CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT current_setting('request.jwt.claim.sub',true)::uuid $$; CREATE FUNCTION public.is_approved(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT coalesce(current_setting('test.approved',true),'true')::boolean $$; CREATE FUNCTION public.current_company_id() RETURNS uuid LANGUAGE sql AS $$ SELECT coalesce(nullif(current_setting('test.company',true),''),'" + A + "')::uuid $$; CREATE TABLE user_company_access(user_id uuid,company_id uuid,can_view boolean,can_create boolean,can_edit boolean,can_delete boolean); GRANT USAGE ON SCHEMA public,auth TO authenticated,anon; GRANT SELECT ON user_company_access TO authenticated;")
            for table in TABLES:
                extra = f', {PARENTS[table][1]} uuid' if table in PARENTS else ''
                sql(f"CREATE TABLE {table}(id uuid PRIMARY KEY, company_id uuid, notes text{extra}); GRANT ALL ON {table} TO authenticated,anon;")
            sql(migration.read_text())
            sql(f"INSERT INTO user_company_access VALUES ('{U}','{A}',true,true,true,true),('{U}','{B}',true,true,true,true)")
            # Parent fixture IDs intentionally match across tables, not across companies.
            for table in [t for t in TABLES if t not in PARENTS] + list(PARENTS):
                cols, vals = ('', '') if table not in PARENTS else (',' + PARENTS[table][1], f",'{ROW}'")
                sql(f"INSERT INTO {table}(id,company_id,notes{cols}) VALUES ('{ROW}','{A}','fixture'{vals}),('20000000-0000-0000-0000-000000000002','{B}','other'{vals})")
            for table in TABLES:
                expect(table + ' own read', sql(f'SELECT count(*) FROM {table}', True).stdout.strip() == '1')
                expect(table + ' anon read denied', sql(f'SET ROLE anon; SELECT count(*) FROM {table}').stdout.strip() == '0')
                expect(table + ' pending read denied', sql(f"SET test.approved='false'; SELECT count(*) FROM {table}", True).stdout.strip() == '0')
                expect(table + ' denied company hidden', sql(f"SET test.company='10000000-0000-0000-0000-000000000003'; SELECT count(*) FROM {table}", True).stdout.strip() == '0')
                expect(table + ' cannot move company', sql(f"UPDATE {table} SET company_id='{B}' WHERE id='{ROW}'", True, False).returncode != 0)
                cols, vals = ('', '') if table not in PARENTS else (',' + PARENTS[table][1], f",'{ROW}'")
                insert = f"INSERT INTO {table}(id,company_id,notes{cols}) VALUES ('30000000-0000-0000-0000-000000000001','{A}','test'{vals})"
                expect(table + ' own insert', sql(insert, True, False).returncode == 0)
                expect(table + ' own update', sql(f"UPDATE {table} SET notes='updated' WHERE notes='test' RETURNING id", True).stdout.strip() != '')
                expect(table + ' own delete', sql(f"DELETE FROM {table} WHERE notes='updated' RETURNING id", True).stdout.strip() != '')
                sql(f"UPDATE user_company_access SET can_create=false,can_edit=false,can_delete=false WHERE company_id='{A}'")
                expect(table + ' read-only insert denied', sql(insert, True, False).returncode != 0)
                expect(table + ' read-only update denied', sql(f"UPDATE {table} SET notes='forbidden' RETURNING id", True).stdout.strip() == '')
                expect(table + ' read-only delete denied', sql(f"DELETE FROM {table} RETURNING id", True).stdout.strip() == '')
                sql(f"UPDATE user_company_access SET can_create=true,can_edit=true,can_delete=true WHERE company_id='{A}'")
                if table in PARENTS:
                    key = PARENTS[table][1]
                    bad = f"INSERT INTO {table}(id,company_id,{key}) VALUES ('40000000-0000-0000-0000-000000000001','{A}','20000000-0000-0000-0000-000000000002')"
                    expect(table + ' cross-company parent denied', sql(bad, True, False).returncode != 0)
            print(f'PASS: {checks} isolated PostgreSQL access checks; production credentials excluded.')
        finally:
            run(local(['pg_ctl', '-D', str(base / 'data'), '-m', 'immediate', 'stop']), check=False)

if __name__ == '__main__':
    main()