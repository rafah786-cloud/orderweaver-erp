import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageBody, PageHeader } from "@/components/PageHeader";
import { naturalLanguageSearch } from "@/lib/ai.functions";

export const Route = createFileRoute("/_app/ai/search")({ component: SearchPage });

const EXAMPLES = [
  "Show invoices above ₹1 lakh that are overdue",
  "Show all purchases from this month",
  "Find customers who haven't purchased in six months",
  "Show production records with unusually high wastage",
];

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function SearchPage() {
  const [question, setQuestion] = useState("");
  const run = useServerFn(naturalLanguageSearch);
  const mutation = useMutation({ mutationFn: (q: string) => run({ data: { question: q } }) });

  const rows = (mutation.data?.rows ?? []) as Record<string, unknown>[];
  const columns = rows.length > 0 ? Object.keys(rows[0] as Record<string, unknown>) : [];

  const submit = (q: string) => {
    const text = q.trim();
    if (!text) return;
    setQuestion(text);
    mutation.mutate(text);
  };

  return (
    <div>
      <PageHeader
        title="Smart Search"
        description="Describe what you want to find in plain language. Searches run through a controlled, read-only query layer — never free-form SQL."
      />

      <PageBody>
        <div className="space-y-4">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              submit(question);
            }}
          >
            <Input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="e.g. overdue invoices above ₹1 lakh"
            />
            <Button type="submit" disabled={mutation.isPending || !question.trim()}>
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </form>

          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((e) => (
              <Button key={e} variant="outline" size="sm" onClick={() => submit(e)}>
                {e}
              </Button>
            ))}
          </div>

          {mutation.isError && <p className="text-sm text-destructive">{(mutation.error as Error).message}</p>}
          {mutation.data && !mutation.data.ok && <p className="text-sm text-destructive">{mutation.data.error}</p>}

          {mutation.data?.ok && (
            <Card>
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{mutation.data.label}</Badge>
                  <span className="text-sm text-muted-foreground">
                    {mutation.data.rowCount} result{mutation.data.rowCount === 1 ? "" : "s"}
                    {mutation.data.truncated ? " (showing the first page)" : ""}
                  </span>
                </div>

                {rows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nothing matched that description.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {columns.map((c) => (
                            <TableHead key={c} className="whitespace-nowrap capitalize">
                              {c.replace(/_/g, " ")}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.map((r, i) => (
                          <TableRow key={i}>
                            {columns.map((c) => (
                              <TableCell key={c} className="whitespace-nowrap">
                                {cellText(r[c])}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </PageBody>
    </div>
  );
}
