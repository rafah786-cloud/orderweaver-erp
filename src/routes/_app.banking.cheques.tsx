import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { sb, type Cheque, type BankAccount, CHEQUE_STATUS_LABEL } from "@/lib/banking";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Printer } from "lucide-react";

export const Route = createFileRoute("/_app/banking/cheques")({ component: Cheques });

const STATUS_COLOR: Record<Cheque["status"], string> = {
  pending: "bg-yellow-500/20 text-yellow-700",
  cleared: "bg-green-500/20 text-green-700",
  bounced: "bg-red-500/20 text-red-700",
  cancelled: "bg-gray-500/20 text-gray-700",
};

function Cheques() {
  const [list, setList] = useState<Cheque[]>([]);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({
    direction: "issued", bank_account_id: "", cheque_number: "", cheque_date: new Date().toISOString().slice(0, 10),
    amount: 0, party_name: "", bank_name: "", branch: "", narration: "", status: "pending",
  });

  async function load() {
    const [c, b] = await Promise.all([
      sb.from("cheques").select("*").order("cheque_date", { ascending: false }),
      sb.from("bank_accounts").select("*").eq("is_active", true).order("name"),
    ]);
    setList(c.data ?? []); setAccounts(b.data ?? []);
  }
  useEffect(() => { load(); }, []);

  async function save() {
    if (!form.cheque_number || !form.party_name || !form.amount) { toast.error("Cheque #, party and amount required"); return; }
    const payload = { ...form, bank_account_id: form.bank_account_id || null };
    const { error } = await sb.from("cheques").insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success("Cheque added"); setOpen(false); load();
  }

  async function updateStatus(c: Cheque, status: Cheque["status"]) {
    const patch: any = { status };
    if (status === "cleared") patch.cleared_date = new Date().toISOString().slice(0, 10);
    await sb.from("cheques").update(patch).eq("id", c.id);
    toast.success(`Marked ${status}`); load();
  }

  function renderTable(rows: Cheque[]) {
    return (
      <div className="glass rounded-2xl p-3 overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Date</TableHead><TableHead>Cheque #</TableHead><TableHead>Party</TableHead>
            <TableHead>Bank</TableHead><TableHead className="text-right">Amount</TableHead>
            <TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {rows.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="text-xs">{c.cheque_date}</TableCell>
                <TableCell className="font-mono">{c.cheque_number}</TableCell>
                <TableCell>{c.party_name}</TableCell>
                <TableCell className="text-xs">{c.bank_name ?? accounts.find((a) => a.id === c.bank_account_id)?.bank_name ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums">₹{Number(c.amount).toLocaleString("en-IN")}</TableCell>
                <TableCell><Badge className={STATUS_COLOR[c.status]}>{CHEQUE_STATUS_LABEL[c.status]}</Badge></TableCell>
                <TableCell className="text-right space-x-1">
                  {c.status === "pending" && <>
                    <Button size="sm" variant="outline" onClick={() => updateStatus(c, "cleared")}>Clear</Button>
                    <Button size="sm" variant="outline" onClick={() => updateStatus(c, "bounced")}>Bounce</Button>
                  </>}
                  {c.direction === "issued" && (
                    <Link to="/banking/cheque-print/$id" params={{ id: c.id }}>
                      <Button size="sm" variant="ghost"><Printer className="h-3 w-3" /></Button>
                    </Link>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">No cheques</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader title="Cheque Register" description="Issued and received cheques (PDC support)">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />New Cheque</Button></DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>New Cheque</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Direction</Label>
                <Select value={form.direction} onValueChange={(v) => setForm({ ...form, direction: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="issued">Issued (we pay)</SelectItem><SelectItem value="received">Received (we receive)</SelectItem></SelectContent>
                </Select>
              </div>
              <div><Label>Bank Account</Label>
                <Select value={form.bank_account_id} onValueChange={(v) => setForm({ ...form, bank_account_id: v })}>
                  <SelectTrigger><SelectValue placeholder="(optional)" /></SelectTrigger>
                  <SelectContent>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Cheque Number</Label><Input value={form.cheque_number} onChange={(e) => setForm({ ...form, cheque_number: e.target.value })} /></div>
              <div><Label>Cheque Date</Label><Input type="date" value={form.cheque_date} onChange={(e) => setForm({ ...form, cheque_date: e.target.value })} /></div>
              <div><Label>Party / Payee Name</Label><Input value={form.party_name} onChange={(e) => setForm({ ...form, party_name: e.target.value })} /></div>
              <div><Label>Amount</Label><Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} /></div>
              <div><Label>Drawee Bank (if received)</Label><Input value={form.bank_name} onChange={(e) => setForm({ ...form, bank_name: e.target.value })} /></div>
              <div><Label>Branch</Label><Input value={form.branch} onChange={(e) => setForm({ ...form, branch: e.target.value })} /></div>
              <div className="col-span-2"><Label>Narration</Label><Input value={form.narration} onChange={(e) => setForm({ ...form, narration: e.target.value })} /></div>
            </div>
            <Button onClick={save}>Save</Button>
          </DialogContent>
        </Dialog>
      </PageHeader>

      <Tabs defaultValue="issued">
        <TabsList>
          <TabsTrigger value="issued">Issued</TabsTrigger>
          <TabsTrigger value="received">Received</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>
        <TabsContent value="issued">{renderTable(list.filter((c) => c.direction === "issued"))}</TabsContent>
        <TabsContent value="received">{renderTable(list.filter((c) => c.direction === "received"))}</TabsContent>
        <TabsContent value="all">{renderTable(list)}</TabsContent>
      </Tabs>
    </div>
  );
}
