import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, PageBody } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/_app/employees")({
  component: () => (
    <>
      <PageHeader title="Employees" description="Employee master with configurable pay structures." />
      <PageBody>
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          Employee management UI ships in Phase 4 (HR &amp; Attendance).
        </CardContent></Card>
      </PageBody>
    </>
  ),
});
