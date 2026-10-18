import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/lib/company-context";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader, PageBody } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Fuel, Gauge, Plus, Truck, Wrench } from "lucide-react";
import { toast } from "sonner";

const db = supabase as any;
type Vehicle = {
  id: string; company_id: string; vehicle_code: string; registration_number: string;
  vehicle_type: string; make_model: string | null; fuel_type: string;
  current_odometer_km: number; status: string; insurance_expiry: string | null;
  permit_expiry: string | null; fitness_expiry: string | null; pollution_expiry: string | null;
};
type FuelLog = {
  id: string; vehicle_id: string; refuelled_at: string; odometer_km: number;
  litres: number; unit_price: number; total_amount: number; fuel_station: string | null;
  receipt_reference: string | null; payment_method: string;
};
const money = (value: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(value);
const dateLabel = (value: string | null) => value ? new Date(value + (value.length === 10 ? "T00:00:00" : "")).toLocaleDateString("en-IN") : "Not set";

export const Route = createFileRoute("/_app/fleet")({ component: FleetPage });

function FleetPage() {
  const { activeCompany, loading: companyLoading } = useCompany();
  const { hasAnyRole } = useAuth();
  const canManage = hasAnyRole(["admin", "accountant", "production"]);
  const qc = useQueryClient();
  const [vehicleOpen, setVehicleOpen] = useState(false);
  const [fuelOpen, setFuelOpen] = useState(false);
  const [vehicleForm, setVehicleForm] = useState({
    vehicle_code: "", registration_number: "", vehicle_type: "truck", make_model: "",
    fuel_type: "diesel", current_odometer_km: "0", insurance_expiry: "", permit_expiry: "",
    fitness_expiry: "", pollution_expiry: "",
  });
  const [fuelForm, setFuelForm] = useState({
    vehicle_id: "", odometer_km: "", litres: "", unit_price: "", fuel_station: "",
    receipt_reference: "", payment_method: "company_card", refuelled_at: new Date().toISOString().slice(0, 16),
  });

  const vehiclesQuery = useQuery({
    queryKey: ["fleet-vehicles", activeCompany?.id],
    enabled: !companyLoading && Boolean(activeCompany?.id),
    queryFn: async () => {
      if (!activeCompany?.id) throw new Error("Select a company to view fleet records.");
      const { data, error } = await db.from("fleet_vehicles").select("*").eq("company_id", activeCompany.id).order("registration_number");
      if (error) throw error;
      return (data ?? []) as Vehicle[];
    },
  });
  const fuelQuery = useQuery({
    queryKey: ["fleet-fuel", activeCompany?.id],
    enabled: !companyLoading && Boolean(activeCompany?.id),
    queryFn: async () => {
      if (!activeCompany?.id) throw new Error("Select a company to view fuel records.");
      const { data, error } = await db.from("fleet_fuel_logs").select("id,vehicle_id,refuelled_at,odometer_km,litres,unit_price,total_amount,fuel_station,receipt_reference,payment_method").eq("company_id", activeCompany.id).order("refuelled_at", { ascending: false }).limit(200);
      if (error) throw error;
      return (data ?? []) as FuelLog[];
    },
  });
  const vehicleById = useMemo(() => new Map((vehiclesQuery.data ?? []).map(v => [v.id, v])), [vehiclesQuery.data]);
  const fuelSpend = (fuelQuery.data ?? []).reduce((sum, log) => sum + Number(log.total_amount || 0), 0);
  const litres = (fuelQuery.data ?? []).reduce((sum, log) => sum + Number(log.litres || 0), 0);
  const docsDue = (vehiclesQuery.data ?? []).reduce((sum, v) => sum + [v.insurance_expiry, v.permit_expiry, v.fitness_expiry, v.pollution_expiry].filter(d => d && new Date(d + "T23:59:59") < new Date(Date.now() + 30 * 86400000)).length, 0);

  const addVehicle = useMutation({
    mutationFn: async () => {
      if (!activeCompany?.id) throw new Error("Select a company first.");
      if (!vehicleForm.vehicle_code.trim() || !vehicleForm.registration_number.trim()) throw new Error("Vehicle code and registration number are required.");
      const payload = {
        company_id: activeCompany.id, vehicle_code: vehicleForm.vehicle_code.trim().toUpperCase(),
        registration_number: vehicleForm.registration_number.trim().toUpperCase(),
        vehicle_type: vehicleForm.vehicle_type, make_model: vehicleForm.make_model.trim() || null,
        fuel_type: vehicleForm.fuel_type, current_odometer_km: Number(vehicleForm.current_odometer_km || 0),
        insurance_expiry: vehicleForm.insurance_expiry || null, permit_expiry: vehicleForm.permit_expiry || null,
        fitness_expiry: vehicleForm.fitness_expiry || null, pollution_expiry: vehicleForm.pollution_expiry || null,
        created_by: (await supabase.auth.getUser()).data.user?.id ?? null,
      };
      const { error } = await db.from("fleet_vehicles").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Vehicle added.");
      setVehicleOpen(false);
      setVehicleForm({ vehicle_code: "", registration_number: "", vehicle_type: "truck", make_model: "", fuel_type: "diesel", current_odometer_km: "0", insurance_expiry: "", permit_expiry: "", fitness_expiry: "", pollution_expiry: "" });
      qc.invalidateQueries({ queryKey: ["fleet-vehicles", activeCompany?.id] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const addFuel = useMutation({
    mutationFn: async () => {
      if (!activeCompany?.id) throw new Error("Select a company first.");
      const litresValue = Number(fuelForm.litres), priceValue = Number(fuelForm.unit_price), odometerValue = Number(fuelForm.odometer_km);
      if (!fuelForm.vehicle_id || !fuelForm.odometer_km || litresValue <= 0 || priceValue < 0 || !Number.isFinite(odometerValue)) throw new Error("Select a vehicle and enter valid odometer, litres and unit price.");
      const vehicle = vehicleById.get(fuelForm.vehicle_id);
      if (!vehicle) throw new Error("The selected vehicle is not in the active company.");
      if (odometerValue < Number(vehicle.current_odometer_km)) throw new Error("Fuel odometer cannot be lower than the vehicle's recorded odometer.");
      const { error } = await db.from("fleet_fuel_logs").insert({
        company_id: activeCompany.id, vehicle_id: fuelForm.vehicle_id,
        refuelled_at: new Date(fuelForm.refuelled_at).toISOString(), odometer_km: odometerValue,
        litres: litresValue, unit_price: priceValue, fuel_station: fuelForm.fuel_station.trim() || null,
        receipt_reference: fuelForm.receipt_reference.trim() || null, payment_method: fuelForm.payment_method,
        created_by: (await supabase.auth.getUser()).data.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Fuel record saved.");
      setFuelOpen(false);
      setFuelForm({ vehicle_id: "", odometer_km: "", litres: "", unit_price: "", fuel_station: "", receipt_reference: "", payment_method: "company_card", refuelled_at: new Date().toISOString().slice(0, 16) });
      qc.invalidateQueries({ queryKey: ["fleet-fuel", activeCompany?.id] });
      qc.invalidateQueries({ queryKey: ["fleet-vehicles", activeCompany?.id] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const loadError = vehiclesQuery.error || fuelQuery.error;
  const loading = companyLoading || vehiclesQuery.isLoading || fuelQuery.isLoading;
  return (
    <>
      <PageHeader title="Fleet & Fuel" description={activeCompany ? `Vehicles and fuel records · ${activeCompany.display_name}` : "Vehicle register, fuel records and compliance reminders"} actions={
        <div className="flex flex-wrap gap-2">
          {canManage && <Dialog open={fuelOpen} onOpenChange={setFuelOpen}><DialogTrigger asChild><Button variant="outline" disabled={!vehiclesQuery.data?.length}><Fuel className="mr-2 h-4 w-4" />Record fuel</Button></DialogTrigger><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg"><DialogHeader><DialogTitle>Record fuel fill-up</DialogTitle></DialogHeader>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2"><Label>Vehicle</Label><Select value={fuelForm.vehicle_id} onValueChange={value => setFuelForm(s => ({ ...s, vehicle_id: value }))}><SelectTrigger><SelectValue placeholder="Select vehicle" /></SelectTrigger><SelectContent>{(vehiclesQuery.data ?? []).map(v => <SelectItem key={v.id} value={v.id}>{v.registration_number} · {v.vehicle_code}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1"><Label>Date & time</Label><Input type="datetime-local" value={fuelForm.refuelled_at} onChange={e => setFuelForm(s => ({ ...s, refuelled_at: e.target.value }))} /></div>
              <div className="space-y-1"><Label>Odometer (km)</Label><Input type="number" min="0" step="0.1" value={fuelForm.odometer_km} onChange={e => setFuelForm(s => ({ ...s, odometer_km: e.target.value }))} /></div>
              <div className="space-y-1"><Label>Fuel (litres)</Label><Input type="number" min="0.001" step="0.001" value={fuelForm.litres} onChange={e => setFuelForm(s => ({ ...s, litres: e.target.value }))} /></div>
              <div className="space-y-1"><Label>Price per litre (₹)</Label><Input type="number" min="0" step="0.01" value={fuelForm.unit_price} onChange={e => setFuelForm(s => ({ ...s, unit_price: e.target.value }))} /></div>
              <div className="space-y-1"><Label>Fuel station</Label><Input value={fuelForm.fuel_station} onChange={e => setFuelForm(s => ({ ...s, fuel_station: e.target.value }))} /></div>
              <div className="space-y-1"><Label>Receipt reference (optional)</Label><Input value={fuelForm.receipt_reference} onChange={e => setFuelForm(s => ({ ...s, receipt_reference: e.target.value }))} /></div>
              <div className="space-y-1"><Label>Payment method</Label><Select value={fuelForm.payment_method} onValueChange={value => setFuelForm(s => ({ ...s, payment_method: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="cash">Cash</SelectItem><SelectItem value="company_card">Company card</SelectItem><SelectItem value="fuel_card">Fuel card</SelectItem><SelectItem value="upi">UPI</SelectItem><SelectItem value="other">Other</SelectItem></SelectContent></Select></div>
              <div className="sm:col-span-2 text-sm text-muted-foreground">Calculated total: <strong>{money(Math.max(0, Number(fuelForm.litres || 0) * Number(fuelForm.unit_price || 0)))}</strong></div>
              <Button className="sm:col-span-2 min-h-11" onClick={() => addFuel.mutate()} disabled={addFuel.isPending}>{addFuel.isPending ? "Saving…" : "Save fuel record"}</Button>
            </div>
          </DialogContent></Dialog>}
          {canManage && <Dialog open={vehicleOpen} onOpenChange={setVehicleOpen}><DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />Add vehicle</Button></DialogTrigger><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg"><DialogHeader><DialogTitle>Add fleet vehicle</DialogTitle></DialogHeader>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1"><Label>Fleet code</Label><Input value={vehicleForm.vehicle_code} onChange={e => setVehicleForm(s => ({ ...s, vehicle_code: e.target.value }))} /></div>
              <div className="space-y-1"><Label>Registration number</Label><Input value={vehicleForm.registration_number} onChange={e => setVehicleForm(s => ({ ...s, registration_number: e.target.value }))} /></div>
              <div className="space-y-1"><Label>Vehicle type</Label><Select value={vehicleForm.vehicle_type} onValueChange={value => setVehicleForm(s => ({ ...s, vehicle_type: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="truck">Truck</SelectItem><SelectItem value="van">Van</SelectItem><SelectItem value="car">Car</SelectItem><SelectItem value="three_wheeler">Three-wheeler</SelectItem><SelectItem value="two_wheeler">Two-wheeler</SelectItem><SelectItem value="other">Other</SelectItem></SelectContent></Select></div>
              <div className="space-y-1"><Label>Fuel type</Label><Select value={vehicleForm.fuel_type} onValueChange={value => setVehicleForm(s => ({ ...s, fuel_type: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="diesel">Diesel</SelectItem><SelectItem value="petrol">Petrol</SelectItem><SelectItem value="cng">CNG</SelectItem><SelectItem value="electric">Electric</SelectItem><SelectItem value="hybrid">Hybrid</SelectItem><SelectItem value="other">Other</SelectItem></SelectContent></Select></div>
              <div className="space-y-1 sm:col-span-2"><Label>Make / model</Label><Input value={vehicleForm.make_model} onChange={e => setVehicleForm(s => ({ ...s, make_model: e.target.value }))} /></div>
              <div className="space-y-1"><Label>Current odometer (km)</Label><Input type="number" min="0" step="0.1" value={vehicleForm.current_odometer_km} onChange={e => setVehicleForm(s => ({ ...s, current_odometer_km: e.target.value }))} /></div>
              {(["insurance_expiry","permit_expiry","fitness_expiry","pollution_expiry"] as const).map(key => <div key={key} className="space-y-1"><Label>{({insurance_expiry:"Insurance expiry",permit_expiry:"Permit expiry",fitness_expiry:"Fitness expiry",pollution_expiry:"PUC expiry"})[key]}</Label><Input type="date" value={vehicleForm[key]} onChange={e => setVehicleForm(s => ({ ...s, [key]: e.target.value }))} /></div>)}
              <Button className="sm:col-span-2 min-h-11" onClick={() => addVehicle.mutate()} disabled={addVehicle.isPending}>{addVehicle.isPending ? "Saving…" : "Save vehicle"}</Button>
            </div>
          </DialogContent></Dialog>}
        </div>
      } />
      <PageBody>
        {loadError && <div role="alert" className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm"><AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />Fleet records could not be loaded. Check your company access and retry.</div>}
        {loading && <div role="status" className="mb-4 rounded-lg border p-4 text-sm text-muted-foreground">Loading fleet records…</div>}
        {!loading && !loadError && <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Card><CardContent className="flex items-center gap-3 p-4"><Truck className="h-5 w-5 text-primary" /><div><p className="text-xs text-muted-foreground">Vehicles</p><p className="text-2xl font-semibold">{vehiclesQuery.data?.length ?? 0}</p></div></CardContent></Card>
            <Card><CardContent className="flex items-center gap-3 p-4"><Fuel className="h-5 w-5 text-primary" /><div><p className="text-xs text-muted-foreground">Fuel logged · latest 200</p><p className="text-2xl font-semibold">{money(fuelSpend)}</p><p className="text-xs text-muted-foreground">{litres.toFixed(1)} litres</p></div></CardContent></Card>
            <Card><CardContent className="flex items-center gap-3 p-4"><Gauge className="h-5 w-5 text-primary" /><div><p className="text-xs text-muted-foreground">Combined odometer readings</p><p className="text-2xl font-semibold">{(vehiclesQuery.data ?? []).reduce((sum,v)=>sum+Number(v.current_odometer_km||0),0).toLocaleString("en-IN")} km</p></div></CardContent></Card>
            <Card><CardContent className="flex items-center gap-3 p-4"><AlertTriangle className="h-5 w-5 text-primary" /><div><p className="text-xs text-muted-foreground">Documents due within 30 days / overdue</p><p className="text-2xl font-semibold">{docsDue}</p></div></CardContent></Card>
          </div>
          <Card className="mb-4"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Truck className="h-4 w-4" />Vehicle register</CardTitle></CardHeader><CardContent>
            {(vehiclesQuery.data ?? []).length === 0 ? <p className="py-5 text-sm text-muted-foreground">No vehicles registered for this company yet.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead className="border-b bg-muted/30"><tr className="text-left"><th className="p-3">Vehicle</th><th className="p-3">Type / fuel</th><th className="p-3">Odometer</th><th className="p-3">Status</th><th className="p-3">Compliance</th></tr></thead><tbody className="divide-y">{(vehiclesQuery.data ?? []).map(v => <tr key={v.id}><td className="p-3"><div className="font-medium">{v.registration_number}</div><div className="text-xs text-muted-foreground">{v.vehicle_code}{v.make_model ? ` · ${v.make_model}` : ""}</div></td><td className="p-3 capitalize">{v.vehicle_type.replaceAll("_"," ")} / {v.fuel_type}</td><td className="p-3 tabular-nums">{Number(v.current_odometer_km).toLocaleString("en-IN")} km</td><td className="p-3"><Badge variant={v.status === "active" ? "default" : "secondary"}>{v.status}</Badge></td><td className="p-3 text-xs"><div>Insurance: {dateLabel(v.insurance_expiry)}</div><div>Permit: {dateLabel(v.permit_expiry)}</div><div>Fitness: {dateLabel(v.fitness_expiry)}</div><div>PUC: {dateLabel(v.pollution_expiry)}</div></td></tr>)}</tbody></table></div>}
          </CardContent></Card>
          <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Fuel className="h-4 w-4" />Fuel history</CardTitle></CardHeader><CardContent>
            {(fuelQuery.data ?? []).length === 0 ? <p className="py-5 text-sm text-muted-foreground">No fuel records yet. Use Record fuel to start the audit trail.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead className="border-b bg-muted/30"><tr className="text-left"><th className="p-3">Date</th><th className="p-3">Vehicle</th><th className="p-3">Odometer</th><th className="p-3">Litres</th><th className="p-3">Rate</th><th className="p-3">Total</th><th className="p-3">Receipt</th></tr></thead><tbody className="divide-y">{(fuelQuery.data ?? []).map(log => <tr key={log.id}><td className="p-3 whitespace-nowrap">{new Date(log.refuelled_at).toLocaleString("en-IN")}</td><td className="p-3">{vehicleById.get(log.vehicle_id)?.registration_number ?? "Vehicle unavailable"}</td><td className="p-3 tabular-nums">{Number(log.odometer_km).toLocaleString("en-IN")} km</td><td className="p-3 tabular-nums">{Number(log.litres).toFixed(3)}</td><td className="p-3 tabular-nums">{money(Number(log.unit_price))}</td><td className="p-3 tabular-nums font-medium">{money(Number(log.total_amount))}</td><td className="p-3">{log.receipt_reference ?? "—"}</td></tr>)}</tbody></table></div>}
          </CardContent></Card>
          <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground"><Wrench className="mt-0.5 h-3.5 w-3.5 shrink-0" />Fuel totals cover the latest 200 entries only. Fuel records are append-only; correct mistakes by creating a documented adjustment process, not by editing history.</p>
        </>}
      </PageBody>
    </>
  );
}
