import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { sb } from "@/lib/banking";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Printer } from "lucide-react";

export const Route = createFileRoute("/_app/banking/payment-advice")({ component: PaymentAdvice });

function PaymentAdvice() {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [adv, setAdv] = useState({
    supplier_id: "",
    bank_account_id: "",
    advice_date: new Date().toISOString().slice(0, 10),
    amount: 0,
    payment_mode: "NEFT",
    reference: "",
    narration: "",
  });
  const [supplier, setSupplier] = useState<any>(null);
  const [account, setAccount] = useState<any>(null);

  useEffect(() => {
    sb.from("suppliers")
      .select("id,name,gstin,address")
      .order("name")
      .then(({ data }: { data: any }) => setSuppliers(data ?? []));
    sb.from("bank_accounts")
      .select("*")
      .eq("is_active", true)
      .order("name")
      .then(({ data }: { data: any }) => setAccounts(data ?? []));
  }, []);

  useEffect(() => {
    setSupplier(suppliers.find((s) => s.id === adv.supplier_id) ?? null);
  }, [adv.supplier_id, suppliers]);
  useEffect(() => {
    setAccount(accounts.find((a) => a.id === adv.bank_account_id) ?? null);
  }, [adv.bank_account_id, accounts]);

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Payment Advice"
        description="Generate printable payment advice for suppliers"
      />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass p-5 rounded-2xl space-y-3 print:hidden">
          <h3 className="font-semibold">Details</h3>
          <div>
            <Label>Supplier</Label>
            <Select
              value={adv.supplier_id}
              onValueChange={(v) => setAdv({ ...adv, supplier_id: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select supplier" />
              </SelectTrigger>
              <SelectContent>
                {suppliers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>From Bank Account</Label>
            <Select
              value={adv.bank_account_id}
              onValueChange={(v) => setAdv({ ...adv, bank_account_id: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name} — {a.account_number}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Date</Label>
              <Input
                type="date"
                value={adv.advice_date}
                onChange={(e) => setAdv({ ...adv, advice_date: e.target.value })}
              />
            </div>
            <div>
              <Label>Amount</Label>
              <Input
                type="number"
                value={adv.amount}
                onChange={(e) => setAdv({ ...adv, amount: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label>Mode</Label>
              <Select
                value={adv.payment_mode}
                onValueChange={(v) => setAdv({ ...adv, payment_mode: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NEFT">NEFT</SelectItem>
                  <SelectItem value="RTGS">RTGS</SelectItem>
                  <SelectItem value="IMPS">IMPS</SelectItem>
                  <SelectItem value="Cheque">Cheque</SelectItem>
                  <SelectItem value="Cash">Cash</SelectItem>
                  <SelectItem value="UPI">UPI</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Reference / UTR</Label>
              <Input
                value={adv.reference}
                onChange={(e) => setAdv({ ...adv, reference: e.target.value })}
              />
            </div>
          </div>
          <div>
            <Label>Narration</Label>
            <Textarea
              value={adv.narration}
              onChange={(e) => setAdv({ ...adv, narration: e.target.value })}
            />
          </div>
          <Button onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-2" />
            Print Advice
          </Button>
        </div>

        <div className="bg-white text-black p-8 rounded-2xl shadow print:shadow-none print:p-12">
          <div className="border-b-2 border-black pb-3 mb-6">
            <h1 className="text-2xl font-bold">PAYMENT ADVICE</h1>
            <div className="text-sm text-gray-600">Date: {adv.advice_date}</div>
          </div>
          <div className="mb-4">
            <div className="text-xs text-gray-500">To:</div>
            <div className="font-semibold text-lg">{supplier?.name ?? "—"}</div>
            {supplier?.gstin && <div className="text-sm">GSTIN: {supplier.gstin}</div>}
            {supplier?.address && (
              <div className="text-sm whitespace-pre-line">{supplier.address}</div>
            )}
          </div>
          <p className="mb-4">Dear Sir/Madam,</p>
          <p className="mb-4">
            We are pleased to advise you that the following payment has been made to your account:
          </p>
          <table className="w-full text-sm mb-4">
            <tbody>
              <tr>
                <td className="py-1 text-gray-600">Amount</td>
                <td className="py-1 font-semibold text-right">
                  ₹ {Number(adv.amount).toLocaleString("en-IN")}
                </td>
              </tr>
              <tr>
                <td className="py-1 text-gray-600">Payment Mode</td>
                <td className="py-1 text-right">{adv.payment_mode}</td>
              </tr>
              <tr>
                <td className="py-1 text-gray-600">Reference / UTR</td>
                <td className="py-1 text-right font-mono">{adv.reference || "—"}</td>
              </tr>
              <tr>
                <td className="py-1 text-gray-600">From Account</td>
                <td className="py-1 text-right">
                  {account ? `${account.bank_name} · ${account.account_number}` : "—"}
                </td>
              </tr>
            </tbody>
          </table>
          {adv.narration && (
            <div className="text-sm border-t pt-3 mb-4">
              <span className="text-gray-600">Narration: </span>
              {adv.narration}
            </div>
          )}
          <p className="mt-8">Kindly acknowledge receipt.</p>
          <div className="mt-12">
            <div className="text-sm">Yours faithfully,</div>
            <div className="font-semibold mt-8">Authorised Signatory</div>
          </div>
        </div>
      </div>
    </div>
  );
}
