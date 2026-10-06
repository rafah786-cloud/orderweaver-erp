import { useState } from "react";
import { accountingPreflight } from "@/lib/accounting-preflight.functions";

export function AccountingPreflightButton() {
  const [result, setResult] = useState("");
  return (
    <div className="mb-4 rounded-md border p-3">
      <button
        type="button"
        className="rounded-md border px-3 py-2 text-sm"
        onClick={async () => {
          setResult("Running read-only preflight...");
          try {
            setResult(JSON.stringify(await accountingPreflight(), null, 2));
          } catch (err) {
            setResult(err instanceof Error ? err.message : "Preflight failed");
          }
        }}
      >
        Run accounting preflight
      </button>
      {result ? (
        <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap text-xs">{result}</pre>
      ) : null}
    </div>
  );
}
