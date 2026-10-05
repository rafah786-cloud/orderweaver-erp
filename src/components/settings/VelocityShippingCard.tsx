import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { RefreshCw, Truck } from "lucide-react";
import {
  listVelocityWarehouses,
  syncVelocityWarehouses,
  testVelocityAuth,
} from "@/lib/velocity.functions";

export function VelocityShippingCard() {
  const qc = useQueryClient();
  const listFn = useServerFn(listVelocityWarehouses);
  const syncFn = useServerFn(syncVelocityWarehouses);
  const authFn = useServerFn(testVelocityAuth);
  const [busy, setBusy] = useState<"sync" | "auth" | null>(null);

  const { data: warehouses } = useQuery({
    queryKey: ["velocity-warehouses"],
    queryFn: () => listFn(),
  });

  const handleSync = async () => {
    setBusy("sync");
    try {
      const res = await syncFn();
      if (res.ok) {
        toast.success(
          `Pulled ${res.synced} warehouse${res.synced === 1 ? "" : "s"} from Velocity.`,
        );
        await qc.invalidateQueries({ queryKey: ["velocity-warehouses"] });
      } else {
        toast.error(res.error ?? "Velocity warehouse sync failed.");
      }
    } catch {
      toast.error("Velocity warehouse sync failed.");
    } finally {
      setBusy(null);
    }
  };

  const handleAuth = async () => {
    setBusy("auth");
    try {
      const res = await authFn({ data: {} });
      if (res.ok) toast.success(`Velocity connected (token ${res.source}).`);
      else toast.error(res.error ?? "Velocity authentication failed.");
    } catch {
      toast.error("Velocity authentication failed.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2">
          <Truck className="h-4 w-4" /> Velocity Shipping
        </CardTitle>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={handleAuth} disabled={busy !== null}>
            Test connection
          </Button>
          <Button size="sm" onClick={handleSync} disabled={busy !== null}>
            <RefreshCw className={`mr-2 h-4 w-4 ${busy === "sync" ? "animate-spin" : ""}`} />
            Pull warehouses
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {!warehouses?.length ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No Velocity warehouses yet. Use “Pull warehouses” to import them.
          </p>
        ) : (
          <div className="space-y-2">
            {warehouses.map((w) => (
              <div key={w.id} className="rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium">{w.name}</div>
                  <Badge variant={w.is_active ? "default" : "secondary"}>
                    {w.is_active ? "Active" : "Inactive"}
                  </Badge>
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {[w.address_line1, w.address_line2, w.city, w.state, w.pincode]
                    .filter(Boolean)
                    .join(", ") || "—"}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {[w.contact_person, w.phone].filter(Boolean).join(" · ")}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
