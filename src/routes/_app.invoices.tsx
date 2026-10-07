import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader, PageBody } from "@/components/PageHeader";
import { AiInsightButton } from "@/components/ai/AiInsightButton";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
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
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Trash2,
  AlertTriangle,
  Ban,
  FileDown,
  MoreHorizontal,
  IndianRupee,
  XCircle,
  Printer,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { PrintPreviewModal } from "@/components/print/PrintPreviewModal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { inr, formatDate, daysBetween } from "@/lib/format";
import { buildGstr1Json, downloadJson } from "@/lib/gstr1";
import { notifyCustomerEvent } from "@/lib/whatsapp.functions";
import { useCompany } from "@/lib/company-context";
import { createInvoice, recordInvoiceReceipt, reverseInvoice } from "@/lib/invoices-admin.functions";

export const Route = createFileRoute("/_app/invoices")({
  component: InvoicesPage,
});

type InvoiceRow = {
  id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  total_amount: number;
  paid_amount: number;
  status: "unpaid" | "partial" | "paid" | "cancelled";
  party_id: string;
};

type Item = {
  description: string;
  quantity: number;
  unit_price: number;
  hsn_code: string;
  tax_rate: number;
};
const CREDIT_LIMIT_HARD = 150000;
const OVERDUE_THRESHOLD = 50000;
const OVERDUE_DAYS = 90;

