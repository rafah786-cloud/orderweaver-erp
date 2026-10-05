import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader, PageBody } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { useState } from "react";
import { sb } from "@/lib/accounting";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/gst/hsn")({
  component: HsnPage,
});

type Hsn = {
  id: string;
  code: string;
  description: string;
  type: string;
  default_tax_rate: number;
  is_active: boolean;
};

function HsnPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    code: "",
    description: "",
    type: "HSN",
    default_tax_rate: 18,
  });

  const q = useQuery({
    queryKey: ["hsn_codes"],
    queryFn: async () => {
      const { data, error } = await sb.from("hsn_codes").select("*").order("code");
      if (error) throw error;
      return data as Hsn[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await sb.from("hsn_codes").insert(form);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("HSN code added");
      qc.invalidateQueries({ queryKey: ["hsn_codes"] });
      setOpen(false);
      setForm({ code: "", description: "", type: "HSN", default_tax_rate: 18 });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("hsn_codes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["hsn_codes"] });
    },
  });

  const filtered = (q.data ?? []).filter(
    (h) =>
      !search ||
      h.code.toLowerCase().includes(search.toLowerCase()) ||
      h.description.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <>
      <PageHeader
        title="HSN / SAC Codes"
        description="Master of HSN (goods) and SAC (services) codes with default GST rates."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-1" /> Add Code
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add HSN / SAC Code</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Type</label>
                  <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="HSN">HSN (Goods)</SelectItem>
                      <SelectItem value="SAC">SAC (Services)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Code</label>
                  <Input
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value })}
                    placeholder="e.g. 9404"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Description</label>
                  <Input
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">
                    Default tax rate (%)
                  </label>
                  <Input
                    type="number"
                    value={form.default_tax_rate}
                    onChange={(e) => setForm({ ...form, default_tax_rate: Number(e.target.value) })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => create.mutate()}
                  disabled={!form.code || !form.description || create.isPending}
                >
                  Save
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />
      <PageBody>
        <div className="mb-4 max-w-md">
          <Input
            placeholder="Search code or description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">Type</TableHead>
                  <TableHead className="w-32">Code</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-24 text-right">Rate</TableHead>
                  <TableHead className="w-16"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell>
                      <Badge variant="outline">{h.type}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{h.code}</TableCell>
                    <TableCell className="text-sm">{h.description}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">
                      {h.default_tax_rate}%
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => del.mutate(h.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                      No codes.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </PageBody>
    </>
  );
}
