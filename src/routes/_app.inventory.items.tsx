import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { PageHeader, PageBody } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { sb, type StockItem, VALUATION_LABEL, type ValuationMethod } from "@/lib/inventory";
import { toast } from "sonner";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/_app/inventory/items")({ component: StockItemsPage });

function StockItemsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    code: "",
    unit: "pcs",
    hsn_code: "",
    gst_rate: 18,
    valuation_method: "weighted_avg" as ValuationMethod,
    reorder_level: 0,
    standard_cost: 0,
  });

  const itemsQ = useQuery({
    queryKey: ["stock_items"],
    queryFn: async () => {
      const { data, error } = await sb.from("stock_items").select("*").order("name");
      if (error) throw error;
      return data as StockItem[];
    },
  });

  const filtered = (itemsQ.data ?? []).filter(
    (i) =>
      !search.trim() ||
      i.name.toLowerCase().includes(search.toLowerCase()) ||
      i.code?.toLowerCase().includes(search.toLowerCase()),
  );

  const save = async () => {
    if (!form.name.trim()) {
      toast.error("Name required");
      return;
    }
    const { error } = await sb.from("stock_items").insert({
      name: form.name,
      code: form.code || null,
      unit: form.unit,
      hsn_code: form.hsn_code || null,
      gst_rate: Number(form.gst_rate),
      valuation_method: form.valuation_method,
      reorder_level: Number(form.reorder_level),
      standard_cost: Number(form.standard_cost),
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Stock item created");
    setOpen(false);
    setForm({
      name: "",
      code: "",
      unit: "pcs",
      hsn_code: "",
      gst_rate: 18,
      valuation_method: "weighted_avg",
      reorder_level: 0,
      standard_cost: 0,
    });
    qc.invalidateQueries({ queryKey: ["stock_items"] });
  };

  return (
    <>
      <PageHeader
        title="Stock Items"
        description={`${itemsQ.data?.length ?? 0} items`}
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1" /> New Item
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New Stock Item</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Name</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Code</Label>
                    <Input
                      value={form.code}
                      onChange={(e) => setForm({ ...form, code: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Unit</Label>
                    <Input
                      value={form.unit}
                      onChange={(e) => setForm({ ...form, unit: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>HSN Code</Label>
                    <Input
                      value={form.hsn_code}
                      onChange={(e) => setForm({ ...form, hsn_code: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>GST %</Label>
                    <Input
                      type="number"
                      value={form.gst_rate}
                      onChange={(e) => setForm({ ...form, gst_rate: Number(e.target.value) })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Reorder Level</Label>
                    <Input
                      type="number"
                      value={form.reorder_level}
                      onChange={(e) => setForm({ ...form, reorder_level: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <Label>Standard Cost</Label>
                    <Input
                      type="number"
                      value={form.standard_cost}
                      onChange={(e) => setForm({ ...form, standard_cost: Number(e.target.value) })}
                    />
                  </div>
                </div>
                <div>
                  <Label>Valuation Method</Label>
                  <Select
                    value={form.valuation_method}
                    onValueChange={(v) =>
                      setForm({ ...form, valuation_method: v as ValuationMethod })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(VALUATION_LABEL) as ValuationMethod[]).map((m) => (
                        <SelectItem key={m} value={m}>
                          {VALUATION_LABEL[m]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button className="w-full" onClick={save}>
                  Create
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        }
      />
      <PageBody>
        <div className="mb-4 max-w-md">
          <Input
            placeholder="Search items..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b">
                <tr className="text-left">
                  <th className="px-4 py-2.5">Name</th>
                  <th className="px-4 py-2.5">Code</th>
                  <th className="px-4 py-2.5">Unit</th>
                  <th className="px-4 py-2.5">HSN</th>
                  <th className="px-4 py-2.5 text-right">GST %</th>
                  <th className="px-4 py-2.5 text-right">Reorder</th>
                  <th className="px-4 py-2.5">Valuation</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((i) => (
                  <tr key={i.id} className="hover:bg-muted/40">
                    <td className="px-4 py-2">{i.name}</td>
                    <td className="px-4 py-2 text-muted-foreground">{i.code ?? "—"}</td>
                    <td className="px-4 py-2">{i.unit}</td>
                    <td className="px-4 py-2 text-muted-foreground">{i.hsn_code ?? "—"}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{i.gst_rate}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{i.reorder_level}</td>
                    <td className="px-4 py-2 text-xs">{VALUATION_LABEL[i.valuation_method]}</td>
                  </tr>
                ))}
                {filtered.length === 0 && !itemsQ.isLoading && (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-muted-foreground">
                      No items.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </PageBody>
    </>
  );
}
