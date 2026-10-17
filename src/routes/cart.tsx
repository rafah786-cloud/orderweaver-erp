import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ShoppingBag, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/cart")({
  head: () => ({ meta: [{ title: "Your Cart | Zizz Mattress" }, { name: "robots", content: "noindex, follow" }] }),
  component: CartPage,
});

function CartPage() {
  return (
    <main className="min-h-screen bg-[#f8f6f1] text-[#19364f]">
      <header className="border-b border-[#e5e0d7] bg-white"><div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6"><Link to="/" className="text-sm font-bold">ZIZZ <span className="font-normal text-[#89847b]">/ Cart</span></Link><span className="inline-flex items-center gap-2 text-xs font-semibold text-[#6e7775]"><ShieldCheck className="h-4 w-4" /> Secure order flow</span></div></header>
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16"><p className="text-xs font-bold uppercase tracking-[.2em] text-[#a87838]">Your selection</p><h1 className="mt-2 text-4xl font-semibold tracking-tight">Shopping cart</h1>
        <section className="mt-8 rounded-3xl border border-[#e5dfd5] bg-white p-7 sm:p-10"><div className="mx-auto flex max-w-lg flex-col items-center text-center"><div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#f4eee4]"><ShoppingBag className="h-7 w-7 text-[#8f6a36]" /></div><h2 className="mt-5 text-xl font-semibold">Your cart is ready for the collection</h2><p className="mt-3 text-sm leading-6 text-[#707976]">Online ordering is not enabled yet because the size-wise prices, verified product specifications, tax configuration, payment gateway and delivery settings have not been completed. No order or payment will be created until those checks are in place.</p><Link to="/shop" className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#19364f] px-6 py-3 text-sm font-bold text-white transition hover:bg-[#294c67]"><ArrowLeft className="h-4 w-4" /> Browse mattress models</Link></div></section>
      </div>
    </main>
  );
}
