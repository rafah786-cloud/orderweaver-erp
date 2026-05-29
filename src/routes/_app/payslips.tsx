import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, PageBody } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/_app/payslips")({
  component: () => (
    <>
      <PageHeader title="Payslips" description="Monthly payslips auto-calculated from attendance." />
      <PageBody>
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          Payslip generation UI ships in Phase 4.
        </CardContent></Card>
      </PageBody>
    </>
  ),
});
