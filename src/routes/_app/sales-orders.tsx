import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, PageBody } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/_app/sales-orders")({
  component: () => (
    <>
      <PageHeader title="Sales Orders" description="Create sales orders. Production orders are created automatically." />
      <PageBody>
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          Sales order UI ships in Phase 3 (Production Module).
        </CardContent></Card>
      </PageBody>
    </>
  ),
});
