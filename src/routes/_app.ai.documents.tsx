import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Loader2, Search, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageBody, PageHeader } from "@/components/PageHeader";
import {
  analyzeDocument,
  deleteAiDocument,
  listAiDocuments,
  searchDocuments,
} from "@/lib/ai.functions";
import { readDocumentFile } from "@/lib/ai/read-file";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/_app/ai/documents")({ component: DocumentsPage });

const KINDS = [
  { value: "purchase_invoice", label: "Purchase invoice" },
  { value: "sales_invoice", label: "Sales invoice" },
  { value: "quotation", label: "Quotation" },
  { value: "purchase_order", label: "Purchase order" },
  { value: "delivery_challan", label: "Delivery challan" },
  { value: "specification", label: "Specification / product doc" },
  { value: "other", label: "Other" },
] as const;

type Kind = (typeof KINDS)[number]["value"];

interface DocRow {
  id: string;
  title: string;
  doc_kind: string;
  file_name: string | null;
  extraction_status: string;
  extraction_error: string | null;
  quotation_group: string | null;
  created_at: string;
  suppliers: { name: string } | null;
  parties: { name: string } | null;
}

function DocumentsPage() {
  const qc = useQueryClient();
  const [kind, setKind] = useState<Kind>("purchase_invoice");
  const [group, setGroup] = useState("");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");

  const list = useServerFn(listAiDocuments);
  const analyze = useServerFn(analyzeDocument);
  const remove = useServerFn(deleteAiDocument);
  const search = useServerFn(searchDocuments);

  const docs = useQuery({ queryKey: ["ai-documents"], queryFn: () => list() });

  const del = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Document removed");
      qc.invalidateQueries({ queryKey: ["ai-documents"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const semantic = useMutation({ mutationFn: (q: string) => search({ data: { query: q } }) });

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        const parsed = await readDocumentFile(file);
        const res = await analyze({
          data: {
            title: file.name,
            docKind: kind,
            fileName: file.name,
            mimeType: file.type || "application/octet-stream",
            ...(parsed.text ? { text: parsed.text } : {}),
            ...(parsed.imageDataUrl ? { imageDataUrl: parsed.imageDataUrl } : {}),
            quotationGroup: group.trim() || null,
          },
        });
        if (res.ok) toast.success(`Read ${file.name}`);
        else toast.error(`${file.name}: ${res.error}`);
      }
      qc.invalidateQueries({ queryKey: ["ai-documents"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const rows = (docs.data ?? []) as unknown as DocRow[];

  return (
    <div>
      <PageHeader
        title="Document Reader"
        description="Upload invoices, quotations, purchase orders, challans or specifications. Extracted details are matched against your records — nothing is posted until you confirm it."
      />

      <PageBody>
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Upload className="h-4 w-4" /> Upload documents
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>Document type</Label>
                  <Select value={kind} onValueChange={(v) => setKind(v as Kind)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {KINDS.map((k) => (
                        <SelectItem key={k.value} value={k.value}>
                          {k.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Comparison group (optional)</Label>
                  <Input
                    value={group}
                    onChange={(e) => setGroup(e.target.value)}
                    placeholder="e.g. Foam Feb 2026"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Files</Label>
                  <Input
                    type="file"
                    multiple
                    accept=".pdf,.txt,.csv,.xml,image/*"
                    disabled={busy}
                    onChange={(e) => onFiles(e.target.files)}
                  />
                </div>
              </div>
              {busy && (
                <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Reading documents…
                </p>
              )}
              <p className="mt-3 text-xs text-muted-foreground">
                PDFs and text files are read in your browser; photos and scans are sent as images.
                Nothing is created in the ERP automatically.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Search className="h-4 w-4" /> Semantic document search
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (query.trim()) semantic.mutate(query.trim());
                }}
              >
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="e.g. previous quotations for bonnell springs"
                />
                <Button type="submit" disabled={semantic.isPending || !query.trim()}>
                  {semantic.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
                </Button>
              </form>
              {semantic.data && !semantic.data.ok && (
                <p className="text-sm text-destructive">{semantic.data.error}</p>
              )}
              {semantic.data?.ok &&
                (semantic.data.hits.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No related documents found.</p>
                ) : (
                  <div className="space-y-2">
                    {semantic.data.hits.map((h, i) => (
                      <div key={i} className="rounded-lg border p-3">
                        <div className="flex items-center gap-2">
                          <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-sm font-medium">{h.title}</span>
                          <Badge variant="outline" className="text-[10px] capitalize">
                            {String(h.docKind).replace(/_/g, " ")}
                          </Badge>
                        </div>
                        <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">
                          {h.excerpt}
                        </p>
                      </div>
                    ))}
                  </div>
                ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Uploaded documents</CardTitle>
            </CardHeader>
            <CardContent>
              {docs.isPending && (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                </p>
              )}
              {rows.length === 0 && !docs.isPending && (
                <p className="text-sm text-muted-foreground">No documents uploaded yet.</p>
              )}
              {rows.length > 0 && (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Document</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Matched to</TableHead>
                        <TableHead>Group</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Uploaded</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((d) => (
                        <TableRow key={d.id}>
                          <TableCell className="max-w-[240px] truncate">{d.title}</TableCell>
                          <TableCell className="capitalize">
                            {d.doc_kind.replace(/_/g, " ")}
                          </TableCell>
                          <TableCell>{d.suppliers?.name ?? d.parties?.name ?? "—"}</TableCell>
                          <TableCell>{d.quotation_group ?? "—"}</TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                d.extraction_status === "ready"
                                  ? "secondary"
                                  : d.extraction_status === "failed"
                                    ? "destructive"
                                    : "outline"
                              }
                              title={d.extraction_error ?? undefined}
                            >
                              {d.extraction_status}
                            </Badge>
                          </TableCell>
                          <TableCell>{formatDate(d.created_at)}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => del.mutate(d.id)}
                              disabled={del.isPending}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </PageBody>
    </div>
  );
}
