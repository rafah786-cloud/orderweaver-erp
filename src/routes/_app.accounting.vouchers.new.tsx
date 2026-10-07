import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageHeader, PageBody } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useRef, useState } from "react";
import { sb, type LedgerAccount, type VoucherType, VOUCHER_TYPE_LABEL } from "@/lib/accounting";
import { inr, todayIndia } from "@/lib/format";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { notifyCustomerEvent } from "@/lib/whatsapp.functions";
import { notifyStaffEvent } from "@/lib/staff-notifications.functions";
import { createGlVoucher } from "@/lib/accounting.functions";

export const Route = createFileRoute("/_app/accounting/vouchers/new")({
  head: () => ({
    meta: [
      { title: "New Voucher | Mattress Maestro" },
      { name: "description", content: "Create a balanced accounting voucher in Mattress Maestro." },
      { property: "og:title", content: "New Voucher | Mattress Maestro" },
      {
        property: "og:description",
        content: "Create a balanced accounting voucher in Mattress Maestro.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NewVoucherPage,
});

type Line = { ledger_account_id: string; debit: number; credit: number; narration: string };

// Only manual-entry types here (sales/purchase auto-post from invoices/bills).
const MANUAL_TYPES: VoucherType[] = [
  "receipt",
  "payment",
  "contra",
  "journal",
  "debit_note",
  "credit_note",
];

function NewVoucherPage() {
  const navigate = useNavigate();
  const createVoucher = useServerFn(createGlVoucher);
  const notifyCustomer = useServerFn(notifyCustomerEvent);
  const notifyStaff = useServerFn(notifyStaffEvent);
  const [type, setType] = useState<VoucherType>("journal");
  const [voucherDate, setVoucherDate] = useState(() => todayIndia());
  const [narration, setNarration] = useState("");
  const [reference, setReference] = useState("");
  const [lines, setLines] = useState<Line[]>([
    { ledger_account_id: "", debit: 0, credit: 0, narration: "" },
    { ledger_account_id: "", debit: 0, credit: 0, narration: "" },
  ]);
  const [saving, setSaving] = useState(false);
  const idempotencyKey = useRef<string | null>(null);

  const ledgersQ = useQuery({
    queryKey: ["all_ledgers"],
    queryFn: async () => {
      const { data, error } = await sb
        .from("ledger_accounts")
        .select("*")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data as LedgerAccount[];
    },
  });

  const totalDr = lines.reduce((s, l) => s + Number(l.debit || 0), 0);
  const totalCr = lines.reduce((s, l) => s + Number(l.credit || 0), 0);
  const balanced = Math.abs(totalDr - totalCr) < 0.01 && totalDr > 0;

  function updateLine(i: number, patch: Partial<Line>) {
    setLines((arr) => arr.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function addLine() {
    setLines((arr) => [...arr, { ledger_account_id: "", debit: 0, credit: 0, narration: "" }]);
  }
  function removeLine(i: number) {
    setLines((arr) => (arr.length > 2 ? arr.filter((_, idx) => idx !== i) : arr));
  }

  async function save() {
    if (!balanced) {
      toast.error("Voucher is not balanced. Debits must equal credits.");
      return;
    }
    const validLines = lines.filter(
      (l) => l.ledger_account_id && (Number(l.debit) > 0 || Number(l.credit) > 0),
    );
    if (validLines.length < 2) {
      toast.error("At least 2 ledger lines are required.");
      return;
    }
    setSaving(true);
    try {
      if (!idempotencyKey.current) idempotencyKey.current = `manual-voucher:${crypto.randomUUID()}`;
      const result = await createVoucher({
        data: {
          type,
          date: voucherDate,
          narration: narration || undefined,
          reference: reference || undefined,
          idempotencyKey: idempotencyKey.current,
          status: "posted",
          entries: validLines.map((l, i) => ({
            ledger_account_id: l.ledger_account_id,
            debit: Number(l.debit || 0),
            credit: Number(l.credit || 0),
            narration: l.narration || undefined,
            line_order: i + 1,
          })),
        },
      });
      const row = Array.isArray(result) ? result[0] : result;
      if (!row || typeof row.id !== "string" || typeof row.voucher_number !== "string") {
        throw new Error("Accounting service returned an invalid voucher");
      }
      const voucher = { id: row.id, voucherNumber: row.voucher_number };

      toast.success(`${VOUCHER_TYPE_LABEL[type]} ${voucher.voucherNumber} saved`);

      // Customer payment notification: receipt voucher → notify the customer whose ledger was credited
      if (type === "receipt") {
        try {
          const ledgers = ledgersQ.data ?? [];
          const customerLine = validLines.find((l) => {
            const la = ledgers.find((x) => x.id === l.ledger_account_id);
            return la?.mapped_party_id && Number(l.credit || 0) > 0;
          });
          if (customerLine) {
            const la = ledgers.find((x) => x.id === customerLine.ledger_account_id);
            const partyId = la?.mapped_party_id;
            const amount = validLines
              .filter((l) => {
                const x = ledgers.find((y) => y.id === l.ledger_account_id);
                return x?.mapped_party_id === partyId;
              })
              .reduce((s, l) => s + Number(l.credit || 0), 0);
            if (partyId && amount > 0) {
              await notifyCustomer({
                data: {
                  party_id: partyId,
                  event: "payment.received",
                  ref_id: voucher.id,
                },
              }).catch(() => {});
              // Fan out to staff (Accounts / Management)
              notifyStaff({ data: { event: "staff.payment.received", ref_id: voucher.id } }).catch(
                () => {},
              );
            }
          }
        } catch {
          // non-blocking
        }
      }

      navigate({ to: "/accounting/voucher/$id", params: { id: voucher.id } });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save voucher";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        title="New Voucher"
        description="Manual journal, receipt, payment, contra, or note."
      />
      <PageBody>
        <Card className="mb-4">
          <CardContent className="p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <Label className="text-xs">Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as VoucherType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MANUAL_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {VOUCHER_TYPE_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Date</Label>
              <Input
                type="date"
                value={voucherDate}
                onChange={(e) => setVoucherDate(e.target.value)}
              />
            </div>
            <div className="md:col-span-2">
              <Label className="text-xs">Reference</Label>
              <Input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Optional reference / cheque # etc."
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ledger</TableHead>
                  <TableHead>Narration</TableHead>
                  <TableHead className="w-32 text-right">Debit</TableHead>
                  <TableHead className="w-32 text-right">Credit</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((l, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <Select
                        value={l.ledger_account_id}
                        onValueChange={(v) => updateLine(i, { ledger_account_id: v })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select ledger" />
                        </SelectTrigger>
                        <SelectContent>
                          {(ledgersQ.data ?? []).map((la) => (
                            <SelectItem key={la.id} value={la.id}>
                              {la.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Input
                        value={l.narration}
                        onChange={(e) => updateLine(i, { narration: e.target.value })}
                        placeholder="Optional"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        className="text-right tabular-nums"
                        value={l.debit || ""}
                        onChange={(e) =>
                          updateLine(i, {
                            debit: Number(e.target.value),
                            credit: Number(e.target.value) > 0 ? 0 : l.credit,
                          })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        className="text-right tabular-nums"
                        value={l.credit || ""}
                        onChange={(e) =>
                          updateLine(i, {
                            credit: Number(e.target.value),
                            debit: Number(e.target.value) > 0 ? 0 : l.debit,
                          })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeLine(i)}
                        disabled={lines.length <= 2}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="font-semibold bg-muted/30">
                  <TableCell colSpan={2}>
                    <Button variant="outline" size="sm" onClick={addLine}>
                      <Plus className="h-3.5 w-3.5 mr-1" /> Add row
                    </Button>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{inr(totalDr)}</TableCell>
                  <TableCell className="text-right tabular-nums">{inr(totalCr)}</TableCell>
                  <TableCell></TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3 items-start">
          <div className="md:col-span-2">
            <Label className="text-xs">Narration</Label>
            <Textarea
              value={narration}
              onChange={(e) => setNarration(e.target.value)}
              rows={3}
              placeholder="Being..."
            />
          </div>
          <div className="space-y-2">
            <div
              className={`text-sm font-medium ${balanced ? "text-emerald-600" : "text-amber-600"}`}
            >
              {balanced ? "✓ Balanced" : `Difference: ${inr(Math.abs(totalDr - totalCr))}`}
            </div>
            <Button className="w-full" disabled={!balanced || saving} onClick={save}>
              {saving ? "Saving..." : "Save Voucher"}
            </Button>
          </div>
        </div>
      </PageBody>
    </>
  );
}
