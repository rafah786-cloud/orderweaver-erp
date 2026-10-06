import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { PageHeader, PageBody } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { sb, type StockItem, type Godown, type StockMovementType } from "@/lib/inventory";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_app/inventory/journals")({ component: JournalsPage });

type Line = {
  stock_item_id: string;
  godown_id: string;
  movement_type: StockMovementType;
  quantity: number;
  rate: number;
};

function JournalsPage() {
  const navigate = useNavigate();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [narration, setNarration] = useState("");
  const [lines, setLines] = useState<Line[]>([
    { stock_item_id: "", godown_id: "", movement_type: "adjustment", quantity: 0, rate: 0 },
  ]);

  const itemsQ = useQuery({
    queryKey: ["stock_items_basic"],
    queryFn: async () => {
      const { data } = await sb.from("stock_items").select("id, name, unit").order("name");
      return (data ?? []) as Pick<StockItem, "id" | "name" | "unit">[];
    },
  });
  const godownsQ = useQuery({
    queryKey: ["godowns"],
    queryFn: async () => {
      const { data } = await sb.from("godowns").select("*").order("name");
      return (data ?? []) as Godown[];
    },
  });

  const setLine = (i: number, patch: Partial<Line>) => {
    setLines((arr) => arr.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  };

  const addLine = () =>
    setLines((a) => [
      ...a,
      { stock_item_id: "", godown_id: "", movement_type: "adjustment", quantity: 0, rate: 0 },
    ]);
  const removeLine = (i: number) => setLines((a) => a.filter((_, idx) => idx !== i));

  const save = async () => {
    const valid = lines.filter((l) => l.stock_item_id && l.quantity !== 0);
    if (valid.length === 0) {
      toast.error("Add at least one line");
      return;
    }

    const journalLines = valid.map((l) => ({
      stock_item_id: l.stock_item_id,
      from_godown_id: l.movement_type === "production_out" ? l.godown_id : null,
      to_godown_id: l.movement_type === "production_out" ? null : l.godown_id,
      movement_type: l.movement_type,
      quantity:
        l.movement_type === "adjustment"
          ? Number(l.quantity)
          : Math.abs(Number(l.quantity)),
      rate: Number(l.rate),
    }));

    try {
      // The database function owns the entire transaction: header, entries and
      // every stock movement either commit together or roll back together.
      // @ts-expect-error RPC type is generated after the migration is applied.
      const { data: journalId, error } = await sb.rpc("create_stock_journal", {
        p_date: date,
        p_narration: narration || null,
        p_lines: journalLines,
      });
      if (error) throw error;
      if (!journalId) throw new Error("Journal was not created");
      toast.success("Stock journal saved");
      navigate({ to: "/inventory/movements" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save stock journal");
    }
  };

  return (
    <>
      <PageHeader
        title="New Stock Journal"
        description="Adjust stock or record production consumption/output"
      />
      <PageBody>
        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Date</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div>
                <Label>Narration</Label>
                <Input
                  value={narration}
                  onChange={(e) => setNarration(e.target.value)}
                  placeholder="Optional"
                />
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-sm font-semibold">Lines</div>
              {lines.map((l, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-4">
                    <Label className="text-xs">Item</Label>
                    <Select
                      value={l.stock_item_id}
                      onValueChange={(v) => setLine(i, { stock_item_id: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select item" />
                      </SelectTrigger>
                      <SelectContent>
                        {itemsQ.data?.map((it) => (
                          <SelectItem key={it.id} value={it.id}>
                            {it.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-3">
                    <Label className="text-xs">Godown</Label>
                    <Select value={l.godown_id} onValueChange={(v) => setLine(i, { godown_id: v })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Godown" />
                      </SelectTrigger>
                      <SelectContent>
                        {godownsQ.data?.map((g) => (
                          <SelectItem key={g.id} value={g.id}>
                            {g.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs">Type</Label>
                    <Select
                      value={l.movement_type}
                      onValueChange={(v) => setLine(i, { movement_type: v as StockMovementType })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="adjustment">Adjustment</SelectItem>
                        <SelectItem value="production_in">Production In</SelectItem>
                        <SelectItem value="production_out">Production Out</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-1">
                    <Label className="text-xs">Qty</Label>
                    <Input
                      type="number"
                      value={l.quantity}
                      onChange={(e) => setLine(i, { quantity: Number(e.target.value) })}
                    />
                  </div>
                  <div className="col-span-1">
                    <Label className="text-xs">Rate</Label>
                    <Input
                      type="number"
                      value={l.rate}
                      onChange={(e) => setLine(i, { rate: Number(e.target.value) })}
                    />
                  </div>
                  <div className="col-span-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeLine(i)}
                      disabled={lines.length === 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addLine}>
                <Plus className="h-4 w-4 mr-1" /> Add line
              </Button>
            </div>
            <div className="flex justify-end">
              <Button onClick={save}>Save Journal</Button>
            </div>
          </CardContent>
        </Card>
      </PageBody>
    </>
  );
}
