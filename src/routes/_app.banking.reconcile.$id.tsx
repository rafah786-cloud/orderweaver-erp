import { todayIndia } from "@/lib/format";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { sb, type BankAccount, type BankTransaction } from "@/lib/banking";
import { useServerFn } from "@tanstack/react-start";
import {
  addBankStatementLine,
  matchBankLines,
  unreconcileBankLine,
} from "@/lib/banking-admin.functions";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Link2, Unlink, RefreshCw } from "lucide-react";
import { bankLineAmountsMatch, validBankStatementAmounts } from "@/lib/bank-reconciliation";

export const Route = createFileRoute("/_app/banking/reconcile/$id")({ component: Reconcile });

function Reconcile() {
  const { id } = useParams({ from: "/_app/banking/reconcile/$id" });
  const [account, setAccount] = useState<BankAccount | null>(null);
  const [txns, setTxns] = useState<BankTransaction[]>([]);
  const [bookSel, setBookSel] = useState<string | null>(null);
  const [stmtSel, setStmtSel] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [addingLine, setAddingLine] = useState(false);
  const [matching, setMatching] = useState(false);
  const [unreconcilingId, setUnreconcilingId] = useState<string | null>(null);
  const addStatementLineFn = useServerFn(addBankStatementLine);
  const matchBankLinesFn = useServerFn(matchBankLines);
  const unreconcileBankLineFn = useServerFn(unreconcileBankLine);
  const [stmt, setStmt] = useState({
    txn_date: todayIndia(),
    description: "",
    reference: "",
    debit: 0,
    credit: 0,
  });

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [a, t] = await Promise.all([
        sb.from("bank_accounts").select("*").eq("id", id).maybeSingle(),
        sb
          .from("bank_transactions")
          .select("*")
          .eq("bank_account_id", id)
          .order("txn_date", { ascending: false }),
      ]);
      if (a.error) throw a.error;
      if (t.error) throw t.error;
      if (!a.data) throw new Error("Bank account was not found in the active company.");
      setAccount(a.data);
      setTxns(t.data ?? []);
      setBookSel(null);
      setStmtSel(null);
    } catch (error) {
      setAccount(null);
      setTxns([]);
      setBookSel(null);
      setStmtSel(null);
      setLoadError(error instanceof Error ? error.message : "Unable to load bank reconciliation data.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const book = useMemo(() => txns.filter((t) => t.source === "book"), [txns]);
  const statement = useMemo(() => txns.filter((t) => t.source === "statement"), [txns]);

  async function addStatementLine() {
    if (!validBankStatementAmounts(stmt.debit, stmt.credit)) {
      toast.error("Enter one positive debit or credit amount only. Zero-value and dual-sided lines are not allowed.");
      return;
    }
    setAddingLine(true);
    try {
      await addStatementLineFn({ data: { ...stmt, bank_account_id: id } });
      toast.success("Statement line added");
      setOpen(false);
      setStmt({ ...stmt, description: "", reference: "", debit: 0, credit: 0 });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add statement line");
    } finally {
      setAddingLine(false);
    }
  }

  async function match() {
    if (!bookSel || !stmtSel) {
      toast.error("Select one book and one statement line");
      return;
    }
    const b = book.find((x) => x.id === bookSel);
    const s = statement.find((x) => x.id === stmtSel);
    if (!b || !s) {
      setBookSel(null);
      setStmtSel(null);
      toast.error("One of the selected transactions is no longer available. Reload and select both lines again.");
      return;
    }
    if (!bankLineAmountsMatch(b, s)) {
      toast.error("Debit and credit must each match exactly. Opposite money directions are not interchangeable.");
      return;
    }
    setMatching(true);
    try {
      await matchBankLinesFn({ data: { book_id: b.id, statement_id: s.id } });
      toast.success("Reconciled");
      setBookSel(null);
      setStmtSel(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to reconcile");
    } finally {
      setMatching(false);
    }
  }

  async function unreconcile(t: BankTransaction) {
    if (!confirm("Unmatch this transaction pair? Both lines will return to the unreconciled list.")) return;
    setUnreconcilingId(t.id);
    try {
      await unreconcileBankLineFn({ data: { id: t.id, reconciled_with: t.reconciled_with } });
      toast.success("Transaction pair unmatched.");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to unmatch transaction pair");
    } finally {
      setUnreconcilingId(null);
    }
  }

  const bookBalance = book.reduce(
    (s, t) => s + Number(t.debit) - Number(t.credit),
    Number(account?.opening_balance ?? 0),
  );
  const stmtBalance = statement.reduce((s, t) => s + Number(t.debit) - Number(t.credit), 0);
  const unrecBook = book.filter((t) => !t.reconciled_at).length;
  const unrecStmt = statement.filter((t) => !t.reconciled_at).length;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title={`Reconcile · ${account?.name ?? ""}`}
        description={`${account?.bank_name ?? ""} · ${account?.account_number ?? ""}`}
        actions={
          <>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" disabled={loading || !!loadError || !account || addingLine || matching || unreconcilingId !== null}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Statement Line
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Statement Line</DialogTitle>
                </DialogHeader>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Date</Label>
                    <Input
                      type="date"
                      value={stmt.txn_date}
                      onChange={(e) => setStmt({ ...stmt, txn_date: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Reference</Label>
                    <Input
                      value={stmt.reference}
                      onChange={(e) => setStmt({ ...stmt, reference: e.target.value })}
                    />
                  </div>
                  <div className="col-span-2">
                    <Label>Description</Label>
                    <Input
                      value={stmt.description}
                      onChange={(e) => setStmt({ ...stmt, description: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Debit (money in)</Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={stmt.debit}
                      onChange={(e) => setStmt({ ...stmt, debit: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <Label>Credit (money out)</Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={stmt.credit}
                      onChange={(e) => setStmt({ ...stmt, credit: Number(e.target.value) })}
                    />
                  </div>
                </div>
                <Button onClick={addStatementLine} disabled={addingLine || loading || !!loadError || !validBankStatementAmounts(stmt.debit, stmt.credit)}>{addingLine ? "Adding…" : "Add"}</Button>
              </DialogContent>
            </Dialog>
            <Button onClick={match} disabled={!bookSel || !stmtSel || matching || loading || !!loadError || addingLine || unreconcilingId !== null}>
              <Link2 className="h-4 w-4 mr-2" />
              Match Selected
            </Button>
          </>
        }
      />

      {loading ? (
        <p role="status" className="text-sm text-muted-foreground">Loading bank transactions…</p>
      ) : loadError ? (
        <div role="alert" className="rounded-lg border border-destructive/40 p-4 text-sm">
          <p className="font-medium text-destructive">Reconciliation data could not be loaded.</p>
          <p className="mt-1 text-muted-foreground">{loadError}</p>
          <Button className="mt-3" size="sm" variant="outline" onClick={() => void load()}><RefreshCw className="mr-2 h-4 w-4" />Retry</Button>
        </div>
      ) : (
        <>
      <div className="grid grid-cols-3 gap-4">
        <div className="glass p-4 rounded-xl">
          <div className="text-xs text-muted-foreground">Book Balance</div>
          <div className="text-xl font-semibold tabular-nums">
            ₹{bookBalance.toLocaleString("en-IN")}
          </div>
        </div>
        <div className="glass p-4 rounded-xl">
          <div className="text-xs text-muted-foreground">Statement Balance</div>
          <div className="text-xl font-semibold tabular-nums">
            ₹{stmtBalance.toLocaleString("en-IN")}
          </div>
        </div>
        <div className="glass p-4 rounded-xl">
          <div className="text-xs text-muted-foreground">Unreconciled</div>
          <div className="text-xl font-semibold">
            {unrecBook} book · {unrecStmt} stmt
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Side
          title="Book (vouchers)"
          rows={book}
          sel={bookSel}
          setSel={setBookSel}
          onUnreconcile={unreconcile}
          actionsDisabled={loading || !!loadError || matching || addingLine || unreconcilingId !== null}
        />
        <Side
          title="Bank Statement"
          rows={statement}
          sel={stmtSel}
          setSel={setStmtSel}
          onUnreconcile={unreconcile}
          actionsDisabled={loading || !!loadError || matching || addingLine || unreconcilingId !== null}
        />
      </div>
        </>
      )}
    </div>
  );
}

function Side({
  title,
  rows,
  sel,
  setSel,
  onUnreconcile,
  actionsDisabled,
}: {
  title: string;
  rows: BankTransaction[];
  sel: string | null;
  setSel: (v: string | null) => void;
  onUnreconcile: (t: BankTransaction) => void;
  actionsDisabled: boolean;
}) {
  return (
    <div className="glass rounded-2xl p-3">
      <div className="font-semibold mb-2 px-2">{title}</div>
      <div className="max-h-[60vh] overflow-y-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8"></TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Details</TableHead>
              <TableHead className="text-right">Dr</TableHead>
              <TableHead className="text-right">Cr</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((t) => (
              <TableRow
                key={t.id}
                className={`${sel === t.id ? "bg-primary/10" : ""} ${t.reconciled_at ? "opacity-60" : "cursor-pointer"}`}
                onClick={() => !actionsDisabled && !t.reconciled_at && setSel(sel === t.id ? null : t.id)}
              >
                <TableCell>
                  <input
                    type="radio"
                    checked={sel === t.id}
                    name={`reconcile-${title}`}
                    aria-label={`Select ${title} transaction ${t.txn_date} ${t.description ?? ""}`}
                    disabled={actionsDisabled || !!t.reconciled_at}
                    onChange={() => setSel(t.id)}
                  />
                </TableCell>
                <TableCell className="text-xs">{t.txn_date}</TableCell>
                <TableCell className="text-xs">
                  <div>{t.description}</div>
                  {t.reference && <div className="text-muted-foreground">{t.reference}</div>}
                </TableCell>
                <TableCell className="text-right tabular-nums text-xs">
                  {Number(t.debit) || ""}
                </TableCell>
                <TableCell className="text-right tabular-nums text-xs">
                  {Number(t.credit) || ""}
                </TableCell>
                <TableCell>
                  {t.reconciled_at && (
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Unmatch transaction ${t.txn_date} ${t.description ?? ""}`}
                      disabled={actionsDisabled}
                      onClick={(e) => {
                        e.stopPropagation();
                        onUnreconcile(t);
                      }}
                    >
                      <Unlink className="h-3 w-3" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                  No entries
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
