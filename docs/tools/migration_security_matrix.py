#!/usr/bin/env python3
"""Read-only static inventory of all Supabase CLI migration SQL files.

This script never connects to a database and never edits SQL migrations.
Regex findings are leads, not proof: dynamic SQL, SQL quoting, conditional DDL,
policy composition, parent/child scope and function bypasses require manual review.
"""
from pathlib import Path
import argparse, csv, re, sys

ROOT = Path(__file__).resolve().parents[2]
MIGRATION_DIRS = [ROOT / "supabase" / "migrations", ROOT / "drizzle" / "migrations", ROOT / "accounting-phase1", ROOT / "accounting-phase2", ROOT / "accounting-phase3", ROOT / "manufacturing-phase1"]
Q = r'["\x60]?'
TABLE = re.compile(r'\bcreate\s+(?:unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?(?:(?:public|auth|storage)\s*\.\s*)?' + Q + r'([a-zA-Z_][\w$]*)' + Q + r'\s*\(', re.I)
RLS = re.compile(r'\balter\s+table\s+(?:only\s+)?(?:(?:public|auth|storage)\s*\.\s*)?' + Q + r'([a-zA-Z_][\w$]*)' + Q + r'\s+(?:enable|force)\s+row\s+level\s+security', re.I)
POLICY = re.compile(r'\bcreate\s+policy\s+' + Q + r'([^\s"\x60]+)' + Q + r'\s+on\s+(?:(?:public|auth|storage)\s*\.\s*)?' + Q + r'([a-zA-Z_][\w$]*)', re.I)
GRANT = re.compile(r'\bgrant\s+(.+?)\s+on\s+(?:table\s+)?(?:(?:public|auth|storage)\s*\.\s*)?' + Q + r'([a-zA-Z_][\w$]*)' + Q + r'\s+to\s+(.+?)(?:;|$)', re.I | re.S)
TRIGGER = re.compile(r'\bcreate\s+(?:constraint\s+)?trigger\s+' + Q + r'([^\s"\x60]+)' + Q + r'.*?\bon\s+(?:(?:public|auth|storage)\s*\.\s*)?' + Q + r'([a-zA-Z_][\w$]*)', re.I | re.S)
COLS = ('company_id','branch_id','created_at','updated_at','created_by','updated_by','deleted_at','deleted_by')
APPROVAL = re.compile(r'approval|approved_by|approved_at|approval_request|approval_rule|require_approval|can_approve', re.I)

