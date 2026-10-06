import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader, PageBody } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sb } from "@/lib/accounting";
import { useState } from "react";
import { toast } from "sonner";
import { Lock, Unlock } from "lucide-react";

export const Route = createFileRoute("/_app/accounting/periods")({
  component: PeriodsPage,
});

type FY = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
  is_locked: boolean;
};

function PeriodsPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: "", start_date: "", end_date: "" });

  const q = useQuery({
    queryKey: ["financial_years"],
    queryFn: async () => {
      const { data, error } = await sb
        .from("financial_years")
        .select("*")
        .order("start_date", { ascending: false });
      if (error) throw error;
      return data as FY[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await sb.from("financial_years").insert(form);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Financial year created");
      setForm({ name: "", start_date: "", end_date: "" });
      qc.invalidateQueries({ queryKey: ["financial_years"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleLock = useMutation({
    mutationFn: async ({ id, is_locked }: { id: string; is_locked: boolean }) => {
      const { error } = await sb.from("financial_years").update({ is_locked }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast.success(v.is_locked ? "Period locked" : "Period unlocked");
      qc.invalidateQueries({ queryKey: ["financial_years"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader
        title="Financial Years"
        description="Define periods and lock them after returns are filed."
      />
      <PageBody>
        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
              <div>
                <Label>Name</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="FY 2025-26"
                />
              </div>
              <div>
                <Label>Start</Label>
                <Input
                  type="date"
                  value={form.start_date}
                  onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                />
              </div>
              <div>
                <Label>End</Label>
                <Input
                  type="date"
                  value={form.end_date}
                  onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                />
              </div>
              <Button
                onClick={() => create.mutate()}
                disabled={!form.name || !form.start_date || !form.end_date}
              >
                Add Period
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="mt-4 space-y-2">
          {(q.data ?? []).map((fy) => (
            <Card key={fy.id}>
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <div className="font-semibold">
                    {fy.name}{" "}
                    {fy.is_current && <span className="text-xs ml-2 text-primary">(Current)</span>}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {fy.start_date} → {fy.end_date}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-sm px-2 py-1 rounded ${fy.is_locked ? "bg-destructive/10 text-destructive" : "bg-muted"}`}
                  >
                    {fy.is_locked ? "Locked" : "Open"}
                  </span>
                  <Button
                    size="sm"
                    variant={fy.is_locked ? "outline" : "destructive"}
                    onClick={() => toggleLock.mutate({ id: fy.id, is_locked: !fy.is_locked })}
                  >
                    {fy.is_locked ? (
                      <>
                        <Unlock className="h-4 w-4 mr-1" /> Unlock
                      </>
                    ) : (
                      <>
                        <Lock className="h-4 w-4 mr-1" /> Lock
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {q.data?.length === 0 && (
            <p className="text-sm text-muted-foreground p-4">No financial years yet.</p>
          )}
        </div>
      </PageBody>
    </>
  );
}
