import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { sb, type BankAccount, type Currency } from "@/lib/banking";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/_app/banking/accounts")({ component: BankAccounts });

function BankAccounts() {
  const [list, setList] = useState<BankAccount[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [ledgers, setLedgers] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "", bank_name: "", account_number: "", ifsc_code: "", branch: "",
    account_type: "current", currency_code: "INR", opening_balance: 0,
    opening_balance_date: new Date().toISOString().slice(0, 10), ledger_account_id: "",
  });

  async function load() {
    const [a, c, l] = await Promise.all([
      sb.from("bank_accounts").select("*").order("name"),
      sb.from("currencies").select("*").eq("is_active", true).order("code"),
      sb.from("ledger_accounts").select("id,name,group_id,ledger_groups!inner(name)").order("name"),
    ]);
    setList(a.data ?? []);
    setCurrencies(c.data ?? []);
    setLedgers((l.data ?? []).filter((x: any) => x.ledger_groups?.name === "Bank Accounts" || x.ledger_groups?.name === "Cash-in-Hand"));
  }
  useEffect(() => { load(); }, []);

  async function save() {
    if (!form.name || !form.bank_name || !form.account_number) {
      toast.error("Name, bank and account number are required"); return;
    }
    const payload = { ...form, ledger_account_id: form.ledger_account_id || null };
    const { error } = await sb.from("bank_accounts").insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success("Bank account added");
    setOpen(false);
    setForm({ ...form, name: "", account_number: "", ifsc_code: "", branch: "", opening_balance: 0 });
    load();
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader title="Bank Accounts" description="Manage bank account master">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />New Account</Button></DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>New Bank Account</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Display Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div><Label>Bank Name</Label><Input value={form.bank_name} onChange={(e) => setForm({ ...form, bank_name: e.target.value })} /></div>
              <div><Label>Account Number</Label><Input value={form.account_number} onChange={(e) => setForm({ ...form, account_number: e.target.value })} /></div>
              <div><Label>IFSC Code</Label><Input value={form.ifsc_code} onChange={(e) => setForm({ ...form, ifsc_code: e.target.value })} /></div>
              <div><Label>Branch</Label><Input value={form.branch} onChange={(e) => setForm({ ...form, branch: e.target.value })} /></div>
              <div><Label>Account Type</Label>
                <Select value={form.account_type} onValueChange={(v) => setForm({ ...form, account_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="current">Current</SelectItem>
                    <SelectItem value="savings">Savings</SelectItem>
                    <SelectItem value="od">Overdraft</SelectItem>
                    <SelectItem value="cc">Cash Credit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Currency</Label>
                <Select value={form.currency_code} onValueChange={(v) => setForm({ ...form, currency_code: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{currencies.map((c) => <SelectItem key={c.code} value={c.code}>{c.code} — {c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Opening Balance</Label><Input type="number" value={form.opening_balance} onChange={(e) => setForm({ ...form, opening_balance: Number(e.target.value) })} /></div>
              <div><Label>As On Date</Label><Input type="date" value={form.opening_balance_date} onChange={(e) => setForm({ ...form, opening_balance_date: e.target.value })} /></div>
              <div className="col-span-2"><Label>Link to Ledger Account</Label>
                <Select value={form.ledger_account_id} onValueChange={(v) => setForm({ ...form, ledger_account_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select ledger (Bank Accounts group)" /></SelectTrigger>
                  <SelectContent>{ledgers.map((l: any) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <Button onClick={save}>Save</Button>
          </DialogContent>
        </Dialog>
      </PageHeader>

      <div className="glass rounded-2xl p-4 overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Name</TableHead><TableHead>Bank</TableHead><TableHead>A/c No</TableHead>
            <TableHead>IFSC</TableHead><TableHead>Type</TableHead><TableHead>Currency</TableHead>
            <TableHead className="text-right">Opening</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {list.map((b) => (
              <TableRow key={b.id}>
                <TableCell className="font-medium">{b.name}</TableCell>
                <TableCell>{b.bank_name}</TableCell>
                <TableCell className="font-mono text-xs">{b.account_number}</TableCell>
                <TableCell className="font-mono text-xs">{b.ifsc_code}</TableCell>
                <TableCell className="uppercase text-xs">{b.account_type}</TableCell>
                <TableCell>{b.currency_code}</TableCell>
                <TableCell className="text-right tabular-nums">{Number(b.opening_balance).toLocaleString("en-IN")}</TableCell>
              </TableRow>
            ))}
            {list.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No bank accounts yet</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
