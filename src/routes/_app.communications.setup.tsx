import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getWhatsAppConfig,
  updateWhatsAppConfig,
  sendTestWhatsAppMessage,
} from "@/lib/whatsapp-config.functions";
import { listWhatsAppTemplates, KNOWN_EVENT_KEYS } from "@/lib/whatsapp-admin.functions";
import {
  validateWhatsAppTemplates,
  importInteraktTemplates,
} from "@/lib/whatsapp-interakt-sync.functions";
import {
  listSubscriptions,
  departmentEmployeeCounts,
  DEPARTMENTS,
  STAFF_EVENTS,
} from "@/lib/staff-notifications.functions";
import { PageHeader, PageBody } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  CheckCircle2, AlertCircle, KeyRound, Settings2, FileText,
  Users, Send, ArrowRight, ArrowLeft, PartyPopper,
} from "lucide-react";

export const Route = createFileRoute("/_app/communications/setup")({
  component: SetupWizard,
});

type StepStatus = "ok" | "warn" | "todo";

function StatusPill({ status, label }: { status: StepStatus; label: string }) {
  if (status === "ok")
    return <Badge className="gap-1"><CheckCircle2 className="h-3 w-3" />{label}</Badge>;
  if (status === "warn")
    return <Badge variant="secondary" className="gap-1"><AlertCircle className="h-3 w-3" />{label}</Badge>;
  return <Badge variant="destructive" className="gap-1"><AlertCircle className="h-3 w-3" />{label}</Badge>;
}

