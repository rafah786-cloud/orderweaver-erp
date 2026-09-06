import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Loader2, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageBody, PageHeader } from "@/components/PageHeader";
import { AiInsightButton } from "@/components/ai/AiInsightButton";
import { getErpMetrics } from "@/lib/ai.functions";
import { inr } from "@/lib/format";

export const Route = createFileRoute("/_app/ai/insights")({ component: InsightsPage });

interface Anomaly {
  area: string;
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
}

interface ForecastData {
  sufficientData: boolean;
  basis: { monthsOfHistory: number; method: string };
  history: { month: string; revenue: number; grossProfit: number; grossMarginPct: number | null }[];
  revenueForecast: number[];
  revenueTrendConfidence: number;
  grossProfitForecast: number[];
  materialRequirements: {
    material: string;
    unit: string;
    currentStock: number;
    projectedConsumption30d: number;
    projectedConsumption90d: number;
    suggestedPurchaseFor90d: number;
  }[];
  disclaimer: string;
}

function nextMonths(count: number): string[] {
  const out: string[] = [];
  const d = new Date();
  for (let i = 1; i <= count; i++) {
    const m = new Date(d.getFullYear(), d.getMonth() + i, 1);
    out.push(m.toLocaleDateString("en-IN", { month: "short", year: "numeric" }));
  }
  return out;
}

function InsightsPage() {
  const metrics = useServerFn(getErpMetrics);

  const anomalies = useQuery({
    queryKey: ["ai-metrics", "anomalies"],
    queryFn: () => metrics({ data: { topic: "anomalies" } }),
  });
  const forecast = useQuery({
    queryKey: ["ai-metrics", "forecast"],
    queryFn: () => metrics({ data: { topic: "forecast" } }),
  });

  const anomalyList = ((anomalies.data?.data as { anomalies?: Anomaly[] } | undefined)?.anomalies ?? []) as Anomaly[];
  const fc = forecast.data?.data as ForecastData | undefined;
  const labels = nextMonths(fc?.revenueForecast.length ?? 0);

  return (
    <div>
      <PageHeader
        title="Insights & Forecasts"
        description="Anomalies detected statistically from your ERP history, plus trend-based estimates. All figures are calculated in the database."
        actions={<AiInsightButton topic="profitability" label="Explain the trend" />}
      />

      <PageBody>
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="h-4 w-4 text-amber-500" /> Anomaly detection
              </CardTitle>
            </CardHeader>
            <CardContent>
              {anomalies.isPending && (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Scanning sales, margins, stock, production, receivables and supplier prices…
                </p>
              )}
              {anomalies.error && <p className="text-sm text-destructive">{(anomalies.error as Error).message}</p>}
              {anomalies.data && anomalyList.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Nothing unusual detected. Statistical checks only run where there is enough history.
                </p>
              )}
              <div className="space-y-2">
                {anomalyList.map((a, i) => (
                  <div key={i} className="flex items-start gap-3 rounded-lg border p-3">
                    <Badge variant={a.severity === "high" ? "destructive" : "secondary"} className="mt-0.5 capitalize">
                      {a.severity}
                    </Badge>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{a.title}</p>
                      <p className="text-xs text-muted-foreground">{a.detail}</p>
                    </div>
                    <Badge variant="outline" className="ml-auto capitalize">{a.area}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="h-4 w-4" /> Forecasts
                <Badge variant="outline" className="ml-2 text-[10px]">Estimate</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {forecast.isPending && (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Building trend estimates…
                </p>
              )}
              {fc && !fc.sufficientData && (
                <p className="text-sm text-muted-foreground">
                  Not enough closed months of history yet ({fc.basis.monthsOfHistory}). Forecasts appear once there are at least four.
                </p>
              )}
              {fc?.sufficientData && (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">Revenue forecast</p>
                      <div className="mt-2 space-y-1">
                        {fc.revenueForecast.map((v, i) => (
                          <div key={i} className="flex justify-between text-sm">
                            <span>{labels[i]}</span>
                            <span className="font-medium">{inr(v)}</span>
                          </div>
                        ))}
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">Trend fit: {Math.round(fc.revenueTrendConfidence * 100)}%</p>
                    </div>
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">Gross profit forecast</p>
                      <div className="mt-2 space-y-1">
                        {fc.grossProfitForecast.map((v, i) => (
                          <div key={i} className="flex justify-between text-sm">
                            <span>{labels[i]}</span>
                            <span className="font-medium">{inr(v)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {fc.materialRequirements.length > 0 && (
                    <div>
                      <p className="mb-2 text-sm font-medium">Projected material requirements</p>
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Material</TableHead>
                              <TableHead className="text-right">In stock</TableHead>
                              <TableHead className="text-right">Next 30 days</TableHead>
                              <TableHead className="text-right">Next 90 days</TableHead>
                              <TableHead className="text-right">Suggested purchase</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {fc.materialRequirements.map((m) => (
                              <TableRow key={m.material}>
                                <TableCell>{m.material}</TableCell>
                                <TableCell className="text-right">{m.currentStock} {m.unit}</TableCell>
                                <TableCell className="text-right">{m.projectedConsumption30d}</TableCell>
                                <TableCell className="text-right">{m.projectedConsumption90d}</TableCell>
                                <TableCell className="text-right font-medium">{m.suggestedPurchaseFor90d}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground">{fc.disclaimer} Method: {fc.basis.method}.</p>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </PageBody>
    </div>
  );
}
