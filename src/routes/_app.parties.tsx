import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, PageBody } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/_app/parties")({
  component: () => (
    <>
      <PageHeader title="Parties" description="Customer master with outstanding balance tracking." />
      <PageBody>
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          Party management UI ships in Phase 2 (Sales &amp; Invoicing).
        </CardContent></Card>
      </PageBody>
    </>
  ),
});
