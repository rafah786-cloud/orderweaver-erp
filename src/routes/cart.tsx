import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { mattressModels } from "@/lib/zizz-store-catalog";
import {
  clearZizzQuoteCart,
  readZizzQuoteCart,
  removeZizzQuoteItem,
  setZizzQuoteQuantity,
  subscribeZizzQuoteCart,
  type ZizzQuoteCartItem,
} from "@/lib/zizz-quote-cart";

export const Route = createFileRoute("/cart")({
  head: () => ({ meta: [{ title: "Enquiry List | Zizz Mattress" }, { name: "robots", content: "noindex, follow" }] }),
  component: CartPage,
});

function CartPage() {
  const [items, setItems] = useState<ZizzQuoteCartItem[] | null>(null);

  useEffect(() => {
    const sync = () => setItems(readZizzQuoteCart());
    sync();
    return subscribeZizzQuoteCart(sync);
  }, []);

  const models = useMemo(
    () => (items ?? []).map((item) => ({ ...item, model: mattressModels.find((model) => model.slug === item.slug) })).filter((item) => item.model),
    [items],
  );

  const quoteDetails = useMemo(() => [
    "I would like a quotation for these Zizz Mattress models:",
    "",
    ...models.map(({ model, quantity }) => `• ${model!.name} (${model!.code}) — Quantity: ${quantity}`),
    "",
    "Please confirm available sizes, verified specifications, current price including applicable taxes, manufacturing lead time and delivery charges before I place an order.",
  ].join("\n"), [models]);

  const updateQuantity = (slug: string, quantity: number) => setItems(setZizzQuoteQuantity(slug, quantity));
  const removeItem = (slug: string) => setItems(removeZizzQuoteItem(slug));

  return (
    <main className="min-h-screen bg-[#f8f6f1] text-[#19364f]">
      <header className="border-b border-[#e5e0d7] bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <Link to="/" className="text-sm font-bold">ZIZZ <span className="font-normal text-[#89847b]">/ Enquiry list</span></Link>
          <Link to="/shop" className="text-sm font-semibold text-[#19364f] hover:text-[#9b6c2d]">Continue browsing</Link>
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-16">
        <Link to="/shop" className="inline-flex items-center gap-2 text-sm font-semibold text-[#8b6a3e]"><ArrowLeft className="h-4 w-4" /> Browse mattress models</Link>
        <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
          <div><p className="text-xs font-bold uppercase tracking-[.2em] text-[#a87838]">Your selection</p><h1 className="mt-2 text-4xl font-semibold tracking-tight">Mattress enquiry list</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-[#707976]">Collect models you are interested in, adjust quantities, then send one request to customer care. Your list is saved in this browser on this device.</p></div>
          {models.length > 0 && <button type="button" onClick={() => setItems(clearZizzQuoteCart())} className="inline-flex items-center gap-2 rounded-full border border-[#ddd5c8] bg-white px-4 py-2.5 text-sm font-semibold text-[#6a6861] hover:bg-[#f6f0e6]"><Trash2 className="h-4 w-4" /> Clear list</button>}
        </div>

        {items === null ? (
          <section className="mt-8 rounded-3xl border border-[#e5dfd5] bg-white p-10 text-center text-sm text-[#707976]" aria-live="polite">Loading your saved enquiry list…</section>
        ) : models.length === 0 ? (
          <section className="mt-8 rounded-3xl border border-[#e5dfd5] bg-white p-8 text-center sm:p-12">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#f4eee4]"><ShoppingBag className="h-7 w-7 text-[#8f6a36]" /></div>
            <h2 className="mt-5 text-xl font-semibold">Your enquiry list is empty</h2>
            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[#707976]">Add mattress models from the catalogue to ask customer care for confirmed sizes, specifications, availability and prices. No unverified prices or stock claims are shown.</p>
            <Link to="/shop" className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#19364f] px-6 py-3 text-sm font-bold text-white hover:bg-[#294c67]">Explore mattresses <ArrowRight className="h-4 w-4" /></Link>
          </section>
        ) : (
          <>
            <div className="mt-8 space-y-3">
              {models.map(({ slug, quantity, model }) => (
                <article key={slug} className="flex flex-col gap-4 rounded-2xl border border-[#e5dfd5] bg-white p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                  <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#a87838]">{model!.code}</p><h2 className="mt-1 text-lg font-semibold">{model!.name}</h2><p className="mt-1 text-sm text-[#737a78]">Price, size variants and availability will be confirmed by customer care.</p></div>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="inline-flex items-center rounded-full border border-[#e1dbd0] bg-[#fcfbf8] p-1" aria-label={`Quantity for ${model!.name}`}>
                      <button type="button" disabled={quantity <= 1} onClick={() => updateQuantity(slug, quantity - 1)} aria-label={`Decrease ${model!.name} quantity`} className="rounded-full p-2 disabled:opacity-30"><Minus className="h-4 w-4" /></button>
                      <span className="min-w-8 text-center text-sm font-semibold tabular-nums">{quantity}</span>
                      <button type="button" disabled={quantity >= 10} onClick={() => updateQuantity(slug, quantity + 1)} aria-label={`Increase ${model!.name} quantity`} className="rounded-full p-2 disabled:opacity-30"><Plus className="h-4 w-4" /></button>
                    </div>
                    <button type="button" onClick={() => removeItem(slug)} className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold text-[#9b6c2d] hover:bg-[#f8f2e8]"><Trash2 className="h-4 w-4" /> Remove</button>
                  </div>
                </article>
              ))}
            </div>
            <section className="mt-6 rounded-2xl border border-[#e5dfd5] bg-white p-5 sm:p-6">
              <div className="flex items-start gap-3"><div className="rounded-xl bg-[#f4eee4] p-2.5"><ShoppingBag className="h-5 w-5 text-[#8f6a36]" /></div><div><h2 className="font-semibold">Prices are not estimated or invented</h2><p className="mt-1 text-sm leading-6 text-[#707976]">This is a request-for-quotation list, not a paid shopping cart. The team will verify your required dimensions, live pricing, tax treatment and delivery before accepting an order.</p></div></div>
              <Link to="/contact" search={{ type: "product", details: quoteDetails }} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#19364f] px-6 py-3.5 text-sm font-bold text-white hover:bg-[#294c67] sm:w-auto">Request a quotation <ArrowRight className="h-4 w-4" /></Link>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
