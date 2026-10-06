import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listNotificationProviders,
  upsertNotificationProvider,
  toggleNotificationProvider,
  deleteNotificationProvider,
} from "@/lib/notifications-admin.functions";
import { PageHeader, PageBody } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Pencil, Plus, Trash2, CheckCircle2, AlertCircle } from "lucide-react";

export const Route = createFileRoute("/_app/communications/providers")({
  component: ProvidersPage,
});

type ProviderForm = {
  id?: string;
  channel: "whatsapp" | "sms" | "email" | "push";
  name: string;
  display_name: string;
  is_active: boolean;
  is_default: boolean;
  priority: number;
  config_text: string;
  secret_env_keys_text: string;
  notes: string;
};

const EMPTY: ProviderForm = {
  channel: "whatsapp",
  name: "",
  display_name: "",
  is_active: false,
  is_default: false,
  priority: 100,
  config_text: "{}",
  secret_env_keys_text: "",
  notes: "",
};

function ProvidersPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listNotificationProviders);
  const upsertFn = useServerFn(upsertNotificationProvider);
  const toggleFn = useServerFn(toggleNotificationProvider);
  const deleteFn = useServerFn(deleteNotificationProvider);

  const { data, isLoading } = useQuery({
    queryKey: ["notification-providers"],
    queryFn: () => listFn(),
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ProviderForm>(EMPTY);

  const grouped = useMemo(() => {
    const by: Record<string, any[]> = { whatsapp: [], sms: [], email: [], push: [] };
    for (const p of data?.providers ?? []) by[p.channel]?.push(p);
    return by;
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      let config: Record<string, unknown> = {};
      try { config = form.config_text.trim() ? JSON.parse(form.config_text) : {}; }
      catch { throw new Error("Config must be valid JSON"); }
      const secret_env_keys = form.secret_env_keys_text
        .split(",").map((s) => s.trim()).filter(Boolean);
      return upsertFn({
        data: {
          id: form.id,
          channel: form.channel,
          name: form.name,
          display_name: form.display_name,
          is_active: form.is_active,
          is_default: form.is_default,
          priority: Number(form.priority) || 100,
          config: config as any,
          secret_env_keys,
          notes: form.notes || null,
        },
      });
    },
    onSuccess: () => {
      toast.success("Provider saved");
      qc.invalidateQueries({ queryKey: ["notification-providers"] });
      setOpen(false);
      setForm(EMPTY);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: (v: { id: string; is_active: boolean }) =>
      toggleFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notification-providers"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Provider removed");
      qc.invalidateQueries({ queryKey: ["notification-providers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function openEdit(p: any) {
    setForm({
      id: p.id,
      channel: p.channel,
      name: p.name,
      display_name: p.display_name,
      is_active: p.is_active,
      is_default: p.is_default,
      priority: p.priority,
      config_text: JSON.stringify(p.config ?? {}, null, 2),
      secret_env_keys_text: (p.secret_env_keys ?? []).join(", "),
      notes: p.notes ?? "",
    });
    setOpen(true);
  }

  function openNew() {
    setForm(EMPTY);
    setOpen(true);
  }

  return (
    <>
      <PageHeader
        title="Notification Providers"
        description="Configure providers per channel (WhatsApp, SMS, Email, Push). Business logic stays unchanged — only this table decides which provider sends each notification."
        actions={
          <Button onClick={openNew}>
            <Plus className="h-4 w-4 mr-1" />New Provider
          </Button>
        }
      />
      <PageBody>
        {(["whatsapp", "sms", "email", "push"] as const).map((channel) => (
          <Card key={channel} className="mb-6">
            <CardHeader>
              <CardTitle className="capitalize">{channel}</CardTitle>
              <CardDescription>
                {grouped[channel].length === 0
                  ? "No providers registered for this channel."
                  : `${grouped[channel].length} provider(s) registered.`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Provider</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Default</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Secrets</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-4">Loading…</TableCell></TableRow>
                  ) : grouped[channel].length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-4">—</TableCell></TableRow>
                  ) : grouped[channel].map((p: any) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <div className="font-medium">{p.display_name}</div>
                        <div className="text-xs text-muted-foreground">{p.name}</div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={p.is_active}
                            onCheckedChange={(v) => toggle.mutate({ id: p.id, is_active: v })}
                          />
                          {p.ready ? (
                            <Badge variant="default" className="gap-1"><CheckCircle2 className="h-3 w-3" />ready</Badge>
                          ) : (
                            <Badge variant="secondary" className="gap-1"><AlertCircle className="h-3 w-3" />
                              {!p.has_implementation ? "no code" : "needs secrets"}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{p.is_default ? <Badge>default</Badge> : "—"}</TableCell>
                      <TableCell>{p.priority}</TableCell>
                      <TableCell>
                        {p.secret_env_keys.length === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <div className="space-y-1">
                            {p.secret_env_keys.map((k: string) => (
                              <div key={k} className="text-xs">
                                <code className="rounded bg-muted px-1">{k}</code>{" "}
                                {p.missing_env.includes(k)
                                  ? <span className="text-destructive">missing</span>
                                  : <span className="text-green-600">set</span>}
                              </div>
                            ))}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => { if (confirm("Remove this provider?")) del.mutate(p.id); }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))}

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{form.id ? "Edit Provider" : "New Provider"}</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Channel</Label>
                <Select value={form.channel} onValueChange={(v) => setForm({ ...form, channel: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="sms">SMS</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="push">Push</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Internal name</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="interakt" />
              </div>
              <div className="col-span-2">
                <Label>Display name</Label>
                <Input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
              </div>
              <div>
                <Label>Priority</Label>
                <Input type="number" value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })} />
              </div>
              <div className="flex items-end gap-4">
                <div className="flex items-center gap-2">
                  <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
                  <Label>Active</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={form.is_default} onCheckedChange={(v) => setForm({ ...form, is_default: v })} />
                  <Label>Default</Label>
                </div>
              </div>
              <div className="col-span-2">
                <Label>Secret env keys (comma separated)</Label>
                <Input value={form.secret_env_keys_text} onChange={(e) => setForm({ ...form, secret_env_keys_text: e.target.value })} placeholder="INTERAKT_API_KEY, INTERAKT_WEBHOOK_SECRET" />
              </div>
              <div className="col-span-2">
                <Label>Config (JSON)</Label>
                <Textarea rows={6} value={form.config_text} onChange={(e) => setForm({ ...form, config_text: e.target.value })} />
              </div>
              <div className="col-span-2">
                <Label>Notes</Label>
                <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={() => save.mutate()} disabled={save.isPending}>
                {save.isPending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageBody>
    </>
  );
}
