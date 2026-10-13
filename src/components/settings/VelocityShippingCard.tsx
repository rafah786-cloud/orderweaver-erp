import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Truck, RefreshCw } from "lucide-react";
import { listVelocityWarehouses, testVelocityServiceability, testVelocityRates } from "@/lib/velocity.functions";
import { serviceabilityInput, ratesInput } from "@/lib/velocity/schemas";
import type { VelocityDiagnostic } from "@/lib/velocity/types";
import { useAuth } from "@/hooks/useAuth";

export function VelocityShippingCard() {
  const { hasRole } = useAuth();
  return hasRole("admin") ? <VelocityDiagnostics /> : null;
}

function VelocityDiagnostics() {
  const listFn = useServerFn(listVelocityWarehouses);
  const serviceFn = useServerFn(testVelocityServiceability);
  const ratesFn = useServerFn(testVelocityRates);
  const [busy, setBusy] = useState(false);
  const [diagnostic, setDiagnostic] = useState<VelocityDiagnostic | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [carriers, setCarriers] = useState<string[]>([]);
  const [form, setForm] = useState({ from: "", to: "", payment: "prepaid", journey: "forward", weight: "", length: "", width: "", height: "", value: "" });
  const { data: warehouses, isPending, isError } = useQuery({ queryKey: ["velocity-warehouses"], queryFn: () => listFn() });
  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));

  async function test(mode: "serviceability" | "rates") {
    setMessage(null); setCarriers([]); setDiagnostic(null);
    const service = serviceabilityInput.safeParse({ from: form.from, to: form.to, payment_mode: form.payment, shipment_type: form.journey });
    const rate = ratesInput.safeParse({
      journey_type: form.journey, origin_pincode: form.from, destination_pincode: form.to,
      dead_weight: Number(form.weight), length: Number(form.length), width: Number(form.width), height: Number(form.height),
      ...(form.journey === "forward" ? { payment_method: form.payment, ...(form.payment === "cod" ? { shipment_value: Number(form.value) } : {}) } : { qc_applicable: true }),
    });
    const parsed = mode === "serviceability" ? service : rate;
    if (!parsed.success) { setMessage(parsed.error.issues[0]?.message ?? "Check the entered values."); return; }
    setBusy(true);
    try {
      if (mode === "serviceability" && service.success) {
        const response = await serviceFn({ data: service.data });
        setDiagnostic(response);
        if (response.result) setCarriers(response.result.serviceability_results.map((c) => c.carrier_name));
      } else if (rate.success) {
        const response = await ratesFn({ data: rate.data });
        setDiagnostic(response);
        if (response.result) setCarriers(response.result.serviceable_couriers.map((c) => {
          const charges = c.charges;
          const total = "total_forward_charges" in charges ? charges.total_forward_charges : charges.total_return_charges;
          return `${c.carrier_name} · quoted charges ${total}`;
        }));
      }
    } catch { setMessage("Velocity check could not be completed. Confirm your administrator access and try again."); }
    finally { setBusy(false); }
  }

  return <Card>
    <CardHeader><CardTitle className="flex items-center gap-2"><Truck className="h-4 w-4" />Velocity Shipping</CardTitle></CardHeader>
    <CardContent className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {([ ["from", "Pickup pincode"], ["to", "Delivery pincode"] ] as const).map(([key, label]) => <div key={key}><Label htmlFor={`velocity-${key}`}>{label}</Label><Input id={`velocity-${key}`} inputMode="numeric" maxLength={6} value={form[key]} onChange={(e) => update(key, e.target.value)} /></div>)}
        <div><Label htmlFor="velocity-payment">Payment</Label><Select value={form.payment} onValueChange={(v) => update("payment", v)}><SelectTrigger id="velocity-payment"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="prepaid">Prepaid</SelectItem><SelectItem value="cod">Cash on delivery</SelectItem></SelectContent></Select></div>
        <div><Label htmlFor="velocity-journey">Journey</Label><Select value={form.journey} onValueChange={(v) => update("journey", v)}><SelectTrigger id="velocity-journey"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="forward">Forward</SelectItem><SelectItem value="return">Return · QC included</SelectItem></SelectContent></Select></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {([ ["weight", "Weight (g)"], ["length", "Length (cm)"], ["width", "Width (cm)"], ["height", "Height (cm)"] ] as const).map(([key, label]) => <div key={key}><Label htmlFor={`velocity-${key}`}>{label}</Label><Input id={`velocity-${key}`} type="number" min="0" value={form[key]} onChange={(e) => update(key, e.target.value)} /></div>)}
        {form.payment === "cod" && form.journey === "forward" && <div className="col-span-2"><Label htmlFor="velocity-value">Shipment value</Label><Input id="velocity-value" type="number" min="0" value={form.value} onChange={(e) => update("value", e.target.value)} /></div>}
      </div>
      <div className="flex flex-wrap gap-2"><Button disabled={busy} onClick={() => test("serviceability")}><RefreshCw className={`mr-2 h-4 w-4 ${busy ? "animate-spin motion-reduce:animate-none" : ""}`} />Check serviceability</Button><Button variant="outline" disabled={busy} onClick={() => test("rates")}>Get rates</Button></div>
      <div aria-live="polite" className="space-y-2 text-sm">
        {message && <p className="text-destructive">{message}</p>}
        {diagnostic && <><Badge variant={diagnostic.ok ? "default" : "destructive"}>{diagnostic.ok ? "Velocity accepted request" : "Check failed"}</Badge>{diagnostic.error && <p className="text-destructive">{diagnostic.error.message} · {diagnostic.error.code}{diagnostic.error.status ? ` · HTTP ${diagnostic.error.status}` : ""}</p>}<p className="break-all text-xs text-muted-foreground">{diagnostic.checkedAt} · {diagnostic.durationMs} ms · {diagnostic.retried ? "Authentication retried" : "No retry"}<br />Reference: {diagnostic.correlationId}</p>{diagnostic.ok && !carriers.length && <p>No eligible carriers returned.</p>}</>}
        {carriers.map((carrier, i) => <p key={`${i}-${carrier}`} className="border-b py-2">{carrier}</p>)}
      </div>
      <div className="border-t pt-3 text-sm"><h3 className="font-medium">Saved warehouses</h3>{isPending ? <p className="text-muted-foreground">Loading…</p> : isError ? <p className="text-destructive">Saved warehouses could not be loaded.</p> : warehouses?.length ? warehouses.map((w) => <div key={w.id} className="border-b py-2"><p>{w.name}</p><p className="text-muted-foreground">{[w.address_line1, w.city, w.state, w.pincode].filter(Boolean).join(", ")}</p></div>) : <p className="text-muted-foreground">No saved warehouses.</p>}<Badge variant="secondary" className="mt-2">Live warehouse sync unavailable · provider list endpoint not documented</Badge></div>
    </CardContent>
  </Card>;
}
