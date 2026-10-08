import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, Send, Sparkles, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/PageHeader";
import { Markdown } from "@/components/ai/Markdown";
import { askMaestroFn, getAiStatus } from "@/lib/ai.functions";

export const Route = createFileRoute("/_app/ai/ask")({ component: AskPage });

const SUGGESTIONS = [
  "How many mattresses did we sell last month?",
  "Which products are most profitable?",
  "Which customers have overdue payments?",
  "Why did profit decrease?",
  "Which supplier prices increased?",
  "What should management pay attention to today?",
];

interface Turn {
  role: "user" | "assistant";
  content: string;
  retrievers?: string[];
  evidenceMeta?: {
    complete: boolean;
    truncatedSources: string[];
    answerState: "exact" | "calculated" | "forecast" | "interpretation" | "insufficient-data";
  };
}

function AskPage() {
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const statusFn = useServerFn(getAiStatus);
  const { data: status } = useQuery({ queryKey: ["ai-status"], queryFn: () => statusFn() });

  const ask = useServerFn(askMaestroFn);
  const mutation = useMutation({
    mutationFn: (q: string) => ask({ data: { question: q, conversationId } }),
    onSuccess: (res) => {
      setConversationId(res.conversationId ?? null);
      setTurns((t) => [
        ...t,
        {
          role: "assistant",
          content: res.ok ? res.answer : `**AI unavailable.** ${res.error}`,
          retrievers: res.usedRetrievers,
          evidenceMeta: res.ok ? res.evidenceMeta : undefined,
        },
      ]);
    },
    onError: (e: Error) => {
      setTurns((t) => [...t, { role: "assistant", content: `**AI unavailable.** ${e.message}` }]);
    },
  });

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, mutation.isPending]);

  const submit = (q: string) => {
    const text = q.trim();
    if (!text || mutation.isPending) return;
    setTurns((t) => [...t, { role: "user", content: text }]);
    setQuestion("");
    mutation.mutate(text);
  };

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Ask Mattress Maestro"
        description="Natural-language questions answered from your live ERP data. The assistant reads only — it never changes records."
      />

      {status && !status.configured && (
        <div className="mx-4 mb-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          The AI service is not configured yet. Add the <code>AI_API_KEY</code> secret (or keep <code>NVIDIA_API_KEY</code> for the default NVIDIA gateway) to enable
          answers. The rest of the ERP works normally.
        </div>
      )}

      <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-4">
        {turns.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Try one of these:</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <Button key={s} variant="outline" size="sm" onClick={() => submit(s)}>
                  {s}
                </Button>
              ))}
            </div>
          </div>
        )}

        {turns.map((turn, i) => (
          <div key={i} className={turn.role === "user" ? "flex justify-end" : ""}>
            <Card className={turn.role === "user" ? "max-w-[85%] bg-primary/10" : "w-full"}>
              <CardContent className="space-y-2 p-4">
                {turn.role === "assistant" && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Sparkles className="h-3.5 w-3.5" /> Mattress Maestro AI
                  </div>
                )}
                <Markdown>{turn.content}</Markdown>
                {turn.retrievers && turn.retrievers.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <Database className="h-3.5 w-3.5 text-muted-foreground" />
                    {turn.retrievers.map((r) => (
                      <Badge key={r} variant="secondary" className="text-[10px]">
                        {r}
                      </Badge>
                    ))}
                  </div>
                )}
                {turn.evidenceMeta && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <Badge variant={turn.evidenceMeta.complete ? "secondary" : "destructive"} className="text-[10px]">
                      Evidence: {turn.evidenceMeta.complete ? "complete" : "partial"}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      {turn.evidenceMeta.answerState}
                    </Badge>
                    {!turn.evidenceMeta.complete && (
                      <span className="text-[10px] text-destructive">
                        Some source data was incomplete; treat this answer as non-authoritative.
                      </span>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        ))}

        {mutation.isPending && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Retrieving ERP data and analysing…
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="border-t bg-background/80 p-4 backdrop-blur">
        <div className="flex gap-2">
          <Textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask about sales, margins, stock, production, customers or suppliers…"
            rows={2}
            className="resize-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit(question);
              }
            }}
          />
          <Button
            onClick={() => submit(question)}
            disabled={mutation.isPending || !question.trim()}
            className="self-end"
          >
            {mutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Answers are generated from figures calculated directly in the database. Always confirm
          before acting on a recommendation.
        </p>
      </div>
    </div>
  );
}