function SetupWizard() {
  const getCfg = useServerFn(getWhatsAppConfig);
  const saveCfg = useServerFn(updateWhatsAppConfig);
  const testFn = useServerFn(sendTestWhatsAppMessage);
  const listTpl = useServerFn(listWhatsAppTemplates);
  const listSubs = useServerFn(listSubscriptions);
  const deptCounts = useServerFn(departmentEmployeeCounts);
  const validateTpl = useServerFn(validateWhatsAppTemplates);
  const importTpl = useServerFn(importInteraktTemplates);

  const cfgQ = useQuery({ queryKey: ["wa_setup_cfg"], queryFn: () => getCfg() });
  const tplQ = useQuery({ queryKey: ["wa_setup_tpl"], queryFn: () => listTpl() });
  const subQ = useQuery({ queryKey: ["wa_setup_sub"], queryFn: () => listSubs() });
  const empQ = useQuery({ queryKey: ["wa_setup_emp"], queryFn: () => deptCounts() });
  const valQ = useQuery({
    queryKey: ["wa_setup_validate"],
    queryFn: () => validateTpl(),
    enabled: !!cfgQ.data?.api_key_configured,
  });

  const importMut = useMutation({
    mutationFn: (vars: { overwrite: boolean }) =>
      importTpl({ data: { overwrite: vars.overwrite, onlyApproved: true } }),
    onSuccess: async (r) => {
      toast.success(
        `Imported ${r.inserted.length} · updated ${r.updated.length} · skipped ${r.skipped.length}`,
      );
      await tplQ.refetch();
      await valQ.refetch();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Import failed"),
  });

  const [step, setStep] = useState(0);

  // Form state for step 2 (provider config)
  const [form, setForm] = useState<{
    workspace_id: string; business_number: string; sender_name: string;
    base_url: string; default_language: string;
  } | null>(null);
  const cfgForm = form ?? {
    workspace_id: cfgQ.data?.workspace_id ?? "",
    business_number: cfgQ.data?.business_number ?? "",
    sender_name: cfgQ.data?.sender_name ?? "",
    base_url: cfgQ.data?.base_url ?? "https://api.interakt.ai/v1/public",
    default_language: cfgQ.data?.default_language ?? "en",
  };
  const [savingCfg, setSavingCfg] = useState(false);

  // Step 5 test state
  const [test, setTest] = useState({ mobileNumber: "", templateName: "ORDER_CONFIRMED", variables: "{}" });
  const [testBusy, setTestBusy] = useState(false);
  const [testResult, setTestResult] = useState<null | { ok: boolean; msg: string }>(null);

  const apiKeyOk = !!cfgQ.data?.api_key_configured;
  const cfgOk = apiKeyOk && !!cfgQ.data?.workspace_id && !!cfgQ.data?.business_number && !!cfgQ.data?.is_active;

  const templatesByEvent = useMemo(() => {
    const m = new Map<string, { name: string; approved: boolean | null }>();
    for (const t of tplQ.data?.templates ?? []) {
      m.set(t.event_key as string, {
        name: (t as any).template_name,
        approved: (t as any).is_approved ?? null,
      });
    }
    return m;
  }, [tplQ.data]);

  const validation = valQ.data?.results ?? [];
  const validationByEvent = useMemo(
    () => new Map(validation.map((v) => [v.event_key, v])),
    [validation],
  );
  const templatesMapped = KNOWN_EVENT_KEYS.every((k) => templatesByEvent.has(k));
  const templatesValidated = valQ.data?.all_ok ?? false;
  const templatesStatus: StepStatus = templatesValidated
    ? "ok"
    : templatesMapped
      ? "warn"
      : tplQ.data?.templates?.length
        ? "warn"
        : "todo";

  const activeSubs = (subQ.data ?? []).filter((s) => s.is_active);
  const subsOk = activeSubs.length > 0;

  const steps: Array<{ key: string; title: string; icon: any; status: StepStatus }> = [
    { key: "key", title: "API Credentials", icon: KeyRound, status: apiKeyOk ? "ok" : "todo" },
    { key: "cfg", title: "Provider Configuration", icon: Settings2, status: cfgOk ? "ok" : apiKeyOk ? "warn" : "todo" },
    { key: "tpl", title: "Message Templates", icon: FileText, status: templatesStatus },
    { key: "sub", title: "Staff Subscriptions", icon: Users, status: subsOk ? "ok" : "warn" },
    { key: "test", title: "Verify with a Test", icon: Send, status: testResult?.ok ? "ok" : "todo" },
  ];

  async function saveConfigStep() {
    setSavingCfg(true);
    try {
      await saveCfg({ data: { ...cfgForm, is_active: true } });
      toast.success("Configuration saved");
      await cfgQ.refetch();
      setForm(null);
      setStep(2);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSavingCfg(false);
    }
  }

  async function runTest() {
    setTestBusy(true); setTestResult(null);
    try {
      let vars: Record<string, string> = {};
      if (test.variables.trim()) {
        try { vars = JSON.parse(test.variables); }
        catch { toast.error('Variables must be JSON, e.g. {"customer_name":"Alex"}'); setTestBusy(false); return; }
      }
      const r = await testFn({ data: { mobileNumber: cfgQ.data?.business_number ?? "", templateName: test.templateName, variables: vars } });
      if (r.ok) {
        setTestResult({ ok: true, msg: `Sent successfully · id ${r.messageId || "(none)"} · ${r.attempts} attempt(s)` });
        toast.success("Test message sent");
      } else {
        setTestResult({ ok: false, msg: `${r.status}: ${r.error ?? "send failed"} (${r.attempts} attempt(s))` });
      }
    } catch (e) {
      setTestResult({ ok: false, msg: e instanceof Error ? e.message : "Test failed" });
    } finally {
      setTestBusy(false);
    }
  }

  const allDone = steps.every((s) => s.status === "ok");

  return (
    <>
      <PageHeader
        title="WhatsApp Setup Wizard"
        description="Walk through credentials, configuration, templates, subscriptions, and a live test."
      />
      <PageBody>
        {/* Stepper */}
        <div className="mb-6 grid grid-cols-2 sm:grid-cols-5 gap-2">
          {steps.map((s, i) => {
            const Icon = s.icon;
            const active = i === step;
            return (
              <button
                key={s.key}
                onClick={() => setStep(i)}
                className={`flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition ${
                  active ? "border-primary bg-primary/5" : "hover:bg-muted"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-muted-foreground">Step {i + 1}</div>
                  <div className="truncate font-medium">{s.title}</div>
                </div>
                <StatusPill
                  status={s.status}
                  label={s.status === "ok" ? "Done" : s.status === "warn" ? "Check" : "Todo"}
                />
              </button>
            );
          })}
        </div>

        {step === 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5" />Step 1 · API Credentials</CardTitle>
              <CardDescription>Store the Interakt secret key so the backend can send messages.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-md border p-4 flex items-start justify-between gap-4">
                <div className="space-y-1 text-sm">
                  <div className="font-medium">INTERAKT_API_KEY</div>
                  <div className="text-muted-foreground">
                    Found in Interakt → Settings → Developer Setting → Secret Key. Values are stored encrypted and never sent to the browser.
                  </div>
                </div>
                <StatusPill status={apiKeyOk ? "ok" : "todo"} label={apiKeyOk ? "Configured" : "Missing"} />
              </div>
              {!apiKeyOk && (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
                  Paste your Interakt secret key in the chat and I'll save it for you, or add it in Project Settings → Secrets as <code>INTERAKT_API_KEY</code>.
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Settings2 className="h-5 w-5" />Step 2 · Provider Configuration</CardTitle>
              <CardDescription>Identify your Interakt workspace and the sender.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label>Workspace ID</Label>
                  <Input value={cfgForm.workspace_id} onChange={(e) => setForm({ ...cfgForm, workspace_id: e.target.value })} placeholder="ws_xxxxxxxx" />
                </div>
                <div>
                  <Label>Business Number</Label>
                  <Input value={cfgForm.business_number} onChange={(e) => setForm({ ...cfgForm, business_number: e.target.value })} placeholder="+91XXXXXXXXXX" />
                </div>
                <div>
                  <Label>Sender Name</Label>
                  <Input value={cfgForm.sender_name} onChange={(e) => setForm({ ...cfgForm, sender_name: e.target.value })} placeholder="Zizz Mattress" />
                </div>
                <div>
                  <Label>Default Language</Label>
                  <Input value={cfgForm.default_language} onChange={(e) => setForm({ ...cfgForm, default_language: e.target.value })} placeholder="en" />
                </div>
                <div className="md:col-span-2">
                  <Label>API Base URL</Label>
                  <Input value={cfgForm.base_url} onChange={(e) => setForm({ ...cfgForm, base_url: e.target.value })} />
                </div>
              </div>
              <div className="flex justify-end">
                <Button onClick={saveConfigStep} disabled={savingCfg || !apiKeyOk}>
                  {savingCfg ? "Saving…" : "Save & activate"}
                </Button>
              </div>
              {!apiKeyOk && <p className="text-xs text-muted-foreground">Complete Step 1 first.</p>}
            </CardContent>
          </Card>
        )}

        {step === 2 && (
          <Card>
            <CardHeader className="flex flex-row items-start justify-between">
              <div>
                <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" />Step 3 · Message Templates</CardTitle>
                <CardDescription>Every ERP event needs an Interakt-approved template with a matching variable count.</CardDescription>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => importMut.mutate({ overwrite: false })}
                  disabled={!apiKeyOk || importMut.isPending}
                >
                  {importMut.isPending ? "Importing…" : "Import from Interakt"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => valQ.refetch()}
                  disabled={!apiKeyOk || valQ.isFetching}
                >
                  {valQ.isFetching ? "Validating…" : "Re-validate"}
                </Button>
                <Link to="/communications/templates"><Button size="sm" variant="outline">Manage</Button></Link>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {!apiKeyOk && (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
                  Add <code>INTERAKT_API_KEY</code> in Step 1 to enable validation and import.
                </div>
              )}
              {valQ.data?.remoteError && (
                <div className="rounded-md border border-red-500/40 bg-red-500/5 p-3 text-sm">
                  Couldn't reach Interakt: {valQ.data.remoteError}
                </div>
              )}
              {valQ.data && !valQ.data.remoteError && (
                <div className="text-xs text-muted-foreground">
                  Fetched {valQ.data.remote_count} template(s) from Interakt.
                </div>
              )}

              <div className="rounded-md border divide-y">
                {KNOWN_EVENT_KEYS.map((k) => {
                  const t = templatesByEvent.get(k);
                  const v = validationByEvent.get(k);
                  let status: StepStatus = "todo";
                  let label = "Missing";
                  if (v) {
                    if (v.ok) { status = "ok"; label = "Approved · vars match"; }
                    else if (!v.local_name) { status = "todo"; label = "Not mapped"; }
                    else if (!v.interakt_found) { status = "todo"; label = "Not on Interakt"; }
                    else if (!v.is_approved) { status = "warn"; label = v.interakt_status ?? "Not approved"; }
                    else if (!v.vars_match) { status = "warn"; label = `Vars ${v.local_var_count} ≠ ${v.interakt_var_count}`; }
                  } else if (t) {
                    status = "warn"; label = "Unvalidated";
                  }
                  return (
                    <div key={k} className="flex items-center justify-between px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <div className="font-mono text-xs text-muted-foreground">{k}</div>
                        <div className="font-medium truncate">{t?.name ?? "— not mapped —"}</div>
                        {v?.issue && !v.ok && (
                          <div className="text-xs text-muted-foreground">{v.issue}</div>
                        )}
                      </div>
                      <StatusPill status={status} label={label} />
                    </div>
                  );
                })}
              </div>

              {importMut.data?.unmapped_remote?.length ? (
                <div className="rounded-md border p-3 text-xs">
                  <div className="font-medium mb-1">Interakt templates we couldn't auto-map ({importMut.data.unmapped_remote.length})</div>
                  <div className="text-muted-foreground">
                    Map these manually in the templates page: {importMut.data.unmapped_remote.slice(0, 8).map((t) => t.name).join(", ")}
                    {importMut.data.unmapped_remote.length > 8 && "…"}
                  </div>
                </div>
              ) : null}

              {!templatesValidated && apiKeyOk && (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
                  Fix the issues above (or click <b>Import from Interakt</b>) before moving to the test step.
                </div>
              )}
            </CardContent>
          </Card>
        )}


        {step === 3 && (
          <Card>
            <CardHeader className="flex flex-row items-start justify-between">
              <div>
                <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" />Step 4 · Staff Subscriptions</CardTitle>
                <CardDescription>Which departments receive which alerts, and whether they have numbers to reach.</CardDescription>
              </div>
              <Link to="/communications/employee-subscriptions"><Button size="sm" variant="outline">Manage subscriptions</Button></Link>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {DEPARTMENTS.map((d) => {
                  const c = (empQ.data as any)?.[d] ?? { total: 0, with_phone: 0 };
                  return (
                    <div key={d} className="rounded-md border p-3">
                      <div className="text-xs text-muted-foreground">{d}</div>
                      <div className="text-lg font-semibold">{c.with_phone}/{c.total}</div>
                      <div className="text-xs text-muted-foreground">with WhatsApp</div>
                    </div>
                  );
                })}
              </div>
              <div className="rounded-md border p-3 text-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">Active event subscriptions</div>
                    <div className="text-muted-foreground text-xs">
                      {activeSubs.length} of {DEPARTMENTS.length * STAFF_EVENTS.length} possible (department × event) rows are on.
                    </div>
                  </div>
                  <StatusPill status={subsOk ? "ok" : "warn"} label={subsOk ? "Configured" : "No subscriptions"} />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 4 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Send className="h-5 w-5" />Step 5 · Verify with a Test</CardTitle>
              <CardDescription>Send a real message with an approved template to the configured business number.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <Label>Configured business number</Label>
                  <Input value={cfgQ.data?.business_number ?? ""} readOnly placeholder="Set a business number in Step 2" />
                </div>
                <div>
                  <Label>Template Name</Label>
                  <Input value={test.templateName} onChange={(e) => setTest({ ...test, templateName: e.target.value })} />
                </div>
                <div>
                  <Label>Variables (JSON)</Label>
                  <Input value={test.variables} onChange={(e) => setTest({ ...test, variables: e.target.value })} placeholder='{"customer_name":"Alex"}' />
                </div>
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs text-muted-foreground">
                  Failures are logged in <Link to="/communications/whatsapp-logs" className="underline">Activity Log</Link> with the exact Interakt error.
                </div>
                <Button onClick={runTest} disabled={testBusy || !apiKeyOk || !test.mobileNumber || !test.templateName}>
                  {testBusy ? "Sending…" : "Send test message"}
                </Button>
              </div>
              {testResult && (
                <div className={`rounded-md border p-3 text-sm ${testResult.ok ? "border-green-500/40 bg-green-500/5" : "border-red-500/40 bg-red-500/5"}`}>
                  {testResult.msg}
                </div>
              )}
              {allDone && (
                <div className="rounded-md border border-primary/40 bg-primary/5 p-4 flex items-center gap-3">
                  <PartyPopper className="h-5 w-5 text-primary" />
                  <div className="text-sm">
                    All set. WhatsApp notifications are live across the ERP. You can revisit this wizard anytime from Communications → Setup.
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Nav */}
        <div className="mt-4 flex justify-between">
          <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <Button
            variant="ghost"
            onClick={() => setStep((s) => Math.min(steps.length - 1, s + 1))}
            disabled={step === steps.length - 1 || (step === 2 && !templatesValidated)}
            title={step === 2 && !templatesValidated ? "Resolve template issues before continuing" : undefined}
          >
            Next <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </PageBody>
    </>
  );
}
