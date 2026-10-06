import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listWhatsAppTemplates,
  upsertWhatsAppTemplate,
  deleteWhatsAppTemplate,
  KNOWN_EVENT_KEYS,
} from "@/lib/whatsapp-admin.functions";
import { getWhatsAppStatus } from "@/lib/whatsapp.functions";
import { PageHeader, PageBody } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_app/communications/templates")({
  component: TemplatesPage,
});

type TemplateRow = {
  id: string;
  template_name: string;
  event_key: string;
  description: string | null;
  language_code: string;
  variables: string[];
  is_active: boolean;
  body_template: string | null;
};

function renderPreview(body: string, vars: Record<string, string>): string {
  return body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, k) => {
    const v = vars[k];
    return v && v.length > 0 ? v : `{{${k}}}`;
  });
}

function TemplatesPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listWhatsAppTemplates);
  const statusFn = useServerFn(getWhatsAppStatus);
  const upsertFn = useServerFn(upsertWhatsAppTemplate);
  const deleteFn = useServerFn(deleteWhatsAppTemplate);

  const { data, isLoading } = useQuery({ queryKey: ["wa-templates"], queryFn: () => listFn() });
  const { data: status } = useQuery({ queryKey: ["wa-status"], queryFn: () => statusFn() });

  const [editing, setEditing] = useState<TemplateRow | null>(null);
  const [open, setOpen] = useState(false);

  const upsertMut = useMutation({
    mutationFn: (input: any) => upsertFn({ data: input }),
    onSuccess: () => {
      toast.success("Template saved");
      qc.invalidateQueries({ queryKey: ["wa-templates"] });
      setOpen(false);
      setEditing(null);
    },
    onError: (e: any) => toast.error(e?.message ?? "Save failed"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Template deleted");
      qc.invalidateQueries({ queryKey: ["wa-templates"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Delete failed"),
  });

  return (
    <>
      <PageHeader
        title="WhatsApp Templates"
        description="Map ERP events to pre-approved Interakt template names. Variables are filled in the order listed."
      />
      <PageBody>
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-base">Provider status</CardTitle>
            <CardDescription>
              Provider: <span className="font-medium">{status?.provider ?? "—"}</span>
              {" · "}API key:{" "}
              {status?.configured ? (
                <Badge variant="default">configured</Badge>
              ) : (
                <Badge variant="secondary">not set</Badge>
              )}
              {" · "}Webhook secret:{" "}
              {status?.webhook_configured ? (
                <Badge variant="default">configured</Badge>
              ) : (
                <Badge variant="secondary">not set</Badge>
              )}
            </CardDescription>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Templates</CardTitle>
              <CardDescription>
                One template per event key. Inactive entries fall back to plain text.
              </CardDescription>
            </div>
            <Dialog
              open={open}
              onOpenChange={(o) => {
                setOpen(o);
                if (!o) setEditing(null);
              }}
            >
              <DialogTrigger asChild>
                <Button onClick={() => setEditing(null)}>
                  <Plus className="h-4 w-4 mr-1" /> New template
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>{editing ? "Edit template" : "New template"}</DialogTitle>
                </DialogHeader>
                <TemplateForm
                  initial={editing}
                  saving={upsertMut.isPending}
                  onSubmit={(values) => upsertMut.mutate({ id: editing?.id, ...values })}
                />
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Event</TableHead>
                    <TableHead>Template name</TableHead>
                    <TableHead>Lang</TableHead>
                    <TableHead>Variables</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                        Loading…
                      </TableCell>
                    </TableRow>
                  ) : (data?.templates ?? []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                        No templates yet. Add one to start using Interakt.
                      </TableCell>
                    </TableRow>
                  ) : (
                    (data!.templates as any[]).map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="font-mono text-xs">{t.event_key}</TableCell>
                        <TableCell className="font-medium">{t.template_name}</TableCell>
                        <TableCell>{t.language_code}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {Array.isArray(t.variables) && t.variables.length > 0
                            ? (t.variables as string[]).join(", ")
                            : "—"}
                        </TableCell>
                        <TableCell>
                          {t.is_active ? (
                            <Badge>Active</Badge>
                          ) : (
                            <Badge variant="secondary">Off</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => {
                              setEditing({ ...t, variables: t.variables ?? [] });
                              setOpen(true);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => {
                              if (confirm(`Delete ${t.template_name}?`)) deleteMut.mutate(t.id);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </PageBody>
    </>
  );
}

function TemplateForm({
  initial,
  saving,
  onSubmit,
}: {
  initial: TemplateRow | null;
  saving: boolean;
  onSubmit: (values: {
    template_name: string;
    event_key: string;
    description: string | null;
    language_code: string;
    variables: string[];
    is_active: boolean;
    body_template: string | null;
  }) => void;
}) {
  const [templateName, setTemplateName] = useState(initial?.template_name ?? "");
  const [eventKey, setEventKey] = useState(initial?.event_key ?? KNOWN_EVENT_KEYS[0]);
  const [description, setDescription] = useState(initial?.description ?? "");
  const [language, setLanguage] = useState(initial?.language_code ?? "en");
  const [vars, setVars] = useState((initial?.variables ?? []).join(", "));
  const [active, setActive] = useState(initial?.is_active ?? true);
  const [body, setBody] = useState(initial?.body_template ?? "");
  const [previewVars, setPreviewVars] = useState<Record<string, string>>({});

  const variables = useMemo(
    () =>
      vars
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    [vars],
  );

  const preview = useMemo(() => renderPreview(body, previewVars), [body, previewVars]);

  return (
    <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
      <div className="space-y-2">
        <Label>Event</Label>
        <Select value={eventKey} onValueChange={setEventKey}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {KNOWN_EVENT_KEYS.map((k) => (
              <SelectItem key={k} value={k}>
                {k}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Interakt template name</Label>
        <Input
          value={templateName}
          onChange={(e) => setTemplateName(e.target.value)}
          placeholder="e.g. order_created_v1"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Language</Label>
          <Input value={language} onChange={(e) => setLanguage(e.target.value)} placeholder="en" />
        </div>
        <div className="space-y-2 flex items-end justify-between rounded-md border px-3 py-2">
          <Label className="mb-0">Active</Label>
          <Switch checked={active} onCheckedChange={setActive} />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Variables (comma separated, in body order)</Label>
        <Input
          value={vars}
          onChange={(e) => setVars(e.target.value)}
          placeholder="customer_name, po_number, amount"
        />
        <p className="text-xs text-muted-foreground">
          Resolved at send time from event payload. Order must match the template body.
        </p>
      </div>
      <div className="space-y-2">
        <Label>Message body (fallback / preview)</Label>
        <Textarea
          rows={5}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Hello {{customer_name}}, your order {{order_no}} is confirmed."
        />
        <p className="text-xs text-muted-foreground">
          Used when the Interakt template can't be sent (freeform fallback) and to render live
          previews below.
        </p>
      </div>

      {variables.length > 0 && (
        <div className="space-y-2 rounded-md border p-3 bg-muted/30">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            Preview values
          </Label>
          <div className="grid grid-cols-2 gap-2">
            {variables.map((v) => (
              <div key={v} className="space-y-1">
                <Label className="text-xs">{v}</Label>
                <Input
                  value={previewVars[v] ?? ""}
                  onChange={(e) => setPreviewVars({ ...previewVars, [v]: e.target.value })}
                  placeholder={`sample ${v}`}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label>Live preview</Label>
        <div className="rounded-md border bg-background p-3 text-sm whitespace-pre-wrap min-h-[80px]">
          {preview || (
            <span className="text-muted-foreground">
              Type a message body above to see a preview.
            </span>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label>Description (internal)</Label>
        <Input value={description ?? ""} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <DialogFooter>
        <Button
          disabled={saving || !templateName}
          onClick={() =>
            onSubmit({
              template_name: templateName,
              event_key: eventKey,
              description: description || null,
              language_code: language,
              variables,
              is_active: active,
              body_template: body.trim() ? body : null,
            })
          }
        >
          {saving ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </div>
  );
}
