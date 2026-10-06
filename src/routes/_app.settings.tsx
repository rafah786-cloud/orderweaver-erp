import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader, PageBody } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { createDevice, rotateDeviceKey, deleteDevice } from "@/lib/biometric.functions";
import { WhatsAppConfigCard } from "@/components/settings/WhatsAppConfigCard";
import { VelocityShippingCard } from "@/components/settings/VelocityShippingCard";
import { Trash2, KeyRound, Copy } from "lucide-react";

export const Route = createFileRoute("/_app/settings")({ component: SettingsPage });

function SettingsPage() {
  const { hasRole } = useAuth();
  if (!hasRole("admin")) {
    return (
      <>
        <PageHeader title="Settings" />
        <PageBody><Card><CardContent className="py-12 text-center text-muted-foreground">Admin only.</CardContent></Card></PageBody>
      </>
    );
  }
  return (
    <>
      <PageHeader title="Settings" description="Biometric devices, shift configuration, and WhatsApp messaging." />
      <PageBody>
        <div className="grid gap-6 lg:grid-cols-2">
          <DeviceCard />
          <ShiftCard />
          <WhatsAppConfigCard />
          <VelocityShippingCard />
        </div>
      </PageBody>
    </>
  );
}

function DeviceCard() {
  const qc = useQueryClient();
  const create = useServerFn(createDevice);
  const rotate = useServerFn(rotateDeviceKey);
  const del = useServerFn(deleteDevice);

  const [open, setOpen] = useState(false);
  const [showKey, setShowKey] = useState<string | null>(null);
  const [form, setForm] = useState({ device_id: "", name: "", ip_address: "", port: 4370, poll_interval_ms: 5000 });

  const { data: devices } = useQuery({
    queryKey: ["devices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("device_settings")
        .select("id, device_id, name, ip_address, port, poll_interval_ms, is_active, last_seen_at, created_at, updated_at")
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Biometric Devices</CardTitle>
        <Button size="sm" onClick={() => setOpen(true)}>Add Device</Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {(devices ?? []).length === 0 && <p className="text-sm text-muted-foreground">No devices configured.</p>}
        {(devices ?? []).map((d) => (
          <div key={d.id} className="border rounded-md p-3 flex items-start justify-between gap-3">
            <div className="text-sm">
              <div className="font-medium">{d.name} <span className="text-muted-foreground">({d.device_id})</span></div>
              <div className="text-muted-foreground">{d.ip_address}:{d.port} · poll {d.poll_interval_ms}ms</div>
              <div className="text-xs mt-1">
                {d.is_active ? <Badge variant="default">Active</Badge> : <Badge variant="secondary">Disabled</Badge>}
                {d.last_seen_at && <span className="ml-2 text-muted-foreground">Last seen {new Date(d.last_seen_at).toLocaleString()}</span>}
              </div>
            </div>
            <div className="flex gap-1">
              <Button size="icon" variant="ghost" title="Rotate key" onClick={async () => {
                const r = await rotate({ data: { id: d.id } });
                setShowKey(r.apiKey);
              }}><KeyRound className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" title="Delete" onClick={async () => {
                if (!confirm("Delete this device?")) return;
                await del({ data: { id: d.id } });
                qc.invalidateQueries({ queryKey: ["devices"] });
              }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
            </div>
          </div>
        ))}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Device</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Device ID</Label><Input value={form.device_id} onChange={(e) => setForm({ ...form, device_id: e.target.value })} placeholder="biometric-01" /></div>
            <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Main Entrance" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>IP Address</Label><Input value={form.ip_address} onChange={(e) => setForm({ ...form, ip_address: e.target.value })} placeholder="192.168.1.201" /></div>
              <div><Label>Port</Label><Input type="number" value={form.port} onChange={(e) => setForm({ ...form, port: Number(e.target.value) })} /></div>
            </div>
            <div><Label>Poll Interval (ms)</Label><Input type="number" value={form.poll_interval_ms} onChange={(e) => setForm({ ...form, poll_interval_ms: Number(e.target.value) })} /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={async () => {
              try {
                const r = await create({ data: { ...form, is_active: true } });
                setOpen(false);
                setForm({ device_id: "", name: "", ip_address: "", port: 4370, poll_interval_ms: 5000 });
                qc.invalidateQueries({ queryKey: ["devices"] });
                setShowKey(r.apiKey);
              } catch (e) { toast.error((e as Error).message); }
            }}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!showKey} onOpenChange={(o) => !o && setShowKey(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Device API Key</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Save this now — it won't be shown again. Paste into the sync service .env as <code>DEVICE_API_KEY</code>.</p>
          <div className="flex gap-2">
            <Input readOnly value={showKey ?? ""} />
            <Button size="icon" onClick={() => { navigator.clipboard.writeText(showKey ?? ""); toast.success("Copied"); }}><Copy className="h-4 w-4" /></Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function ShiftCard() {
  const qc = useQueryClient();
  const { data: shift } = useQuery({
    queryKey: ["shift"],
    queryFn: async () => {
      const { data, error } = await supabase.from("shift_settings").select("*").limit(1).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const [form, setForm] = useState<Record<string, string | number>>({});
  const v = (k: string, d: string | number) => (form[k] ?? shift?.[k as keyof typeof shift] ?? d) as string | number;

  return (
    <Card>
      <CardHeader><CardTitle>Shift & Payroll Rules</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Shift Start</Label><Input type="time" value={String(v("shift_start", "09:00"))} onChange={(e) => setForm({ ...form, shift_start: e.target.value })} /></div>
          <div><Label>Shift End</Label><Input type="time" value={String(v("shift_end", "18:00"))} onChange={(e) => setForm({ ...form, shift_end: e.target.value })} /></div>
          <div><Label>Late Grace (min)</Label><Input type="number" value={Number(v("late_grace_minutes", 10))} onChange={(e) => setForm({ ...form, late_grace_minutes: Number(e.target.value) })} /></div>
          <div><Label>Half-Day Below (hours)</Label><Input type="number" value={Number(v("half_day_hours", 4))} onChange={(e) => setForm({ ...form, half_day_hours: Number(e.target.value) })} /></div>
          <div><Label>Late Deduction %</Label><Input type="number" value={Number(v("late_deduction_pct", 0))} onChange={(e) => setForm({ ...form, late_deduction_pct: Number(e.target.value) })} /></div>
          <div><Label>Half-Day Deduction %</Label><Input type="number" value={Number(v("half_day_deduction_pct", 50))} onChange={(e) => setForm({ ...form, half_day_deduction_pct: Number(e.target.value) })} /></div>
          <div className="col-span-2"><Label>Working Days / Month</Label><Input type="number" value={Number(v("working_days_per_month", 26))} onChange={(e) => setForm({ ...form, working_days_per_month: Number(e.target.value) })} /></div>
        </div>
        <Button onClick={async () => {
          if (!shift) return;
          const { error } = await supabase.from("shift_settings").update(form as never).eq("id", shift.id);
          if (error) { toast.error(error.message); return; }
          toast.success("Saved");
          qc.invalidateQueries({ queryKey: ["shift"] });
        }}>Save</Button>
      </CardContent>
    </Card>
  );
}
