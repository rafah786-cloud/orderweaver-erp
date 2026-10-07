import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listNotificationEvents,
  setEventChannel,
  toggleEventActive,
  dispatchTestEvent,
} from "@/lib/notification-engine.functions";
import { PageHeader, PageBody } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { MessageSquare, Mail, Smartphone, Bell, Send } from "lucide-react";

const CHANNELS = [
  { key: "whatsapp", label: "WhatsApp", Icon: MessageSquare, implemented: true },
  { key: "sms", label: "SMS", Icon: Smartphone, implemented: false },
  { key: "email", label: "Email", Icon: Mail, implemented: false },
  { key: "push", label: "Push", Icon: Bell, implemented: false },
  { key: "in_app", label: "In-App", Icon: Bell, implemented: true },
] as const;

type Channel = (typeof CHANNELS)[number]["key"];

export const Route = createFileRoute("/_app/communications/events")({
  component: EventsPage,
});

function EventsPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listNotificationEvents);
  const setFn = useServerFn(setEventChannel);
  const toggleFn = useServerFn(toggleEventActive);

  const { data, isLoading } = useQuery({
    queryKey: ["notification-events"],
    queryFn: () => listFn(),
  });

  const events = data?.events ?? [];
  const channels = data?.channels ?? [];

  const routing = useMemo(() => {
    const map = new Map<string, Record<Channel, any>>();
    for (const ev of events) {
      map.set(ev.event_key, { whatsapp: null, sms: null, email: null, push: null, in_app: null } as any);
    }
    for (const c of channels) {
      const row = map.get(c.event_key);
      if (row) (row as any)[c.channel] = c;
    }
    return map;
  }, [events, channels]);

  const setChannelMut = useMutation({
    mutationFn: (v: any) => setFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notification-events"] }),
    onError: (e: any) => toast.error(e?.message ?? "Failed to save"),
  });

  const toggleActiveMut = useMutation({
    mutationFn: (v: any) => toggleFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notification-events"] }),
  });

  return (
    <div>
      <PageHeader
        title="Notification Engine"
        description="Configure which channels fire for each ERP event. Toggle channels per event; add new channels without touching business logic."
      />
      <PageBody>
        <Card>
          <CardHeader className="flex flex-row items-start justify-between">
            <div>
              <CardTitle>Event → Channel Routing</CardTitle>
              <CardDescription>
                Admin controls. Disabled events skip dispatch entirely.
              </CardDescription>
            </div>
            <TestDispatchDialog
              events={events.map((e: any) => ({ key: e.event_key, label: e.label }))}
            />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-sm text-muted-foreground">Loading…</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Event</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Active</TableHead>
                    {CHANNELS.map((c) => (
                      <TableHead key={c.key} className="text-center">
                        <span className="inline-flex items-center gap-1">
                          <c.Icon className="h-4 w-4" />
                          {c.label}
                        </span>
                      </TableHead>
                    ))}
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.map((ev: any) => {
                    const row = routing.get(ev.event_key)!;
                    return (
                      <TableRow key={ev.event_key}>
                        <TableCell>
                          <div className="font-medium">{ev.label}</div>
                          <div className="text-xs text-muted-foreground">{ev.event_key}</div>
                          {ev.description && (
                            <div className="text-xs text-muted-foreground mt-1">
                              {ev.description}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{ev.category}</Badge>
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={ev.is_active}
                            onCheckedChange={(v) =>
                              toggleActiveMut.mutate({ event_key: ev.event_key, is_active: v })
                            }
                          />
                        </TableCell>
                        {CHANNELS.map((c) => {
                          const cell = row[c.key];
                          return (
                            <TableCell key={c.key} className="text-center">
                              <Switch
                                checked={!!cell?.is_enabled}
                                disabled={!ev.is_active || !c.implemented}
                                onCheckedChange={(v) =>
                                  setChannelMut.mutate({
                                    event_key: ev.event_key,
                                    channel: c.key,
                                    is_enabled: v,
                                    template_name: cell?.template_name ?? null,
                                    subject_template: cell?.subject_template ?? null,
                                    body_template: cell?.body_template ?? null,
                                  })
                                }
                              />
                            </TableCell>
                          );
                        })}
                        <TableCell>
                          <EditTemplatesDialog
                            eventKey={ev.event_key}
                            eventLabel={ev.label}
                            rows={row}
                            onSave={(payload) => setChannelMut.mutate(payload)}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </PageBody>
    </div>
  );
}

function EditTemplatesDialog({
  eventKey,
  eventLabel,
  rows,
  onSave,
}: {
  eventKey: string;
  eventLabel: string;
  rows: Record<Channel, any>;
  onSave: (p: any) => void;
}) {
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState<Channel>("whatsapp");
  const cell = rows[channel] ?? {};
  const [tpl, setTpl] = useState<string>(cell.template_name ?? "");
  const [subj, setSubj] = useState<string>(cell.subject_template ?? "");
  const [body, setBody] = useState<string>(cell.body_template ?? "");

  function loadChannel(ch: Channel) {
    setChannel(ch);
    const c = rows[ch] ?? {};
    setTpl(c.template_name ?? "");
    setSubj(c.subject_template ?? "");
    setBody(c.body_template ?? "");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Templates
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{eventLabel} — Templates</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex gap-2">
            {CHANNELS.map((c) => (
              <Button
                key={c.key}
                type="button"
                size="sm"
                variant={channel === c.key ? "default" : "outline"}
                onClick={() => loadChannel(c.key)}
              >
                {c.label}
              </Button>
            ))}
          </div>
          <div className="space-y-2">
            <Label>Template name (provider template, e.g. ORDER_DISPATCHED)</Label>
            <Input
              value={tpl}
              onChange={(e) => setTpl(e.target.value)}
              placeholder="EVENT_TEMPLATE_KEY"
            />
          </div>
          {(channel === "email" || channel === "in_app") && (
            <div className="space-y-2">
              <Label>Subject template</Label>
              <Input
                value={subj}
                onChange={(e) => setSubj(e.target.value)}
                placeholder="Order {{order_no}} update"
              />
            </div>
          )}
          {(channel === "email" || channel === "in_app") && (
            <div className="space-y-2">
              <Label>Body template (supports {`{{variables}}`})</Label>
              <Textarea rows={5} value={body} onChange={(e) => setBody(e.target.value)} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button
            onClick={() => {
              onSave({
                event_key: eventKey,
                channel,
                is_enabled: !!cell.is_enabled,
                template_name: tpl || null,
                subject_template: subj || null,
                body_template: body || null,
              });
              setOpen(false);
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TestDispatchDialog({ events }: { events: { key: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  const [eventKey, setEventKey] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [userIds, setUserIds] = useState("");
  const [vars, setVars] = useState("{}");
  const [result, setResult] = useState<any>(null);
  const dispatchFn = useServerFn(dispatchTestEvent);
  useEffect(() => {
    if (!eventKey && events[0]?.key) setEventKey(events[0].key);
  }, [eventKey, events]);
  const mut = useMutation({
    mutationFn: async () => {
      let parsed = {};
      try {
        parsed = JSON.parse(vars || "{}");
      } catch {
        throw new Error("Variables must be valid JSON");
      }
      return dispatchFn({
        data: {
          event_key: eventKey,
          phone: phone || undefined,
          email: email || undefined,
          user_ids: userIds
            ? userIds
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
            : undefined,
          variables: parsed,
        },
      });
    },
    onSuccess: (r) => {
      setResult(r);
      toast.success("Dispatched");
    },
    onError: (e: any) => toast.error(e?.message ?? "Dispatch failed"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Send className="h-4 w-4 mr-1" />
          Test Dispatch
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Test Notification Dispatch</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Event</Label>
            <select
              className="w-full border rounded px-2 py-1 bg-background"
              value={eventKey}
              onChange={(e) => setEventKey(e.target.value)}
            >
              {events.map((e) => (
                <option key={e.key} value={e.key}>
                  {e.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Phone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>User IDs (comma-separated)</Label>
            <Input value={userIds} onChange={(e) => setUserIds(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Variables (JSON)</Label>
            <Textarea rows={4} value={vars} onChange={(e) => setVars(e.target.value)} />
          </div>
          {result && (
            <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-40">
              {JSON.stringify(result, null, 2)}
            </pre>
          )}
        </div>
        <DialogFooter>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending ? "Sending…" : "Dispatch"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