def strip_comments(s):
    return re.sub(r'--[^\n]*|/\*[\s\S]*?\*/', ' ', s)

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--csv',type=Path)
    ap.add_argument('--markdown',type=Path)
    a=ap.parse_args()
    if not (ROOT / 'supabase' / 'migrations').is_dir(): raise SystemExit('Missing supabase/migrations')
    files=sorted(p for d in MIGRATION_DIRS if d.is_dir() for p in d.rglob('*.sql') if '/tests/' not in p.as_posix())
    tables={}; errors=[]
    def get(name):
        name=name.lower()
        return tables.setdefault(name, {'table':name,'def':'unknown','rls':set(),'policies':set(),'grants':set(),'triggers':set(),'cols':set(),'approval':set(),'evidence':set()})
    for p in files:
        try: raw=p.read_text(encoding='utf-8')
        except Exception as e: errors.append(f'{p.name}: {e}'); continue
        s=strip_comments(raw); rel=p.relative_to(ROOT).as_posix()
        for m in TABLE.finditer(s):
            r=get(m.group(1))
            if r['def']=='unknown': r['def']=rel
            r['evidence'].add(rel+' CREATE TABLE')
        for m in RLS.finditer(s):
            r=get(m.group(1)); r['rls'].add(rel); r['evidence'].add(rel+' RLS')
        for m in POLICY.finditer(s):
            r=get(m.group(2)); r['policies'].add(m.group(1)+' ('+rel+')'); r['evidence'].add(rel+' POLICY')
        for m in GRANT.finditer(s):
            r=get(m.group(2)); r['grants'].add(m.group(1).strip()+' TO '+m.group(3).strip()+' ('+rel+')'); r['evidence'].add(rel+' GRANT')
        for m in TRIGGER.finditer(s):
            r=get(m.group(2)); r['triggers'].add(m.group(1)+' ('+rel+')'); r['evidence'].add(rel+' TRIGGER')
        for m in re.finditer(r'\b(?:alter\s+table\s+(?:only\s+)?(?:public\s*\.\s*)?'+Q+r'([a-zA-Z_][\w$]*)'+Q+r'|create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\s*\.\s*)?'+Q+r'([a-zA-Z_][\w$]*)'+Q+r')([^;]*);',s,re.I|re.S):
            name=m.group(1) or m.group(2); stmt=m.group(3); r=get(name)
            for col in COLS:
                if re.search(r'\b'+col+r'\b',stmt,re.I): r['cols'].add(col)
            if APPROVAL.search(stmt): r['approval'].add(rel)
        if APPROVAL.search(s):
            for name in tables:
                if re.search(r'\b'+re.escape(name)+r'\b',s,re.I): tables[name]['approval'].add(rel)
    fields=['table','defining_migration','rls_enabled','policies','company_scope','branch_scope','grants','audit_coverage','approval_enforcement','gaps','trigger_evidence','column_evidence','migration_evidence']
    rows=[]
    for name,r in sorted(tables.items()):
        rows.append({
          'table':name,'defining_migration':r['def'],
          'rls_enabled':'Yes (migration declaration)' if r['rls'] else 'unknown',
          'policies':'; '.join(sorted(r['policies'])) or 'unknown',
          'company_scope':'company_id mentioned; predicate/tenant enforcement unknown' if 'company_id' in r['cols'] else 'unknown',
          'branch_scope':'branch_id mentioned; predicate/branch enforcement unknown' if 'branch_id' in r['cols'] else 'unknown',
          'grants':'; '.join(sorted(r['grants'])) or 'unknown',
          'audit_coverage':'audit columns or triggers detected; completeness unknown' if set(COLS[2:]) & r['cols'] or r['triggers'] else 'unknown',
          'approval_enforcement':'approval-related SQL mention; enforcement unknown' if r['approval'] else 'unknown',
          'gaps':'Manual review required: effective policy composition, predicate, linked-record scope, grants, dynamic SQL, trigger semantics and bypass paths.',
          'trigger_evidence':'; '.join(sorted(r['triggers'])) or 'unknown',
          'column_evidence':', '.join(sorted(r['cols'])) or 'unknown',
          'migration_evidence':'; '.join(sorted(r['evidence']))})
    if a.csv:
        with a.csv.open('w',newline='',encoding='utf-8') as f:
            w=csv.DictWriter(f,fieldnames=fields); w.writeheader(); w.writerows(rows)
    else:
        w=csv.DictWriter(sys.stdout,fieldnames=fields); w.writeheader(); w.writerows(rows)
    if a.markdown:
        with a.markdown.open('w',encoding='utf-8',newline='\n') as f:
            f.write('# Migration-derived Security Matrix\n\n')
            f.write('> Static source scan of Supabase CLI, Drizzle, accounting-phase and manufacturing-phase SQL sources. Regex results are leads, not proof. Supabase CLI remains the approved deployment authority. Unknown means not established. Review every SQL statement, including dynamic SQL, in migration order. Live database remains UNVERIFIED.\n\n')
            cols=fields[:10]; f.write('| '+' | '.join(cols)+' |\n|'+ '|'.join(['---']*len(cols))+'|\n')
            for row in rows:
                f.write('| '+' | '.join(str(row[k]).replace('|','\\|').replace('\n',' ') for k in cols)+' |\n')
            f.write(f'\n**Inventory:** {len(files)} SQL migration files; {len(rows)} distinct table names. Read errors: {len(errors)}.\n')
            for e in errors: f.write('- '+e+'\n')
    print(f'Scanned {len(files)} SQL migrations; found {len(rows)} table names. Manual SQL review is still required.')
if __name__=='__main__': main()
