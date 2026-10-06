/**
 * Minimal markdown renderer for AI answers — headings, bullets, bold, inline
 * code and simple pipe tables. Deliberately dependency-free and text-only:
 * no HTML from the model is ever injected into the page.
 */

function inline(text: string, keyPrefix: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  return parts.map((p, i) => {
    const key = `${keyPrefix}-${i}`;
    if (p.startsWith("**") && p.endsWith("**")) return <strong key={key}>{p.slice(2, -2)}</strong>;
    if (p.startsWith("`") && p.endsWith("`"))
      return (
        <code key={key} className="rounded bg-muted px-1 py-0.5 text-[0.85em]">
          {p.slice(1, -1)}
        </code>
      );
    return <span key={key}>{p}</span>;
  });
}

export function Markdown({ children, className = "" }: { children: string; className?: string }) {
  const lines = (children ?? "").split("\n");
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  let table: string[][] = [];

  const flushList = (key: string) => {
    if (list.length === 0) return;
    blocks.push(
      <ul key={key} className="my-2 list-disc space-y-1 pl-5">
        {list.map((li, i) => (
          <li key={`${key}-${i}`}>{inline(li, `${key}-${i}`)}</li>
        ))}
      </ul>,
    );
    list = [];
  };

  const flushTable = (key: string) => {
    if (table.length === 0) return;
    const [head, ...body] = table;
    blocks.push(
      <div key={key} className="my-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              {(head ?? []).map((c, i) => (
                <th key={i} className="px-2 py-1 text-left font-medium">
                  {inline(c, `${key}-h-${i}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((row, r) => (
              <tr key={r} className="border-b last:border-0">
                {row.map((c, i) => (
                  <td key={i} className="px-2 py-1 align-top">
                    {inline(c, `${key}-${r}-${i}`)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>,
    );
    table = [];
  };

  lines.forEach((raw, index) => {
    const line = raw.trimEnd();
    const key = `b-${index}`;
    if (/^\s*\|.*\|\s*$/.test(line)) {
      const cells = line.trim().slice(1, -1).split("|").map((c) => c.trim());
      if (cells.every((c) => /^:?-{2,}:?$/.test(c))) return;
      table.push(cells);
      return;
    }
    flushTable(`t-${index}`);

    if (/^\s*[-*•]\s+/.test(line)) {
      list.push(line.replace(/^\s*[-*•]\s+/, ""));
      return;
    }
    flushList(`l-${index}`);

    if (!line.trim()) return;
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1]!.length;
      blocks.push(
        <p key={key} className={level <= 2 ? "mt-4 mb-1 text-base font-semibold" : "mt-3 mb-1 text-sm font-semibold"}>
          {inline(heading[2] ?? "", key)}
        </p>,
      );
      return;
    }
    blocks.push(
      <p key={key} className="my-1.5 leading-relaxed">
        {inline(line, key)}
      </p>,
    );
  });

  flushList("l-end");
  flushTable("t-end");

  return <div className={`text-sm ${className}`}>{blocks}</div>;
}
