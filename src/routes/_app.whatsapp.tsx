import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader, PageBody } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { MessageCircle, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/_app/whatsapp")({ component: WhatsAppSettings });

const DEPARTMENTS = [
  "Admin",
  "Sales",
  "Production",
  "HR",
  "Accounts",
  "Dispatch",
  "Quality",
  "Other",
] as const;

// E.164: + then 8–15 digits. We accept user-friendly input and normalize.
function normalizePhone(raw: string): string | null {
  const trimmed = raw.replace(/[\s\-()]/g, "");
  if (!trimmed) return "";
  const withPlus = trimmed.startsWith("+") ? trimmed : `+${trimmed}`;
  return /^\+[1-9]\d{7,14}$/.test(withPlus) ? withPlus : null;
}

function WhatsAppSettings() {
  const { user, profile, hasAnyRole } = useAuth();
  const isInternalUser = hasAnyRole(["admin", "accountant", "sales", "production", "hr", "employee"]);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["wa-profile", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, phone, whatsapp_number, department, whatsapp_opt_in")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [whatsapp, setWhatsapp] = useState("");
  const [department, setDepartment] = useState<string>("");
  const [optIn, setOptIn] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data) return;
    setWhatsapp(data.whatsapp_number ?? data.phone ?? "");
    setDepartment(data.department ?? "");
    setOptIn(!!data.whatsapp_opt_in);
  }, [data]);

  const save = async () => {
    if (!isInternalUser && department) {
      setDepartment("");
    }
    if (!user?.id) return;
    const normalized = normalizePhone(whatsapp);
    if (normalized === null) {
      toast.error("Enter a valid number in international format, e.g. +919876543210");
      return;
    }
    if (optIn && !normalized) {
      toast.error("Add a WhatsApp number before opting in to notifications");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        whatsapp_number: normalized || null,
        department: department || null,
        whatsapp_opt_in: optIn,
      })
      .eq("id", user.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("WhatsApp preferences saved");
    qc.invalidateQueries({ queryKey: ["wa-profile", user.id] });
  };

  return (
    <>
      <PageHeader
        title="WhatsApp Notifications"
        description="Manage how you receive order, production, and HR alerts on WhatsApp."
      />
      <PageBody>
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageCircle className="h-5 w-5 text-primary" />
                Your WhatsApp Profile
              </CardTitle>
              <CardDescription>
                Signed in as <span className="font-medium">{profile?.full_name}</span>. These
                details determine which alerts route to you.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="wa">WhatsApp Number</Label>
                <Input
                  id="wa"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  placeholder="+91 98765 43210"
                  disabled={isLoading}
                  inputMode="tel"
                  autoComplete="tel"
                  maxLength={20}
                />
                <p className="text-xs text-muted-foreground">
                  Use international format starting with country code (e.g. +91 for India).
                </p>
              </div>

              {isInternalUser && (
              <div className="space-y-2">
                <Label htmlFor="dept">Department</Label>
                <Select value={department} onValueChange={setDepartment} disabled={isLoading}>
                  <SelectTrigger id="dept">
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    {DEPARTMENTS.map((d) => (
                      <SelectItem key={d} value={d}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Department-wide broadcasts (e.g. new sales order → Production) will reach you when
                  this matches.
                </p>
              </div>
              )}

              <div className="flex items-start justify-between gap-4 rounded-md border p-4">
                <div className="space-y-1">
                  <Label htmlFor="opt" className="text-sm font-medium">
                    Enable WhatsApp notifications
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    You'll receive automated messages from the company WhatsApp number. Reply STOP
                    at any time to opt out.
                  </p>
                </div>
                <Switch id="opt" checked={optIn} onCheckedChange={setOptIn} disabled={isLoading} />
              </div>

              <div className="flex justify-end">
                <Button onClick={save} disabled={isLoading || saving}>
                  {saving ? "Saving…" : "Save preferences"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="h-4 w-4 text-primary" /> Privacy
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>Your number is visible only to you and to system administrators.</p>
              <p>
                Department is used to route role-based alerts (e.g. new order → Production team).
              </p>
              <p>Admin broadcasts reach everyone opted in, regardless of department.</p>
              <p className="pt-2 border-t">
                Need to update your name, email or phone? Contact your administrator.
              </p>
            </CardContent>
          </Card>
        </div>
      </PageBody>
    </>
  );
}
