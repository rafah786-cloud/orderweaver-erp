import { createFileRoute, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { sb, type Cheque, type BankAccount } from "@/lib/banking";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";

export const Route = createFileRoute("/_app/banking/cheque-print/$id")({ component: ChequePrint });

function numberToWords(n: number): string {
  if (n === 0) return "Zero";
  const a = ["","One","Two","Three","Four","Five","Six","Seven","Eight","Nine","Ten","Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen","Seventeen","Eighteen","Nineteen"];
  const b = ["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"];
  function two(x: number): string { return x < 20 ? a[x] : b[Math.floor(x/10)] + (x%10 ? " " + a[x%10] : ""); }
  function three(x: number): string { return x >= 100 ? a[Math.floor(x/100)] + " Hundred" + (x%100 ? " " + two(x%100) : "") : two(x); }
  const cr = Math.floor(n/10000000); n %= 10000000;
  const lk = Math.floor(n/100000); n %= 100000;
  const th = Math.floor(n/1000); n %= 1000;
  const hu = n;
  return [cr && three(cr)+" Crore", lk && three(lk)+" Lakh", th && three(th)+" Thousand", hu && three(hu)].filter(Boolean).join(" ");
}

function ChequePrint() {
  const { id } = useParams({ from: "/_app/banking/cheque-print/$id" });
  const [c, setC] = useState<Cheque | null>(null);
  const [acc, setAcc] = useState<BankAccount | null>(null);

  useEffect(() => {
    sb.from("cheques").select("*").eq("id", id).maybeSingle().then(async ({ data }) => {
      setC(data);
      if (data?.bank_account_id) {
        const { data: a } = await sb.from("bank_accounts").select("*").eq("id", data.bank_account_id).maybeSingle();
        setAcc(a);
      }
    });
  }, [id]);

  if (!c) return <div className="p-6">Loading...</div>;
  const amt = Number(c.amount);
  const words = numberToWords(Math.floor(amt)) + " Rupees Only";
  const date = new Date(c.cheque_date);
  const dd = String(date.getDate()).padStart(2, "0").split("");
  const mm = String(date.getMonth() + 1).padStart(2, "0").split("");
  const yyyy = String(date.getFullYear()).split("");

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4 print:hidden">
        <h1 className="text-xl font-semibold">Cheque Print Preview</h1>
        <Button onClick={() => window.print()}><Printer className="h-4 w-4 mr-2" />Print</Button>
      </div>

      <div className="bg-white text-black mx-auto" style={{ width: "8in", height: "3.66in", padding: "0.3in", position: "relative", border: "1px solid #ccc" }}>
        {/* Date boxes top-right */}
        <div style={{ position: "absolute", top: "0.3in", right: "0.4in", display: "flex", gap: "0.05in", fontFamily: "monospace", fontSize: "16px" }}>
          {[...dd, ...mm, ...yyyy].map((d, i) => (
            <span key={i} style={{ width: "0.22in", textAlign: "center", borderBottom: "1px solid #888" }}>{d}</span>
          ))}
        </div>

        {/* Pay */}
        <div style={{ position: "absolute", top: "0.85in", left: "0.6in", right: "1.8in" }}>
          <div style={{ fontFamily: "serif", fontSize: "18px", borderBottom: "1px dotted #888", paddingBottom: "2px" }}>{c.party_name}</div>
        </div>

        {/* Amount in words (2 lines) */}
        <div style={{ position: "absolute", top: "1.3in", left: "0.6in", right: "1.8in" }}>
          <div style={{ fontFamily: "serif", fontSize: "15px", borderBottom: "1px dotted #888", paddingBottom: "2px" }}>{words}</div>
        </div>

        {/* Amount in figures */}
        <div style={{ position: "absolute", top: "1.55in", right: "0.4in", fontFamily: "monospace", fontSize: "18px", border: "1px solid #888", padding: "4px 12px" }}>
          ₹ {amt.toLocaleString("en-IN")}
        </div>

        {/* Signature */}
        <div style={{ position: "absolute", bottom: "0.4in", right: "0.5in", textAlign: "center", fontSize: "11px" }}>
          <div style={{ borderTop: "1px solid #888", width: "1.8in", paddingTop: "2px" }}>Authorised Signatory</div>
          {acc && <div style={{ marginTop: "2px", fontWeight: 600 }}>{acc.name}</div>}
        </div>

        {/* Cheque # bottom-left */}
        <div style={{ position: "absolute", bottom: "0.3in", left: "0.5in", fontFamily: "monospace", fontSize: "11px", color: "#555" }}>
          Cheque #: {c.cheque_number}
        </div>
      </div>

      <p className="text-sm text-muted-foreground mt-4 print:hidden">
        Positions are configurable per bank — adjust via the bank account's cheque template (JSON) in a future revision.
      </p>
    </div>
  );
}
