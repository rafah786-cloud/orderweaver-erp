import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, CircleAlert, ShieldCheck, CreditCard, LoaderCircle, CheckCircle2 } from "lucide-react";
import { useEffect, useState } from "react";

type RazorpayOptions = {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  handler: (response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => void | Promise<void>;
  modal: { ondismiss: () => void };
  theme: { color: string };
};
type RazorpayInstance = {
  open: () => void;
  on: (event: "payment.failed", handler: (response: { error?: { description?: string; reason?: string } }) => void) => void;
};
declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

export const Route = createFileRoute("/checkout")({
  head: () => ({ meta: [{ title: "Checkout | Zizz Mattress" }, { name: "robots", content: "noindex, follow" }] }),
  component: CheckoutPage,
});

function CheckoutPage() {
  const [loading, setLoading] = useState(false);
  const [scriptReady, setScriptReady] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "success" | "info"; text: string } | null>(null);

  useEffect(() => {
    if (window.Razorpay) {
      setScriptReady(true);
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>('script[data-razorpay-checkout="true"]');
    const script = existing ?? document.createElement("script");
    const onLoad = () => setScriptReady(true);
    const onError = () => setMessage({ kind: "error", text: "Razorpay Checkout could not load. Check your connection and refresh this page." });
    script.addEventListener("load", onLoad);
    script.addEventListener("error", onError);
    if (!existing) {
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      script.dataset.razorpayCheckout = "true";
      document.body.appendChild(script);
    }
    return () => {
      script.removeEventListener("load", onLoad);
      script.removeEventListener("error", onError);
    };
  }, []);

  async function startTestPayment() {
    if (!window.Razorpay || loading) return;
    setLoading(true);
    setMessage(null);
    try {
      const orderResponse = await fetch("/api/public/razorpay/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const orderData = await orderResponse.json() as {
        ok?: boolean; error?: string; key_id?: string; order_id?: string; amount?: number; currency?: string;
      };
      if (!orderResponse.ok || !orderData.ok || !orderData.key_id || !orderData.order_id || !orderData.amount || !orderData.currency) {
        throw new Error(orderData.error || "Unable to create a Razorpay test order.");
      }

      const checkout = new window.Razorpay({
        key: orderData.key_id,
        amount: orderData.amount,
        currency: orderData.currency,
        name: "Zizz Mattress",
        description: "Razorpay Standard Checkout — test only",
        order_id: orderData.order_id,
        theme: { color: "#19364f" },
        modal: {
          ondismiss: () => {
            setLoading(false);
            setMessage({ kind: "info", text: "Test checkout was closed. No payment confirmation was received." });
          },
        },
        handler: async (response) => {
          try {
            const verifyResponse = await fetch("/api/public/razorpay/verify-payment", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(response),
            });
            const verifyData = await verifyResponse.json() as { ok?: boolean; verified?: boolean; error?: string; message?: string };
            if (!verifyResponse.ok || !verifyData.ok || !verifyData.verified) {
              throw new Error(verifyData.error || "Payment signature could not be verified.");
            }
            setMessage({ kind: "success", text: verifyData.message || "Test payment signature verified." });
          } catch (error) {
            setMessage({ kind: "error", text: error instanceof Error ? error.message : "Payment verification failed. Do not retry until you check the gateway status." });
          } finally {
            setLoading(false);
          }
        },
      });
      checkout.on("payment.failed", (response) => {
        setLoading(false);
        setMessage({ kind: "error", text: response.error?.description || response.error?.reason || "The test payment failed. No successful payment was confirmed." });
      });
      checkout.open();
    } catch (error) {
      setLoading(false);
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "Unable to start test checkout." });
    }
  }

  const blockers = [
    "Verified size-wise product prices and tax treatment",
    "Product specifications, available variants and current fabric choices",
    "Confirmed shipping and serviceable-pincode rules",
    "Server-side order records, inventory validation and fulfilment workflow",
    "Published shipping, cancellation, return, warranty and privacy policies",
    "Live merchant credentials, webhook verification and duplicate-event protection",
  ];

  return (
    <main className="min-h-screen bg-[#f8f6f1] text-[#19364f]">
      <header className="border-b border-[#e5e0d7] bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 sm:px-6">
          <Link to="/" className="text-sm font-bold">ZIZZ <span className="font-normal text-[#89847b]">/ Checkout</span></Link>
          <span className="inline-flex items-center gap-2 text-xs font-semibold text-[#6e7775]"><ShieldCheck className="h-4 w-4" /> Secure gateway</span>
        </div>
      </header>
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
        <p className="text-xs font-bold uppercase tracking-[.2em] text-[#a87838]">Payment integration</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight">Razorpay checkout</h1>
        <section className="mt-8 rounded-3xl border border-[#e5dfd5] bg-white p-6 sm:p-9">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#fbf0df]"><CreditCard className="h-6 w-6 text-[#a16f2c]" /></div>
            <div>
              <h2 className="text-xl font-semibold">Test the Standard Checkout flow</h2>
              <p className="mt-2 text-sm leading-6 text-[#707976]">This sandbox-only test uses a fixed amount configured on the server. It does not create a Zizz sales order, change inventory, or mark an ERP invoice as paid.</p>
            </div>
          </div>
          <div className="mt-6 rounded-2xl border border-[#e5dfd5] bg-[#fcfbf8] p-4">
            <p className="text-sm font-semibold">Test mode only</p>
            <p className="mt-1 text-sm leading-6 text-[#707976]">Configure RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and RAZORPAY_TEST_AMOUNT_PAISE in the server environment. The backend refuses live-mode keys and never accepts the amount from the browser.</p>
            <button type="button" onClick={startTestPayment} disabled={!scriptReady || loading} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#19364f] px-6 py-3.5 text-sm font-bold text-white hover:bg-[#294c67] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">
              {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
              {loading ? "Connecting to Razorpay…" : scriptReady ? "Open Razorpay test checkout" : "Loading Razorpay…"}
            </button>
          </div>
          {message && (
            <div role="status" aria-live="polite" className={`mt-4 flex items-start gap-2 rounded-xl border p-4 text-sm leading-6 ${message.kind === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : message.kind === "error" ? "border-red-200 bg-red-50 text-red-900" : "border-blue-200 bg-blue-50 text-blue-900"}`}>
              {message.kind === "success" ? <CheckCircle2 className="mt-1 h-4 w-4 shrink-0" /> : <CircleAlert className="mt-1 h-4 w-4 shrink-0" />}
              {message.text}
            </div>
          )}
          <div className="mt-8 border-t border-[#eee9e1] pt-6">
            <h3 className="font-semibold">Before enabling real customer payments</h3>
            <p className="mt-2 text-sm leading-6 text-[#707976]">The product catalogue is still a draft and has no authoritative prices or order persistence. Live checkout must remain disabled until these requirements are completed:</p>
            <ul className="mt-4 space-y-3">{blockers.map((item) => <li key={item} className="flex gap-3 text-sm leading-6 text-[#4f5b60]"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#b38a4c]" />{item}</li>)}</ul>
          </div>
          <Link to="/shop" className="mt-7 inline-flex items-center gap-2 rounded-full border border-[#d9d2c6] px-6 py-3 text-sm font-bold hover:bg-[#f8f2e8]"><ArrowLeft className="h-4 w-4" /> Return to shop</Link>
        </section>
      </div>
    </main>
  );
}
