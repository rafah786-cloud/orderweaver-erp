import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, PageBody } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/_app/attendance")({
  component: () => (
    <>
      <PageHeader title="Attendance" description="Daily attendance register with biometric CSV import." />
      <PageBody>
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          Attendance UI &amp; CSV import ship in Phase 4.
        </CardContent></Card>
      </PageBody>
    </>
  ),
});
