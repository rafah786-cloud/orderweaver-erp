import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, PageBody } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/_app/invoices")({
  component: () => (
    <>
      <PageHeader title="Invoices" description="Invoice creation with credit-limit and overdue blocking." />
      <PageBody>
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          Invoicing UI ships in Phase 2. Blocking rules are already enforced in the database schema.
        </CardContent></Card>
      </PageBody>
    </>
  ),
});
