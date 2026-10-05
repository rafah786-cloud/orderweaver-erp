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
import { sb, type Godown } from "@/lib/inventory";
import { toast } from "sonner";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/_app/inventory/godowns")({ component: GodownsPage });

function GodownsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", code: "", address: "" });

  const q = useQuery({
    queryKey: ["godowns"],
    queryFn: async () => {
      const { data, error } = await sb.from("godowns").select("*").order("name");
      if (error) throw error;
      return data as Godown[];
    },
  });

  const save = async () => {
    if (!form.name.trim()) {
      toast.error("Name required");
      return;
    }
    const { error } = await sb.from("godowns").insert({
      name: form.name,
      code: form.code || null,
      address: form.address || null,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Godown created");
    setOpen(false);
    setForm({ name: "", code: "", address: "" });
    qc.invalidateQueries({ queryKey: ["godowns"] });
  };

  return (
    <>
      <PageHeader
        title="Godowns"
        description={`${q.data?.length ?? 0} godowns`}
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1" /> New Godown
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New Godown</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Name</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Code</Label>
                  <Input
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Address</Label>
                  <Input
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                  />
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
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b">
                <tr className="text-left">
                  <th className="px-4 py-2.5">Name</th>
                  <th className="px-4 py-2.5">Code</th>
                  <th className="px-4 py-2.5">Address</th>
                  <th className="px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(q.data ?? []).map((g) => (
                  <tr key={g.id} className="hover:bg-muted/40">
                    <td className="px-4 py-2">{g.name}</td>
                    <td className="px-4 py-2 text-muted-foreground">{g.code ?? "—"}</td>
                    <td className="px-4 py-2 text-muted-foreground">{g.address ?? "—"}</td>
                    <td className="px-4 py-2 text-xs">{g.is_active ? "Active" : "Inactive"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </PageBody>
    </>
  );
}
