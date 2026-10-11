import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader, PageBody } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Printer, RefreshCw, ShieldCheck, Copy, Ban, RotateCcw, AlertTriangle } from "lucide-react";
import {
  listProductionPrintDevices, registerProductionPrintDevice, deactivateProductionPrintDevice,
  retryProductionPrintJob,
} from "@/lib/print-bridge.functions";

export const Route = createFileRoute("/_app/print-bridge")({ component: PrintBridgePage });

type Device = { id: string; name: string; is_active: boolean; last_seen_at: string | null; created_at: string };
type PrintJob = {
  id: string; job_type: string; status: string; attempts: number; created_at: string;
  completed_at: string | null; last_error: string | null; sales_order_id: string; payload: any; parent_job_id: string | null;
};

const humanStatus: Record<string, string> = {
  queued: "Queued", claimed: "Claimed by PC", spooled: "Submitted to Windows", failed: "Failed", needs_review: "Needs inspection",
};

function PrintBridgePage() {
  const { hasAnyRole } = useAuth();
  const isAdmin = hasAnyRole(["admin"]);
  const canOperate = hasAnyRole(["admin", "production"]);
  const qc = useQueryClient();
  const listDevicesFn = useServerFn(listProductionPrintDevices);
  const registerDeviceFn = useServerFn(registerProductionPrintDevice);
  const deactivateDeviceFn = useServerFn(deactivateProductionPrintDevice);
  const retryJobFn = useServerFn(retryProductionPrintJob);
  const [pairOpen, setPairOpen] = useState(false);
  const [deviceName, setDeviceName] = useState("Factory Receipt Printer");
  const [newCredential, setNewCredential] = useState<{ id: string; name: string; token: string } | null>(null);

  const devicesQuery = useQuery({
    queryKey: ["print-bridge-devices"],
    enabled: isAdmin,
    queryFn: () => listDevicesFn(),
  });
  const jobsQuery = useQuery({
    queryKey: ["production-print-jobs"],
    enabled: canOperate,
    refetchInterval: 10000,
    queryFn: async () => {
      const db: any = supabase;
      const { data, error } = await db.from("production_print_jobs")
        .select("id,job_type,status,attempts,created_at,completed_at,last_error,sales_order_id,payload,parent_job_id")
        .order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return (data ?? []) as PrintJob[];
    },
  });

  const register = useMutation({
    mutationFn: () => registerDeviceFn({ data: { name: deviceName } }),
    onSuccess: (device) => {
      setNewCredential(device);
      setPairOpen(false);
      void qc.invalidateQueries({ queryKey: ["print-bridge-devices"] });
      toast.success("Printer device paired", { description: "Copy the token now. It will not be shown again." });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const deactivate = useMutation({
    mutationFn: (deviceId: string) => deactivateDeviceFn({ data: { device_id: deviceId } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["print-bridge-devices"] });
      toast.success("Printer device deactivated");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const retry = useMutation({
    mutationFn: (input: { job_id: string; force_review: boolean }) => retryJobFn({ data: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["production-print-jobs"] });
      toast.success("A new print attempt has been queued");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const copyToken = async () => {
    if (!newCredential) return;
    try {
      await navigator.clipboard.writeText(newCredential.token);
      toast.success("Pairing token copied");
    } catch {
      toast.error("Clipboard access was blocked. Copy the token from the field manually.");
    }
  };

  const manualRetry = (job: PrintJob) => {
    const uncertain = job.status === "needs_review" || job.status === "spooled" || job.status === "claimed";
    const message = uncertain
      ? "This job may already have printed. Inspect the physical printer and Windows queue first. Create a separate reprint job anyway?"
      : "The agent reported a print failure. Check the Windows queue and the paper output before retrying, to avoid a duplicate slip. Create a new print job?";
    if (!window.confirm(message)) return;
    retry.mutate({ job_id: job.id, force_review: uncertain });
  };

  return (
    <>
      <PageHeader
        title="Factory Print Bridge"
        description="Durable Production receipt queue and the local Windows agent used to reach the factory printer."
        actions={<Button variant="outline" onClick={() => { void jobsQuery.refetch(); if (isAdmin) void devicesQuery.refetch(); }} disabled={jobsQuery.isFetching}><RefreshCw className={"mr-2 h-4 w-4 " + (jobsQuery.isFetching ? "animate-spin" : "")} /> Refresh</Button>}
      />
      <PageBody>
        <div className="mb-4 grid gap-3 md:grid-cols-3">
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Queued receipts</div><div className="mt-1 text-2xl font-semibold">{(jobsQuery.data ?? []).filter((job) => job.status === "queued").length}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Need attention</div><div className="mt-1 text-2xl font-semibold">{(jobsQuery.data ?? []).filter((job) => ["failed", "needs_review", "claimed"].includes(job.status)).length}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Print confirmation</div><div className="mt-1 text-sm">“Submitted to Windows” means the spooler accepted the slip, not that paper output was physically verified.</div></CardContent></Card>
        </div>

        {isAdmin && (
          <Card className="mb-4">
            <CardContent className="p-0">
              <div className="flex items-center justify-between gap-3 border-b p-4">
                <div><h2 className="font-semibold">Paired Windows devices</h2><p className="mt-1 text-xs text-muted-foreground">Device secrets are shown once and stored as hashes in the ERP.</p></div>
                <Button size="sm" onClick={() => { setDeviceName("Factory Receipt Printer"); setPairOpen(true); }}><Printer className="mr-2 h-4 w-4" /> Pair device</Button>
              </div>
              {devicesQuery.isLoading ? <div className="p-5 text-sm text-muted-foreground">Loading paired devices…</div>
                : devicesQuery.isError ? <div className="p-5 text-sm text-destructive">Could not load paired devices.</div>
                : (devicesQuery.data ?? []).length === 0 ? <div className="p-5 text-sm text-muted-foreground">No devices paired yet.</div>
                : <div className="divide-y">{(devicesQuery.data as Device[]).map((device) => (
                  <div key={device.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div><div className="font-medium">{device.name}</div><div className="mt-1 text-xs text-muted-foreground">Last contact: {device.last_seen_at ? new Date(device.last_seen_at).toLocaleString() : "Never"} · Created {new Date(device.created_at).toLocaleDateString()}</div></div>
                    <div className="flex items-center gap-2"><Badge variant={device.is_active ? "secondary" : "outline"}>{device.is_active ? "Active" : "Inactive"}</Badge>{device.is_active && <Button size="sm" variant="outline" disabled={deactivate.isPending} onClick={() => { if (window.confirm("Deactivate " + device.name + "? The agent will no longer be able to claim jobs.")) deactivate.mutate(device.id); }}><Ban className="mr-1.5 h-3.5 w-3.5" /> Deactivate</Button>}</div>
                  </div>
                ))}</div>}
            </CardContent>
          </Card>
        )}

        {canOperate && (
          <Card>
            <CardContent className="p-0">
              <div className="flex items-center justify-between border-b p-4"><div><h2 className="font-semibold">Production receipt queue</h2><p className="mt-1 text-xs text-muted-foreground">Created transactionally with each saved Sales Order. Printer outages do not undo orders.</p></div><ShieldCheck className="h-5 w-5 text-muted-foreground" /></div>
              {jobsQuery.isError ? <div className="p-5 text-sm text-destructive">Could not load the print queue.</div>
                : jobsQuery.isLoading ? <div className="p-5 text-sm text-muted-foreground">Loading print jobs…</div>
                : (jobsQuery.data ?? []).length === 0 ? <div className="p-10 text-center text-sm text-muted-foreground">No receipt jobs yet. The next Sales Order will create one.</div>
                : <div className="divide-y">{(jobsQuery.data ?? []).map((job) => {
                  const payload = job.payload ?? {};
                  const customer = String(payload.customerName ?? "Customer");
                  const items = Array.isArray(payload.items) ? payload.items : [];
                  const needsConfirmation = ["needs_review", "spooled", "claimed"].includes(job.status);
                  return (
                    <div key={job.id} className="space-y-2 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div><div className="font-medium">{customer}</div><div className="mt-1 text-xs text-muted-foreground">{items.map((item: any) => String(item.item ?? "") + " × " + String(item.quantity ?? "")).join(" · ")}</div><div className="mt-1 text-xs text-muted-foreground">{new Date(job.created_at).toLocaleString()} · Attempt {job.attempts}</div></div>
                        <div className="flex flex-wrap items-center gap-2"><Badge variant={job.status === "spooled" ? "secondary" : job.status === "failed" || job.status === "needs_review" ? "destructive" : "outline"}>{humanStatus[job.status] ?? job.status}</Badge>
                          {["failed", "needs_review", "spooled", "claimed"].includes(job.status) && (
                            <Button size="sm" variant="outline" disabled={retry.isPending} onClick={() => manualRetry(job)}>
                              {needsConfirmation ? <AlertTriangle className="mr-1.5 h-3.5 w-3.5" /> : <RotateCcw className="mr-1.5 h-3.5 w-3.5" />}
                              {job.status === "failed" ? "Retry failed" : "Reprint after inspection"}
                            </Button>
                          )}
                        </div>
                      </div>
                      {job.last_error && <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">{job.last_error}</div>}
                    </div>
                  );
                })}</div>}
            </CardContent>
          </Card>
        )}

        <div className="mt-4 rounded-lg border p-4 text-sm text-muted-foreground">
          <div className="mb-1 font-medium text-foreground">First physical test is required</div>
          Pair the Windows PC, run the local agent interactively, and verify the exact receipt paper/driver before enabling unattended startup. The ERP can confirm that Windows accepted the print submission, but it cannot independently confirm that the printer physically delivered a slip.
        </div>
      </PageBody>

      <Dialog open={pairOpen} onOpenChange={setPairOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Pair a Windows print agent</DialogTitle><DialogDescription>Use one entry for each Windows PC that runs the agent. The printer itself must already be installed in Windows.</DialogDescription></DialogHeader>
          <div className="space-y-1.5"><Label>Device name</Label><Input value={deviceName} onChange={(e) => setDeviceName(e.target.value)} maxLength={120} /></div>
          <DialogFooter><Button variant="outline" onClick={() => setPairOpen(false)} disabled={register.isPending}>Cancel</Button><Button onClick={() => register.mutate()} disabled={register.isPending || !deviceName.trim()}>{register.isPending ? "Pairing…" : "Create one-time token"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!newCredential} onOpenChange={(open) => { if (!open) setNewCredential(null); }}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>Save this pairing token now</DialogTitle><DialogDescription>This token is displayed once. It is not stored in plaintext in the ERP. Save it in the Windows environment for the bridge agent.</DialogDescription></DialogHeader>
          {newCredential && <div className="space-y-3"><div><Label>Device ID</Label><Input value={newCredential.id} readOnly /></div><div><Label>Device token — private</Label><Input value={newCredential.token} readOnly /></div><Button variant="outline" className="w-full" onClick={() => void copyToken()}><Copy className="mr-2 h-4 w-4" /> Copy token</Button><div className="rounded-md border p-3 text-xs text-muted-foreground">The token cannot be retrieved later. If lost or exposed, deactivate this device and pair a replacement.</div></div>}
          <DialogFooter><Button onClick={() => setNewCredential(null)}>I have saved the token</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
