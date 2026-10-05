import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Markdown } from "./Markdown";
import { getContextualInsight } from "@/lib/ai.functions";

export type AiTopic =
  | "sales"
  | "profitability"
  | "inventory"
  | "production"
  | "receivables"
  | "suppliers";

const TITLES: Record<AiTopic, string> = {
  sales: "Explain this sales trend",
  profitability: "Analyze profitability",
  inventory: "Analyze stock",
  production: "Analyze production",
  receivables: "Analyze receivables",
  suppliers: "Analyze supplier pricing",
};

/**
 * Contextual AI action for existing ERP screens. Read-only: it explains the
 * data on screen and never changes ERP records.
 */
export function AiInsightButton({
  topic,
  focus,
  label,
  variant = "outline",
  size = "sm",
  className,
}: {
  topic: AiTopic;
  focus?: string;
  label?: string;
  variant?: "outline" | "ghost" | "secondary" | "default";
  size?: "sm" | "default" | "icon";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const run = useServerFn(getContextualInsight);
  const mutation = useMutation({
    mutationFn: () => run({ data: { topic, ...(focus ? { focus } : {}) } }),
  });

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        className={className}
        onClick={() => {
          setOpen(true);
          if (!mutation.data) mutation.mutate();
        }}
      >
        <Sparkles className="mr-1.5 h-4 w-4" />
        {label ?? "Ask AI"}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" /> {TITLES[topic]}
            </DialogTitle>
            <DialogDescription>
              Read-only analysis of your live ERP data. Nothing here changes any record.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[60vh] overflow-y-auto pr-1">
            {mutation.isPending && (
              <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Reading your ERP data…
              </div>
            )}
            {mutation.isError && (
              <p className="py-6 text-sm text-destructive">{(mutation.error as Error).message}</p>
            )}
            {mutation.data && !mutation.data.ok && (
              <p className="py-6 text-sm text-destructive">{mutation.data.error}</p>
            )}
            {mutation.data?.ok && <Markdown>{mutation.data.answer}</Markdown>}
          </div>

          <div className="flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
            >
              Regenerate
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
