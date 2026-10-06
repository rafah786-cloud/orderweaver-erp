import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getWhatsAppConfig,
  updateWhatsAppConfig,
  sendTestWhatsAppMessage,
} from "@/lib/whatsapp-config.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { CheckCircle2, AlertCircle, Send } from "lucide-react";

type CfgForm = {
  workspace_id: string;
  business_number: string;
  sender_name: string;
  base_url: string;
  default_language: string;
  is_active: boolean;
};

const EMPTY: CfgForm = {
  workspace_id: "",
  business_number: "",
  sender_name: "",
  base_url: "https://api.interakt.ai/v1/public",
  default_language: "en",
  is_active: true,
};

export function WhatsAppConfigCard() {
  const qc = useQueryClient();
  const getFn = useServerFn(getWhatsAppConfig);
  const saveFn = useServerFn(updateWhatsAppConfig);
  const testFn = useServerFn(sendTestWhatsAppMessage);

  const cfgQ = useQuery({ queryKey: ["whatsapp_cfg"], queryFn: () => getFn() });
  const [form, setForm] = useState<CfgForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [test, setTest] = useState({ mobileNumber: "", templateName: "", variables: "{}" });
  const [testBusy, setTestBusy] = useState(false);

  const current: CfgForm = form ?? {
    workspace_id: cfgQ.data?.workspace_id ?? EMPTY.workspace_id,
    business_number: cfgQ.data?.business_number ?? EMPTY.business_number,
    sender_name: cfgQ.data?.sender_name ?? EMPTY.sender_name,
    base_url: cfgQ.data?.base_url ?? EMPTY.base_url,
    default_language: cfgQ.data?.default_language ?? EMPTY.default_language,
    is_active: cfgQ.data?.is_active ?? EMPTY.is_active,
  };

  const apiKeyOk = !!cfgQ.data?.api_key_configured;

  async function save() {
    setSaving(true);
    try {
      await saveFn({ data: current });
      toast.success("WhatsApp configuration saved");
      setForm(null);
      qc.invalidateQueries({ queryKey: ["whatsapp_cfg"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function runTest() {
    setTestBusy(true);
    try {
      let vars: Record<string, string> = {};
      if (test.variables.trim()) {
        try {
          vars = JSON.parse(test.variables);
        } catch {
          toast.error('Variables must be valid JSON, e.g. {"customer_name":"Alex"}');
          setTestBusy(false);
          return;
        }
      }
      const r = await testFn({
        data: {
          mobileNumber: test.mobileNumber,
          templateName: test.templateName,
          variables: vars,
        },
      });
      if (r.ok) {
        toast.success(
          `Sent. Message id: ${r.messageId || "(none returned)"} · attempts: ${r.attempts}`,
        );
        setTestOpen(false);
      } else {
        toast.error(`${r.status}: ${r.error ?? "send failed"} (attempts: ${r.attempts})`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Test failed");
    } finally {
      setTestBusy(false);
    }
  }

  return (
    <Card className="lg:col-span-2">
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <CardTitle>WhatsApp Configuration</CardTitle>
          <CardDescription>Interakt provider · used by all notification triggers.</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          {apiKeyOk ? (
            <Badge variant="default" className="gap-1">
              <CheckCircle2 className="h-3 w-3" /> API key set
            </Badge>
          ) : (
            <Badge variant="destructive" className="gap-1">
              <AlertCircle className="h-3 w-3" /> API key missing
            </Badge>
          )}
          <Switch
            checked={current.is_active}
            onCheckedChange={(v) => setForm({ ...current, is_active: v })}
            aria-label="Active"
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!apiKeyOk && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm">
            Add <code>INTERAKT_API_KEY</code> in Project Settings → Secrets to authenticate. The key
            is stored as an environment variable and never exposed to the browser.
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label>Interakt Workspace ID</Label>
            <Input
              value={current.workspace_id}
              onChange={(e) => setForm({ ...current, workspace_id: e.target.value })}
              placeholder="ws_xxxxxxxx"
            />
          </div>
          <div>
            <Label>WhatsApp Business Number</Label>
            <Input
              value={current.business_number}
              onChange={(e) => setForm({ ...current, business_number: e.target.value })}
              placeholder="+91XXXXXXXXXX"
            />
          </div>
          <div>
            <Label>Default Sender Name</Label>
            <Input
              value={current.sender_name}
              onChange={(e) => setForm({ ...current, sender_name: e.target.value })}
              placeholder="Abood Tradings"
            />
          </div>
          <div>
            <Label>Default Language</Label>
            <Input
              value={current.default_language}
              onChange={(e) => setForm({ ...current, default_language: e.target.value })}
              placeholder="en"
            />
          </div>
          <div className="md:col-span-2">
            <Label>API Base URL</Label>
            <Input
              value={current.base_url}
              onChange={(e) => setForm({ ...current, base_url: e.target.value })}
              placeholder="https://api.interakt.ai/v1/public"
            />
          </div>
        </div>
        <div className="flex justify-between items-center">
          <div className="text-xs text-muted-foreground">
            All sends use a 3-attempt retry with backoff. Every request and response is logged in
            Communications → WhatsApp Logs.
          </div>
          <div className="flex gap-2">
            <Dialog open={testOpen} onOpenChange={setTestOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" disabled={!apiKeyOk}>
                  <Send className="h-4 w-4 mr-1" />
                  Send Test
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Send Test WhatsApp Message</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>Mobile Number (E.164, e.g. +91...)</Label>
                    <Input
                      value={test.mobileNumber}
                      onChange={(e) => setTest({ ...test, mobileNumber: e.target.value })}
                      placeholder="+919876543210"
                    />
                  </div>
                  <div>
                    <Label>Template Name</Label>
                    <Input
                      value={test.templateName}
                      onChange={(e) => setTest({ ...test, templateName: e.target.value })}
                      placeholder="ORDER_CONFIRMED"
                    />
                  </div>
                  <div>
                    <Label>Variables (JSON object)</Label>
                    <Input
                      value={test.variables}
                      onChange={(e) => setTest({ ...test, variables: e.target.value })}
                      placeholder='{"customer_name":"Alex","order_no":"SO-123"}'
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Keys must match the template's declared variables.
                    </p>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setTestOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={runTest}
                    disabled={testBusy || !test.mobileNumber || !test.templateName}
                  >
                    {testBusy ? "Sending…" : "Send Test"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Button size="sm" onClick={save} disabled={saving || !form}>
              {saving ? "Saving…" : "Save Configuration"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
