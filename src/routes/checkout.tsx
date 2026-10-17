import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, CircleAlert, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/checkout")({
  head: () => ({ meta: [{ title: "Checkout | Zizz Mattress" }, { name: "robots", content: "noindex, follow" }] }),
  component: CheckoutPage,
});

function CheckoutPage() {
  const blockers = [
    "Verified size-wise product prices and tax treatment",
    "Product specifications, available variants and current fabric choices",
    "Confirmed shipping and serviceable-pincode rules",
    "Payment gateway merchant account and server-side credentials",
    "Published shipping, cancellation, return, warranty and privacy policies",
    "Verified legal business details and customer support contacts",
  ];
  return (
    <main className="min-h-screen bg-[#f8f6f1] text-[#19364f]">
      <header className="border-b border-[#e5e0d7] bg-white"><div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 sm:px-6"><Link to="/" className="text-sm font-bold">ZIZZ <span className="font-normal text-[#89847b]">/ Checkout</span></Link><span className="inline-flex items-center gap-2 text-xs font-semibold text-[#6e7775]"><ShieldCheck className="h-4 w-4" /> Protected checkout</span></div></header>
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 sm:py-16"><p className="text-xs font-bold uppercase tracking-[.2em] text-[#a87838]">Order setup</p><h1 className="mt-2 text-4xl font-semibold tracking-tight">Checkout</h1>
        <section className="mt-8 rounded-3xl border border-[#e5dfd5] bg-white p-6 sm:p-9"><div className="flex items-start gap-4"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#fbf0df]"><CircleAlert className="h-6 w-6 text-[#a16f2c]" /></div><div><h2 className="text-xl font-semibold">Checkout is safely disabled for now</h2><p className="mt-2 text-sm leading-6 text-[#707976]">This prevents incorrect charges or orders with missing prices, shipping terms or product details. The checkout will be enabled after these launch requirements are verified.</p></div></div>
          <ul className="mt-7 space-y-3 border-t border-[#eee9e1] pt-6">{blockers.map((item) => <li key={item} className="flex gap-3 text-sm leading-6 text-[#4f5b60]"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#b38a4c]" />{item}</li>)}</ul>
          <Link to="/shop" className="mt-7 inline-flex items-center gap-2 rounded-full bg-[#19364f] px-6 py-3 text-sm font-bold text-white hover:bg-[#294c67]"><ArrowLeft className="h-4 w-4" /> Return to shop</Link>
        </section>
      </div>
    </main>
  );
}