function InvoicesPage() {
  const { hasAnyRole, user } = useAuth();
  const { activeCompany } = useCompany();
  const canCreate = hasAnyRole(["admin", "sales"]) && !activeCompany?.code.endsWith("_MGMT");
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [partyId, setPartyId] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState("");
  const [supply, setSupply] = useState<"" | "intra" | "inter">("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<Item[]>([
    { description: "", quantity: 1, unit_price: 0, hsn_code: "", tax_rate: 18 },
  ]);
  const [blockMsg, setBlockMsg] = useState<{ title: string; reason: string } | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const today = new Date();
  const [exportYear, setExportYear] = useState(today.getFullYear());
  const [exportMonth, setExportMonth] = useState(today.getMonth() + 1);
  const [supplierGstin, setSupplierGstin] = useState("");
  const [supplierState, setSupplierState] = useState("");
  const [exporting, setExporting] = useState(false);
  const [payInv, setPayInv] = useState<InvoiceRow | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    const gstin = activeCompany?.gstin?.trim().toUpperCase() ?? "";
    setSupplierGstin(gstin);
    setSupplierState(/^\d{2}/.test(gstin) ? gstin.slice(0, 2) : "");
  }, [activeCompany?.id, activeCompany?.gstin]);

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["invoices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select(
          "id, invoice_number, invoice_date, due_date, total_amount, paid_amount, status, party_id",
        )
        .order("invoice_date", { ascending: false });
      if (error) throw error;

      const invoiceIds = (data ?? []).map((inv) => inv.id);
      if (invoiceIds.length === 0) return [] as InvoiceRow[];

      const { data: bills, error: billsError } = await supabase
        .from("bills")
        .select("id, source_invoice_id, original_amount")
        .in("source_invoice_id", invoiceIds);
      if (billsError) throw billsError;

      const billIds = (bills ?? []).map((b) => b.id);
      const allocationsByBill = new Map<string, number>();
      if (billIds.length > 0) {
        const { data: allocations, error: allocationError } = await supabase
          .from("bill_allocations")
          .select("bill_id, amount, effect")
          .in("bill_id", billIds);
        if (allocationError) throw allocationError;
        for (const row of allocations ?? []) {
          const current = allocationsByBill.get(row.bill_id) ?? 0;
          allocationsByBill.set(row.bill_id, current + Number(row.amount) * Number(row.effect));
        }
      }

      const billByInvoice = new Map((bills ?? []).map((bill) => [bill.source_invoice_id, bill]));
      return (data ?? []).map((inv) => {
        const bill = billByInvoice.get(inv.id);
        const applied = bill ? (allocationsByBill.get(bill.id) ?? 0) : Number(inv.paid_amount ?? 0);
        const outstanding = bill
          ? Math.max(0, Number(bill.original_amount) - applied)
          : Math.max(0, Number(inv.total_amount) - Number(inv.paid_amount ?? 0));
        return { ...inv, paid_amount: Number(inv.total_amount) - outstanding };
      }) as InvoiceRow[];
    },
  });

  const { data: parties = [] } = useQuery({
    queryKey: ["parties-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("parties")
        .select("id, name, credit_limit")
        .order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; credit_limit: number }[];
    },
  });

  const partyMap = new Map(parties.map((p) => [p.id, p]));

  const subtotal = items.reduce(
    (s, i) => s + (Number(i.quantity) || 0) * (Number(i.unit_price) || 0),
    0,
  );
  const tax = items.reduce((s, i) => {
    const lineBase = (Number(i.quantity) || 0) * (Number(i.unit_price) || 0);
    return s + (lineBase * (Number(i.tax_rate) || 0)) / 100;
  }, 0);
  const cgst = supply === "intra" ? tax / 2 : 0;
  const sgst = supply === "intra" ? tax - cgst : 0;
  const igst = supply === "inter" ? tax : 0;
  const total = subtotal + tax;

  const resetForm = () => {
    setPartyId("");
    setInvoiceDate(new Date().toISOString().slice(0, 10));
    setDueDate("");
    setNotes("");
    setItems([{ description: "", quantity: 1, unit_price: 0, hsn_code: "", tax_rate: 18 }]);
  };

  const checkBlock = async (pid: string, newTotal: number) => {
    const { data, error } = await supabase
      .from("party_outstanding")
      .select("outstanding, oldest_unpaid_date")
      .eq("party_id", pid)
      .maybeSingle();
    if (error) throw error;
    const out = Number(data?.outstanding ?? 0);
    const limit = partyMap.get(pid)?.credit_limit ?? CREDIT_LIMIT_HARD;
    const projected = out + newTotal;
    if (projected >= limit) {
      return {
        title: "Credit limit exceeded",
        reason: `Current outstanding ${inr(out)} + new invoice ${inr(newTotal)} = ${inr(projected)} which meets or exceeds the credit limit of ${inr(limit)}.`,
      };
    }
    if (
      out >= OVERDUE_THRESHOLD &&
      data?.oldest_unpaid_date &&
      daysBetween(data.oldest_unpaid_date) > OVERDUE_DAYS
    ) {
      return {
        title: "Overdue payments",
        reason: `Party has ${inr(out)} outstanding with the oldest invoice from ${formatDate(data.oldest_unpaid_date)} (${daysBetween(data.oldest_unpaid_date)} days). Clear overdue invoices first.`,
      };
    }
    return null;
  };

  const createInvoiceFn = useServerFn(createInvoice);
  const recordInvoiceReceiptFn = useServerFn(recordInvoiceReceipt);
  const reverseInvoiceFn = useServerFn(reverseInvoice);
  const notifyCustomer = useServerFn(notifyCustomerEvent);
  const create = useMutation({
    mutationFn: async () => {
      if (!partyId) throw new Error("Select a party");
      if (items.some((i) => !i.description.trim()))
        throw new Error("All line items need a description");
      if (items.some((i) => !Number.isFinite(Number(i.quantity)) || Number(i.quantity) <= 0))
        throw new Error("Every line must have a positive quantity");
      if (items.some((i) => !Number.isFinite(Number(i.unit_price)) || Number(i.unit_price) < 0))
        throw new Error("Every line must have a valid non-negative unit price");
      if (tax > 0 && !supply)
        throw new Error("Select intra-state or inter-state tax treatment before creating the invoice");

      return createInvoiceFn({
        data: {
          party_id: partyId,
          invoice_date: invoiceDate,
          due_date: dueDate || null,
          notes: notes || null,
          supply: supply || null,
          lines: items.map((i) => ({
            description: i.description,
            quantity: Number(i.quantity),
            unit_price: Number(i.unit_price),
            hsn_code: i.hsn_code || null,
            tax_rate: Number(i.tax_rate) || 0,
          })),
        },
      });
    },
    onSuccess: async (res) => {
      toast.success("Invoice created and posted.");
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["party-outstanding"] });
      const savedParty = partyId;
      setOpen(false);
      resetForm();
      try {
        const r = await notifyCustomer({
          data: { party_id: savedParty, event: "invoice.issued", ref_id: res.id },
        });
        if (r?.ok) toast.success("Customer notified via WhatsApp with invoice link");
      } catch {
        /* non-fatal */
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const recordPayment = useMutation({
    mutationFn: async () => {
      if (!payInv) throw new Error("No invoice selected");
      const amt = Number(payAmount);
      if (!amt || amt <= 0) throw new Error("Enter a payment amount greater than zero");
      const newPaid = Number(payInv.paid_amount) + amt;
      if (newPaid > Number(payInv.total_amount) + 0.01)
        throw new Error("Payment exceeds invoice total");
      const status: InvoiceRow["status"] =
        newPaid >= Number(payInv.total_amount) - 0.01 ? "paid" : "partial";
      await recordInvoiceReceiptFn({
        data: {
          invoiceId: payInv.id,
          amount: amt,
          idempotencyKey: `receipt:${payInv.id}:${newPaid}`,
        },
      });
      return { inv: payInv, amt, status };
    },
    onSuccess: async (res) => {
      toast.success("Payment recorded");
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["dash-outstanding"] });
      setPayInv(null);
      setPayAmount("");
      if (res && res.status === "paid") {
        try {
          const r = await notifyCustomer({
            data: {
              party_id: res.inv.party_id,
              event: "invoice.paid",
              ref_id: res.inv.id,
            },
          });
          if (r?.ok) toast.success("Customer notified via WhatsApp");
        } catch {
          /* non-fatal */
        }
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelInvoice = useMutation({
    mutationFn: async (inv: InvoiceRow) => {
      await reverseInvoiceFn({
        data: { invoiceId: inv.id, idempotencyKey: `cancel:${inv.id}` },
      });
    },
    onSuccess: () => {
      toast.success("Invoice cancelled");
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["dash-outstanding"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleExport = async () => {
    const gstin = supplierGstin.trim().toUpperCase();
    const stateCode = supplierState.trim();
    if (!/^\d{2}[A-Z0-9]{13}$/.test(gstin)) {
      toast.error("Configure or enter a valid 15-character GSTIN");
      return;
    }
    if (!/^\d{2}$/.test(stateCode)) {
      toast.error("Configure the company GSTIN so its state code can be determined");
      return;
    }
    setExporting(true);
    try {
      const start = new Date(Date.UTC(exportYear, exportMonth - 1, 1)).toISOString().slice(0, 10);
      const end = new Date(Date.UTC(exportYear, exportMonth, 1)).toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("invoices")
        .select(
          "id, invoice_number, invoice_date, total_amount, subtotal, tax_amount, party_id, invoice_items(description, quantity, unit_price, amount, hsn_code, tax_rate)",
        )
        .neq("status", "cancelled")
        .gte("invoice_date", start)
        .lt("invoice_date", end);
      if (error) throw error;
      const { data: partyData, error: pErr } = await supabase
        .from("parties")
        .select("id, name, gstin, state_code");
      if (pErr) throw pErr;
      if (!data || data.length === 0) {
        toast.error("No invoices found for this period");
        return;
      }
      const json = buildGstr1Json({
        gstin: supplierGstin.trim().toUpperCase(),
        year: exportYear,
        month: exportMonth,
        invoices: data as never,
        parties: partyData as never,
        supplierStateCode: supplierState,
      });
      downloadJson(
        `gstr1_${supplierGstin.trim().toUpperCase()}_${String(exportMonth).padStart(2, "0")}${exportYear}.json`,
        json,
      );
      toast.success(`Exported ${data.length} invoice(s)`);
      setExportOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Invoices"
        description="Create invoices with automatic credit-limit and overdue blocking."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <AiInsightButton topic="receivables" label="Analyze receivables" />
            {hasAnyRole(["admin", "sales"]) && (
              <Button variant="outline" onClick={() => setExportOpen(true)}>
                <FileDown className="h-4 w-4 mr-1" />
                Export GSTR-1 JSON
              </Button>
            )}
            {canCreate && (
              <Button
                onClick={() => {
                  resetForm();
                  setOpen(true);
                }}
              >
                <Plus className="h-4 w-4 mr-1" />
                New Invoice
              </Button>
            )}
          </div>
        }
      />

      <PageBody>
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Party</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : invoices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                      No invoices yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  invoices.map((inv) => {
                    const canManage = hasAnyRole(["admin", "sales"]);
                    const closed = inv.status === "paid" || inv.status === "cancelled";
                    return (
                      <TableRow key={inv.id}>
                        <TableCell className="font-medium">{inv.invoice_number}</TableCell>
                        <TableCell>{partyMap.get(inv.party_id)?.name ?? "—"}</TableCell>
                        <TableCell>{formatDate(inv.invoice_date)}</TableCell>
                        <TableCell>{formatDate(inv.due_date)}</TableCell>
                        <TableCell className="text-right font-medium">
                          {inr(inv.total_amount)}
                        </TableCell>
                        <TableCell className="text-right">{inr(inv.paid_amount)}</TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              inv.status === "paid"
                                ? "secondary"
                                : inv.status === "cancelled"
                                  ? "outline"
                                  : "default"
                            }
                            className="capitalize"
                          >
                            {inv.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              title="Print preview"
                              onClick={() => setPreviewUrl(`/print/invoice/${inv.id}`)}
                            >
                              <Printer className="h-4 w-4" />
                            </Button>
                            {canManage && !closed && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button size="icon" variant="ghost" className="h-8 w-8">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    onClick={() => {
                                      setPayInv(inv);
                                      setPayAmount(
                                        String(
                                          Math.max(
                                            0,
                                            Number(inv.total_amount) - Number(inv.paid_amount),
                                          ),
                                        ),
                                      );
                                    }}
                                  >
                                    <IndianRupee className="h-4 w-4 mr-2" />
                                    Record payment
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onClick={() => {
                                      if (confirm(`Cancel invoice ${inv.invoice_number}?`))
                                        cancelInvoice.mutate(inv);
                                    }}
                                  >
                                    <XCircle className="h-4 w-4 mr-2" />
                                    Cancel invoice
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </PageBody>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Invoice</DialogTitle>
            <DialogDescription>
              Set HSN/SAC and the applicable GST rate for each line. Credit checks run on save.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">Party *</Label>
              <Select value={partyId} onValueChange={setPartyId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select party" />
                </SelectTrigger>
                <SelectContent>
                  {parties.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">Invoice Date</Label>
                <Input
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">Due Date</Label>
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-medium">Line Items</Label>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setItems([
                      ...items,
                      { description: "", quantity: 1, unit_price: 0, hsn_code: "", tax_rate: 18 },
                    ])
                  }
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add
                </Button>
              </div>
              <div className="space-y-2">
                {items.map((it, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-start">
                    <Input
                      className="col-span-12 sm:col-span-5"
                      placeholder="Description"
                      value={it.description}
                      onChange={(e) =>
                        setItems(
                          items.map((x, i) =>
                            i === idx ? { ...x, description: e.target.value } : x,
                          ),
                        )
                      }
                    />
                    <Input
                      className="col-span-6 sm:col-span-2"
                      placeholder="HSN/SAC"
                      inputMode="numeric"
                      value={it.hsn_code}
                      onChange={(e) =>
                        setItems(
                          items.map((x, i) =>
                            i === idx ? { ...x, hsn_code: e.target.value.replace(/\D/g, "") } : x,
                          ),
                        )
                      }
                    />
                    <Input
                      className="col-span-3 sm:col-span-1"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Qty"
                      value={it.quantity}
                      onChange={(e) =>
                        setItems(
                          items.map((x, i) =>
                            i === idx ? { ...x, quantity: Number(e.target.value) } : x,
                          ),
                        )
                      }
                    />
                    <Input
                      className="col-span-6 sm:col-span-2"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Unit ₹"
                      value={it.unit_price}
                      onChange={(e) =>
                        setItems(
                          items.map((x, i) =>
                            i === idx ? { ...x, unit_price: Number(e.target.value) } : x,
                          ),
                        )
                      }
                    />
                    <Input
                      className="col-span-3 sm:col-span-1"
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      placeholder="GST %"
                      value={it.tax_rate}
                      onChange={(e) =>
                        setItems(
                          items.map((x, i) =>
                            i === idx ? { ...x, tax_rate: Number(e.target.value) } : x,
                          ),
                        )
                      }
                    />
                    <Button
                      className="col-span-3 sm:col-span-1"
                      size="icon"
                      variant="ghost"
                      title="Remove line"
                      aria-label={"Remove line " + (idx + 1)}
                      onClick={() =>
                        setItems(items.length > 1 ? items.filter((_, i) => i !== idx) : items)
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">Notes</Label>
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>

            <div className="rounded-md border bg-muted/40 p-3 space-y-1 text-sm">
              <Row label="Subtotal" value={inr(subtotal)} />
              <Row label="GST" value={inr(tax)} />
              <Label className="text-xs text-muted-foreground">Tax split</Label>
              <Select
                value={supply || "unset"}
                onValueChange={(value) =>
                  setSupply(value === "unset" ? "" : (value as "intra" | "inter"))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose before posting tax" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unset">Not selected — tax will not be posted</SelectItem>
                  <SelectItem value="intra">Intra-state CGST + SGST</SelectItem>
                  <SelectItem value="inter">Inter-state IGST</SelectItem>
                </SelectContent>
              </Select>
              <div className="border-t pt-1 mt-1">
                <Row label="Total" value={inr(total)} bold />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => create.mutate()} disabled={create.isPending}>
              {create.isPending ? "Creating…" : "Create Invoice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!blockMsg} onOpenChange={(o) => !o && setBlockMsg(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Ban className="h-5 w-5" />
              Invoice Blocked
            </DialogTitle>
          </DialogHeader>
          {blockMsg && (
            <div className="space-y-3">
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-sm">{blockMsg.title}</p>
                    <p className="text-sm text-muted-foreground mt-1">{blockMsg.reason}</p>
                  </div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Collect payment or contact an admin to override before creating new invoices for
                this party.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setBlockMsg(null)}>Got it</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Export GSTR-1 JSON</DialogTitle>
            <DialogDescription>
              Generates a GSTR-1 JSON file for the selected month. Upload it on the GST portal via
              the Returns Offline Tool.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">Supplier GSTIN *</Label>
              <Input
                placeholder="e.g. 29ABCDE1234F1Z5"
                value={supplierGstin}
                maxLength={15}
                onChange={(e) => setSupplierGstin(e.target.value.toUpperCase())}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">State code</Label>
                <Input
                  placeholder="29"
                  value={supplierState}
                  maxLength={2}
                  onChange={(e) => setSupplierState(e.target.value.replace(/\D/g, ""))}
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">Month</Label>
                <Select
                  value={String(exportMonth)}
                  onValueChange={(v) => setExportMonth(Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                      <SelectItem key={m} value={String(m)}>
                        {new Date(2000, m - 1, 1).toLocaleString("en-IN", { month: "long" })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">Year</Label>
              <Input
                type="number"
                min="2020"
                max="2100"
                value={exportYear}
                onChange={(e) => setExportYear(Number(e.target.value))}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Invoices with a valid party GSTIN are exported as B2B; the rest are aggregated as
              B2CS. Cancelled invoices are excluded.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExportOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleExport} disabled={exporting}>
              {exporting ? "Generating…" : "Download JSON"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!payInv}
        onOpenChange={(o) => {
          if (!o) {
            setPayInv(null);
            setPayAmount("");
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            <DialogDescription>
              {payInv && (
                <>
                  Invoice <span className="font-medium">{payInv.invoice_number}</span> · Balance{" "}
                  <span className="font-medium">
                    {inr(Number(payInv.total_amount) - Number(payInv.paid_amount))}
                  </span>
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">Amount received (₹)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setPayInv(null);
                setPayAmount("");
              }}
            >
              Cancel
            </Button>
            <Button onClick={() => recordPayment.mutate()} disabled={recordPayment.isPending}>
              {recordPayment.isPending ? "Saving…" : "Record Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PrintPreviewModal
        url={previewUrl}
        title="Invoice Preview"
        onClose={() => setPreviewUrl(null)}
      />
    </>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${bold ? "font-semibold text-base" : ""}`}>
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}
