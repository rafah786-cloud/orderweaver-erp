import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle2, Heart, Info, MessageCircle, ShoppingBag } from "lucide-react";
import { useEffect, useState } from "react";
import { findMattressModel } from "@/lib/zizz-store-catalog";
import { readZizzWishlist, subscribeZizzWishlist, toggleZizzWishlist } from "@/lib/zizz-wishlist";
import { addZizzQuoteItem, readZizzQuoteCart, subscribeZizzQuoteCart } from "@/lib/zizz-quote-cart";

export const Route = createFileRoute("/shop/$slug")({
  loader: ({ params }) => {
    const model = findMattressModel(params.slug);
    if (!model) throw notFound();
    return { model };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData ? `${loaderData.model.name} Mattress | Zizz` : "Mattress Details | Zizz" },
      { name: "description", content: "Explore the model details and specifications for Zizz mattresses." },
      { name: "robots", content: "noindex, follow" },
    ],
  }),
  component: MattressDetailPage,
});

function MattressDetailPage() {
  const { model } = Route.useLoaderData();
  const [saved, setSaved] = useState(false);
  const [inQuoteList, setInQuoteList] = useState(false);
  useEffect(() => {
    const sync = () => {
      setSaved(readZizzWishlist().includes(model.slug));
      setInQuoteList(readZizzQuoteCart().some((item) => item.slug === model.slug));
    };
    sync();
    const unsubscribeWishlist = subscribeZizzWishlist(sync);
    const unsubscribeQuote = subscribeZizzQuoteCart(sync);
    return () => { unsubscribeWishlist(); unsubscribeQuote(); };
  }, [model.slug]);
  return (
    <main className="min-h-screen bg-[#f8f6f1] text-[#19364f]">
      <header className="border-b border-[#e5e0d7] bg-white"><div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8"><Link to="/" className="text-sm font-bold">ZIZZ <span className="font-normal text-[#89847b]">/ Model details</span></Link><Link to="/cart" className="inline-flex items-center gap-2 rounded-full border border-[#e2ddd3] px-4 py-2 text-sm font-semibold"><ShoppingBag className="h-4 w-4" /> Enquiry list</Link></div></header>
      <div className="mx-auto max-w-7xl px-4 py-7 sm:px-6 lg:px-8"><Link to="/shop" className="inline-flex items-center gap-2 text-sm font-semibold text-[#8b6a3e]"><ArrowLeft className="h-4 w-4" /> All mattress models</Link>
        <div className="mt-6 grid gap-10 lg:grid-cols-2 lg:gap-14">
          <div className="relative flex min-h-[300px] items-center justify-center overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#e2d9ca] via-[#f6f0e5] to-[#b9aa97] p-8 sm:min-h-[470px]">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_20%,rgba(255,255,255,.7),transparent_55%)]" /><div className="relative w-[84%] rotate-[-7deg]"><div className="h-6 rounded-t-xl border border-white/80 bg-[#fffdf7]" /><div className="relative h-24 overflow-hidden rounded-b-xl border-x border-b border-[#a99a87] bg-gradient-to-b from-[#f3ede2] to-[#c8bba9] shadow-[0_20px_24px_-12px_rgba(44,35,26,.4)]"><div className="absolute inset-0 opacity-40" style={{ backgroundImage: "repeating-linear-gradient(0deg, transparent 0 9px, rgba(92,79,64,.18) 9px 10px), repeating-linear-gradient(90deg, transparent 0 24px, rgba(255,255,255,.5) 24px 25px)" }} /></div></div><span className="absolute bottom-5 rounded-full border border-white/60 bg-white/70 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[.16em] text-[#5b5148]">Illustrative visual only</span>
          </div>
          <div className="py-2 sm:py-6"><p className="text-xs font-bold uppercase tracking-[.2em] text-[#a87838]">Zizz mattress collection</p><h1 className="mt-3 text-4xl font-semibold tracking-[-.04em] sm:text-5xl">{model.name}</h1><p className="mt-5 text-base leading-7 text-[#6d777a]">We are preparing verified product specifications for this model. The final page will show available sizes, thickness, construction layers, firmness guidance, fabric options and current pricing once confirmed.</p>
            <div className="mt-7 rounded-2xl border border-[#e6dfd4] bg-white p-5"><div className="flex items-start gap-3"><Info className="mt-0.5 h-5 w-5 shrink-0 text-[#a87838]" /><div><h2 className="font-semibold">Product information is being completed</h2><p className="mt-2 text-sm leading-6 text-[#737a78]">We will not show guessed materials, unverified benefits or placeholder prices as product facts.</p></div></div>
              <div className="mt-5 space-y-3 border-t border-[#eee9e1] pt-4 text-sm text-[#555f62]"><div className="flex gap-2"><CheckCircle2 className="h-4 w-4 shrink-0 text-[#9a7a4a]" /> Fabric patterns may vary with current procurement</div><div className="flex gap-2"><CheckCircle2 className="h-4 w-4 shrink-0 text-[#9a7a4a]" /> Size-wise rates and availability not yet published</div></div>
            </div>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row"><Link to="/contact" search={{ type: "product", model: model.name }} className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#19364f] px-6 py-4 text-sm font-bold text-white hover:bg-[#294c67] sm:w-auto"><MessageCircle className="h-4 w-4" /> Enquire now</Link><button type="button" aria-pressed={inQuoteList} onClick={() => { addZizzQuoteItem(model.slug); setInQuoteList(true); }} className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-[#ded7cb] bg-white px-6 py-4 text-sm font-bold text-[#19364f] hover:bg-[#f8f2e8] sm:w-auto"><ShoppingBag className="h-4 w-4" /> {inQuoteList ? "Added to enquiry list" : "Add to enquiry list"}</button><button type="button" aria-pressed={saved} onClick={() => setSaved(toggleZizzWishlist(model.slug).includes(model.slug))} className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-[#ded7cb] bg-white px-6 py-4 text-sm font-bold text-[#19364f] hover:bg-[#f8f2e8] sm:w-auto"><Heart className={"h-4 w-4 " + (saved ? "fill-current text-[#a16f2c]" : "")} /> {saved ? "Saved to wishlist" : "Save to wishlist"}</button></div><p className="mt-3 text-sm text-[#6f777a]" aria-live="polite">{inQuoteList ? <><span className="font-semibold text-[#8f672f]">This model is in your enquiry list.</span> <Link to="/cart" className="font-bold underline underline-offset-4">Review list</Link></> : "Add this model to your enquiry list to request sizes, current pricing and availability from our team."}</p><p className="mt-3 text-xs leading-5 text-[#7e817c]">Online purchase is still disabled while approved size-wise pricing, specifications, payment, shipping and policies are incomplete. Our team can respond to an enquiry now.</p>
          </div>
        </div>
        <section className="mt-12 grid gap-4 border-t border-[#e5dfd7] py-9 sm:grid-cols-3">{[["Construction", "Layer-by-layer details will be added from the approved specification."], ["Dimensions", "Select from enabled standard sizes or custom dimensions where available."], ["Fabric selection", "Choose a current light, dark or neutral option when available; exact pattern may vary."]].map(([title, text]) => <article key={title} className="rounded-2xl border border-[#e6dfd4] bg-white p-5"><h2 className="font-semibold">{title}</h2><p className="mt-2 text-sm leading-6 text-[#737a78]">{text}</p></article>)}</section>
      </div>
    </main>
  );
}
