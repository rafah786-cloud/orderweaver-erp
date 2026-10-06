import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { sb, type Currency, type ExchangeRate } from "@/lib/banking";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/banking/currencies")({ component: Currencies });

function Currencies() {
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [rates, setRates] = useState<ExchangeRate[]>([]);
  const [form, setForm] = useState({ currency_code: "USD", rate_date: new Date().toISOString().slice(0, 10), rate: 0 });

  async function load() {
    const [c, r] = await Promise.all([
      sb.from("currencies").select("*").order("code"),
      sb.from("exchange_rates").select("*").order("rate_date", { ascending: false }).limit(100),
    ]);
    setCurrencies(c.data ?? []); setRates(r.data ?? []);
  }
  useEffect(() => { load(); }, []);

  async function addRate() {
    if (!form.rate || form.rate <= 0) { toast.error("Enter a valid rate"); return; }
    const { error } = await sb.from("exchange_rates").upsert(form, { onConflict: "currency_code,rate_date" });
    if (error) { toast.error(error.message); return; }
    toast.success("Rate saved"); load();
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader title="Currencies & Exchange Rates" description="Manage currencies and date-wise rates (vs base INR)" />

      <div className="glass p-5 rounded-2xl">
        <h3 className="font-semibold mb-3">Currencies</h3>
        <div className="flex flex-wrap gap-2">
          {currencies.map((c) => (
            <Badge key={c.code} variant={c.is_base ? "default" : "secondary"} className="text-sm py-1 px-3">
              {c.symbol} {c.code} — {c.name} {c.is_base && "(base)"}
            </Badge>
          ))}
        </div>
      </div>

      <div className="glass p-5 rounded-2xl space-y-3">
        <h3 className="font-semibold">Add / Update Exchange Rate</h3>
        <div className="grid grid-cols-4 gap-3 items-end">
          <div><Label>Currency</Label>
            <Select value={form.currency_code} onValueChange={(v) => setForm({ ...form, currency_code: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{currencies.filter((c) => !c.is_base).map((c) => <SelectItem key={c.code} value={c.code}>{c.code}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Date</Label><Input type="date" value={form.rate_date} onChange={(e) => setForm({ ...form, rate_date: e.target.value })} /></div>
          <div><Label>Rate (1 unit = ? INR)</Label><Input type="number" step="0.0001" value={form.rate} onChange={(e) => setForm({ ...form, rate: Number(e.target.value) })} /></div>
          <Button onClick={addRate}>Save Rate</Button>
        </div>
      </div>

      <div className="glass rounded-2xl p-4 overflow-x-auto">
        <h3 className="font-semibold mb-3">Recent Rates</h3>
        <Table>
          <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Currency</TableHead><TableHead className="text-right">Rate (INR)</TableHead></TableRow></TableHeader>
          <TableBody>
            {rates.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.rate_date}</TableCell>
                <TableCell>{r.currency_code}</TableCell>
                <TableCell className="text-right tabular-nums">{Number(r.rate).toFixed(4)}</TableCell>
              </TableRow>
            ))}
            {rates.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-6">No rates yet</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
