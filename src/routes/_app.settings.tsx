import { formatDateTime } from "@/lib/format";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { createDevice, rotateDeviceKey, deleteDevice } from "@/lib/biometric.functions";
import { WhatsAppConfigCard } from "@/components/settings/WhatsAppConfigCard";
import { VelocityShippingCard } from "@/components/settings/VelocityShippingCard";
import { Trash2, KeyRound, Copy } from "lucide-react";
import { saveShiftSettings } from "@/lib/settings-admin.functions";

export const Route = createFileRoute("/_app/settings")({
  head: () => ({ meta: [
    { title: "Settings & Velocity Diagnostics | Mattress Maestro" },
    { name: "description", content: "Administrator settings and live Velocity shipping diagnostics for Mattress Maestro ERP." },
    { property: "og:title", content: "Mattress Maestro Administrator Settings" },
    { property: "og:description", content: "Manage ERP settings and check Velocity serviceability and shipping rates." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: SettingsPage,
});

function SettingsPage() {
  const { hasRole } = useAuth();
  if (!hasRole("admin")) {
    return (
      <>
        <PageHeader title="Settings" />
        <PageBody>
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Admin only.
            </CardContent>
          </Card>
        </PageBody>
      </>
    );
  }
  return (
    <>
      <PageHeader
        title="Settings"
        description="Biometric devices, shift configuration, and WhatsApp messaging."
      />
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
  const [deviceActionId, setDeviceActionId] = useState<string | null>(null);
  const [creatingDevice, setCreatingDevice] = useState(false);
  const [form, setForm] = useState({
    device_id: "",
    name: "",
    ip_address: "",
    port: 4370,
    poll_interval_ms: 5000,
  });

  const { data: devices, isLoading: devicesLoading, isError: devicesError, refetch: refetchDevices } = useQuery({
    queryKey: ["devices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("device_settings")
        .select(
          "id, device_id, name, ip_address, port, poll_interval_ms, is_active, last_seen_at, created_at, updated_at",
        )
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const validDeviceForm =
    /^[a-zA-Z0-9_-]{1,64}$/.test(form.device_id.trim()) &&
    form.name.trim().length > 0 &&
    form.name.trim().length <= 120 &&
    form.ip_address.trim().length > 0 &&
    Number.isInteger(form.port) &&
    form.port >= 1 && form.port <= 65535 &&
    Number.isInteger(form.poll_interval_ms) &&
    form.poll_interval_ms >= 1000 && form.poll_interval_ms <= 600000;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Biometric Devices</CardTitle>
        <Button size="sm" onClick={() => setOpen(true)}>
          Add Device
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {devicesLoading && <p role="status" className="text-sm text-muted-foreground">Loading device configuration…</p>}
        {devicesError && (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-2 text-sm text-destructive">
            <span>Device configuration could not be loaded. No settings have been changed.</span>
            <Button size="sm" variant="outline" onClick={() => void refetchDevices()}>Retry</Button>
          </div>
        )}
        {!devicesLoading && !devicesError && (devices ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">No devices configured.</p>
        )}
        {(devices ?? []).map((d) => (
          <div key={d.id} className="border rounded-md p-3 flex items-start justify-between gap-3">
            <div className="text-sm">
              <div className="font-medium">
                {d.name} <span className="text-muted-foreground">({d.device_id})</span>
              </div>
              <div className="text-muted-foreground">
                {d.ip_address}:{d.port} · poll {d.poll_interval_ms}ms
              </div>
              <div className="text-xs mt-1">
                {d.is_active ? (
                  <Badge variant="default">Active</Badge>
                ) : (
                  <Badge variant="secondary">Disabled</Badge>
                )}
                {d.last_seen_at && (
                  <span className="ml-2 text-muted-foreground">
                    Last seen {formatDateTime(d.last_seen_at, { seconds: true })}
                  </span>
                )}
              </div>
            </div>
            <div className="flex gap-1">
              <Button
                size="icon"
                variant="ghost"
                title="Rotate key"
                aria-label={`Rotate API key for ${d.name}`}
                disabled={deviceActionId !== null || creatingDevice}
                onClick={async () => {
                  if (!confirm("Rotate this device API key? The current sync service will stop authenticating until you update its DEVICE_API_KEY. Continue?")) return;
                  setDeviceActionId(d.id);
                  try {
                    const r = await rotate({ data: { id: d.id } });
                    setShowKey(r.apiKey);
                    toast.success("Device key rotated. Update the sync service configuration now.");
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : "Could not rotate the device key.");
                  } finally {
                    setDeviceActionId(null);
                  }
                }}
              >
                <KeyRound className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                title="Delete"
                aria-label={`Delete biometric device ${d.name}`}
                disabled={deviceActionId !== null || creatingDevice}
                onClick={async () => {
                  if (!confirm(`Delete biometric device "${d.name}"? Its future sync requests will no longer be accepted.`)) return;
                  setDeviceActionId(d.id);
                  try {
                    await del({ data: { id: d.id } });
                    await qc.invalidateQueries({ queryKey: ["devices"] });
                    toast.success("Biometric device deleted.");
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : "Could not delete the device.");
                  } finally {
                    setDeviceActionId(null);
                  }
                }}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </div>
        ))}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Device</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="device-id">Device ID</Label>
              <Input
                id="device-id"
                autoComplete="off"
                value={form.device_id}
                onChange={(e) => setForm({ ...form, device_id: e.target.value })}
                placeholder="biometric-01"
              />
            </div>
            <div>
              <Label htmlFor="device-name">Name</Label>
              <Input
                id="device-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Main Entrance"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="device-ip">IP Address / Host</Label>
                <Input
                  id="device-ip"
                  autoComplete="off"
                  value={form.ip_address}
                  onChange={(e) => setForm({ ...form, ip_address: e.target.value })}
                  placeholder="192.168.1.201"
                />
              </div>
              <div>
                <Label htmlFor="device-port">Port</Label>
                <Input
                  id="device-port"
                  min={1}
                  max={65535}
                  type="number"
                  value={form.port}
                  onChange={(e) => setForm({ ...form, port: Number(e.target.value) })}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="device-poll-interval">Poll Interval (ms)</Label>
              <Input
                id="device-poll-interval"
                min={1000}
                max={600000}
                type="number"
                value={form.poll_interval_ms}
                onChange={(e) => setForm({ ...form, poll_interval_ms: Number(e.target.value) })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!validDeviceForm || creatingDevice || deviceActionId !== null}
              onClick={async () => {
                setCreatingDevice(true);
                try {
                  const r = await create({ data: { ...form, device_id: form.device_id.trim(), name: form.name.trim(), ip_address: form.ip_address.trim(), is_active: true } });
                  setOpen(false);
                  setForm({
                    device_id: "",
                    name: "",
                    ip_address: "",
                    port: 4370,
                    poll_interval_ms: 5000,
                  });
                  qc.invalidateQueries({ queryKey: ["devices"] });
                  setShowKey(r.apiKey);
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Could not create the device.");
                } finally {
                  setCreatingDevice(false);
                }
              }}
            >
              {creatingDevice ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!showKey} onOpenChange={(o) => !o && setShowKey(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Device API Key</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Save this now — it won't be shown again. Paste into the sync service .env as{" "}
            <code>DEVICE_API_KEY</code>.
          </p>
          <div className="flex gap-2">
            <Input readOnly value={showKey ?? ""} />
            <Button
              size="icon"
              aria-label="Copy device API key"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(showKey ?? "");
                  toast.success("Copied");
                } catch {
                  toast.error("Clipboard access failed. Select and copy the key manually.");
                }
              }}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function ShiftCard() {
  const saveShift = useServerFn(saveShiftSettings);
  const qc = useQueryClient();
  const { data: shift, isLoading: shiftLoading, isError: shiftError, refetch: refetchShift } = useQuery({
    queryKey: ["shift"],
    queryFn: async () => {
      const { data: companyId } = await supabase.rpc("current_company_id");
      if (!companyId) throw new Error("No active company selected");
      const { data, error } = await supabase
        .from("shift_settings")
        .select("*")
        .eq("company_id", companyId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const [form, setForm] = useState<Record<string, string | number>>({});
  const [savingShift, setSavingShift] = useState(false);
  const v = (k: string, d: string | number) =>
    (form[k] ?? shift?.[k as keyof typeof shift] ?? d) as string | number;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Shift & Payroll Rules</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {shiftLoading && <p role="status" className="text-sm text-muted-foreground">Loading company shift rules…</p>}
        {shiftError && (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-2 text-sm text-destructive">
            <span>Shift rules could not be loaded. Saving is disabled to avoid overwriting settings with defaults.</span>
            <Button size="sm" variant="outline" onClick={() => void refetchShift()}>Retry</Button>
          </div>
        )}
        {!shiftLoading && !shiftError && !shift && (
          <p role="status" className="text-sm text-muted-foreground">No shift rules exist for this company yet. Save these values to create the initial rules.</p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Shift Start</Label>
            <Input
              type="time"
              value={String(v("shift_start", "09:00"))}
              onChange={(e) => setForm({ ...form, shift_start: e.target.value })}
            />
          </div>
          <div>
            <Label>Shift End</Label>
            <Input
              type="time"
              value={String(v("shift_end", "18:00"))}
              onChange={(e) => setForm({ ...form, shift_end: e.target.value })}
            />
          </div>
          <div>
            <Label>Late Grace (min)</Label>
            <Input
              type="number"
              value={Number(v("late_grace_minutes", 10))}
              onChange={(e) => setForm({ ...form, late_grace_minutes: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label>Half-Day Below (hours)</Label>
            <Input
              type="number"
              value={Number(v("half_day_hours", 4))}
              onChange={(e) => setForm({ ...form, half_day_hours: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label>Late Deduction %</Label>
            <Input
              type="number"
              value={Number(v("late_deduction_pct", 0))}
              onChange={(e) => setForm({ ...form, late_deduction_pct: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label>Half-Day Deduction %</Label>
            <Input
              type="number"
              value={Number(v("half_day_deduction_pct", 50))}
              onChange={(e) => setForm({ ...form, half_day_deduction_pct: Number(e.target.value) })}
            />
          </div>
          <div className="col-span-2">
            <Label>Working Days / Month</Label>
            <Input
              type="number"
              value={Number(v("working_days_per_month", 26))}
              onChange={(e) => setForm({ ...form, working_days_per_month: Number(e.target.value) })}
            />
          </div>
        </div>
        <Button
          disabled={shiftLoading || shiftError || savingShift}
          onClick={async () => {
            const values = {
              shift_start: String(v("shift_start", "09:00")),
              shift_end: String(v("shift_end", "18:00")),
              late_grace_minutes: Number(v("late_grace_minutes", 10)),
              half_day_hours: Number(v("half_day_hours", 4)),
              late_deduction_pct: Number(v("late_deduction_pct", 0)),
              half_day_deduction_pct: Number(v("half_day_deduction_pct", 50)),
              working_days_per_month: Number(v("working_days_per_month", 26)),
            };
            if (!/^\d{2}:\d{2}$/.test(values.shift_start) || !/^\d{2}:\d{2}$/.test(values.shift_end)) {
              toast.error("Enter valid shift start and end times.");
              return;
            }
            if (!Number.isInteger(values.late_grace_minutes) || values.late_grace_minutes < 0 || values.late_grace_minutes > 240 ||
                !Number.isFinite(values.half_day_hours) || values.half_day_hours < 0 || values.half_day_hours > 24 ||
                !Number.isFinite(values.late_deduction_pct) || values.late_deduction_pct < 0 || values.late_deduction_pct > 100 ||
                !Number.isFinite(values.half_day_deduction_pct) || values.half_day_deduction_pct < 0 || values.half_day_deduction_pct > 100 ||
                !Number.isInteger(values.working_days_per_month) || values.working_days_per_month < 1 || values.working_days_per_month > 31) {
              toast.error("Check the shift and deduction values. All entries must be within the allowed ranges.");
              return;
            }
            setSavingShift(true);
            try {
              const result = await saveShift({ data: { ...(shift?.id ? { id: shift.id } : {}), ...values } });
              toast.success(result.created ? "Initial company shift rules created." : "Shift rules saved.");
              await qc.invalidateQueries({ queryKey: ["shift"] });
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Failed to save settings");
            } finally {
              setSavingShift(false);
            }
          }}
        >
          {savingShift ? "Saving…" : shift ? "Save" : "Create shift rules"}
        </Button>
      </CardContent>
    </Card>
  );
}
