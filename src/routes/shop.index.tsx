import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BedDouble, Heart, Search, ShoppingBag, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { readZizzWishlist, subscribeZizzWishlist, toggleZizzWishlist } from "@/lib/zizz-wishlist";
import { addZizzQuoteItem, readZizzQuoteCart, subscribeZizzQuoteCart } from "@/lib/zizz-quote-cart";
import { mattressModels } from "@/lib/zizz-store-catalog";

export const Route = createFileRoute("/shop/")({
  validateSearch: (search: Record<string, unknown>): { q?: string } => ({ q: typeof search.q === "string" ? search.q : undefined }),
  head: () => ({
    meta: [
      { title: "Shop Mattresses | Zizz Mattress" },
      { name: "description", content: "Explore the Zizz Mattress collection. Product details and online ordering will open as verified specifications and prices are published." },
    ],
  }),
  component: ShopPage,
});

function MattressArtwork({ index }: { index: number }) {
  const tones = [
    "from-[#d9d2c7] via-[#f3eee5] to-[#b7ada0]",
    "from-[#bfc5c6] via-[#f0eee9] to-[#929a9d]",
    "from-[#d3c2ad] via-[#eee0cd] to-[#a18b72]",
    "from-[#c9c0d4] via-[#ece6f1] to-[#8f829f]",
  ];
  return (
    <div className={`relative flex h-48 items-center justify-center overflow-hidden bg-gradient-to-br ${tones[index % tones.length]}`} aria-label="Illustrative mattress visual">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_20%,rgba(255,255,255,.72),transparent_55%)]" />
      <div className="absolute bottom-5 left-[12%] right-[12%] h-5 rounded-full bg-[#4c4036]/15 blur-xl" />
      <div className="relative w-[78%] rotate-[-7deg]">
        <div className="h-5 rounded-t-xl border border-white/70 bg-white/80 shadow-inner" />
        <div className="relative h-14 overflow-hidden rounded-b-lg border-x border-b border-[#a69c8e]/50 bg-gradient-to-b from-[#f9f5ed] to-[#d7cdbf] shadow-[0_14px_18px_-8px_rgba(48,39,29,.35)]">
          <div className="absolute inset-0 opacity-40" style={{ backgroundImage: "repeating-linear-gradient(0deg, transparent 0 7px, rgba(108,98,84,.18) 7px 8px), repeating-linear-gradient(90deg, transparent 0 19px, rgba(255,255,255,.5) 19px 20px)" }} />
        </div>
        <div className="h-2 rounded-b-md bg-[#b9ad9d]" />
      </div>
      <span className="absolute bottom-3 right-3 rounded-full border border-white/60 bg-white/65 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[.16em] text-[#5b5148]">Illustrative visual</span>
    </div>
  );
}

function ShopPage() {
  const { q = "" } = Route.useSearch();
  const [query, setQuery] = useState(q);
  const [savedSlugs, setSavedSlugs] = useState<string[]>([]);
  const [quoteSlugs, setQuoteSlugs] = useState<string[]>([]);
  const [sort, setSort] = useState("name");
  useEffect(() => setQuery(q), [q]);
  useEffect(() => {
    const sync = () => setSavedSlugs(readZizzWishlist());
    sync();
    return subscribeZizzWishlist(sync);
  }, []);
  useEffect(() => {
    const sync = () => setQuoteSlugs(readZizzQuoteCart().map((item) => item.slug));
    sync();
    return subscribeZizzQuoteCart(sync);
  }, []);
  const models = useMemo(() => {
    const term = query.trim().toLowerCase();
    const filtered = mattressModels.filter((model) => model.name.toLowerCase().includes(term) || model.code.toLowerCase().includes(term));
    return [...filtered].sort((a, b) => sort === "code" ? a.code.localeCompare(b.code) : a.name.localeCompare(b.name));
  }, [query, sort]);

  return (
    <main className="min-h-screen bg-[#f8f6f1] text-[#18334b]">
      <div className="border-b border-[#e5e0d7] bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <Link to="/" className="text-sm font-bold tracking-tight text-[#18334b]">ZIZZ <span className="font-normal text-[#8a8176]">/ Home</span></Link>
          <div className="flex items-center gap-3">
            <Link to="/shop" className="text-sm font-semibold text-[#9b6c2d]">Shop</Link>
            <Link to="/wishlist" className="text-sm font-semibold text-[#6f777a]">Saved</Link>
            <Link to="/cart" className="inline-flex items-center gap-2 rounded-full border border-[#e2ddd3] bg-[#faf8f4] px-4 py-2 text-sm font-semibold hover:bg-white"><ShoppingBag className="h-4 w-4" /> Enquiry list</Link>
          </div>
        </div>
      </div>

      <section className="relative overflow-hidden bg-[#19364f] text-white">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_75%_20%,rgba(202,169,119,.28),transparent_38%)]" />
        <div className="relative mx-auto grid max-w-7xl gap-8 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[1.1fr_.9fr] lg:items-center lg:px-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.24em] text-[#e0bd86]">The Zizz collection</p>
            <h1 className="mt-4 max-w-2xl text-4xl font-semibold leading-[1.08] tracking-[-.045em] sm:text-6xl">Find the mattress that feels like yours.</h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-white/75">Explore our model range and choose by verified construction, comfort, dimensions and price. Every model is being prepared for online shopping.</p>
            <a href="#catalogue" className="mt-8 inline-flex items-center gap-2 rounded-full bg-[#e4c18a] px-6 py-3.5 text-sm font-bold text-[#18334b] transition hover:bg-white">Explore models <ArrowRight className="h-4 w-4" /></a>
          </div>
          <div className="relative mx-auto w-full max-w-lg">
            <div className="absolute -inset-5 rounded-[2rem] bg-white/5 blur-xl" />
            <div className="relative rounded-[1.75rem] border border-white/15 bg-white/10 p-5 backdrop-blur">
              <div className="flex items-center justify-between text-xs text-white/70"><span>Comfort, made considered</span><BedDouble className="h-5 w-5 text-[#e4c18a]" /></div>
              <div className="my-8 rounded-2xl bg-gradient-to-br from-[#eee8dd] via-[#d7ccbd] to-[#a99b8a] p-6">
                <div className="mx-auto mt-3 w-[86%] rotate-[-6deg]">
                  <div className="h-5 rounded-t-xl border border-white/80 bg-[#faf7f0]" />
                  <div className="relative h-20 overflow-hidden rounded-b-xl border-x border-b border-[#9d9080] bg-gradient-to-b from-[#f4eee4] to-[#c6b9a7] shadow-[0_18px_22px_-12px_rgba(0,0,0,.45)]">
                    <div className="absolute inset-0 opacity-40" style={{ backgroundImage: "repeating-linear-gradient(0deg, transparent 0 9px, rgba(92,79,64,.18) 9px 10px), repeating-linear-gradient(90deg, transparent 0 24px, rgba(255,255,255,.5) 24px 25px)" }} />
                  </div>
                </div>
                <p className="mt-8 text-center text-[10px] font-semibold uppercase tracking-[.2em] text-[#5e5246]">Illustrative design — fabric may vary</p>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-[11px] text-white/80"><div className="rounded-xl bg-black/10 p-3">Your size</div><div className="rounded-xl bg-black/10 p-3">Your comfort</div><div className="rounded-xl bg-black/10 p-3">Your budget</div></div>
            </div>
          </div>
        </div>
      </section>

      <section id="catalogue" className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div><p className="text-xs font-bold uppercase tracking-[.2em] text-[#a87838]">Explore our models</p><h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">The mattress collection</h2><p className="mt-3 max-w-xl text-sm leading-6 text-[#6f777a]">Explore models, save favourites, or build an enquiry list. Prices, sizes and availability will be confirmed by our team until verified product data is published.</p></div>
          <div className="text-sm text-[#7b7c78]">{models.length} models listed</div>
        </div>
        <div className="mt-7 grid gap-3 rounded-2xl border border-[#e5dfd5] bg-white p-3 sm:grid-cols-[1fr_190px] sm:p-4">
          <label className="flex min-w-0 items-center gap-3 rounded-xl bg-[#f8f6f1] px-4 py-3"><Search className="h-4 w-4 shrink-0 text-[#8d918c]" /><span className="sr-only">Search models</span><input name="q" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by mattress model…" className="w-full bg-transparent text-sm outline-none placeholder:text-[#9a9b96]" /></label>
          <label className="flex items-center gap-3 rounded-xl bg-[#f8f6f1] px-4 py-3"><SlidersHorizontal className="h-4 w-4 text-[#8d918c]" /><span className="sr-only">Sort models</span><select value={sort} onChange={(event) => setSort(event.target.value)} className="w-full bg-transparent text-sm outline-none"><option value="name">Sort: A–Z</option><option value="code">Sort: Model code</option></select></label>
        </div>
        <div className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {models.map((model, index) => (
            <article key={model.code} className="group overflow-hidden rounded-2xl border border-[#e4dfd5] bg-white transition duration-300 hover:-translate-y-1 hover:border-[#c8b18e] hover:shadow-[0_20px_45px_-28px_rgba(31,46,58,.4)]">
              <Link to="/shop/$slug" params={{ slug: model.slug }} aria-label={`View ${model.name} details`}><MattressArtwork index={index} /></Link>
              <div className="p-5">
                <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#a87838]">{model.code}</p><h3 className="mt-1.5 text-lg font-semibold tracking-tight">{model.name}</h3></div><button type="button" aria-label={savedSlugs.includes(model.slug) ? "Remove " + model.name + " from wishlist" : "Save " + model.name + " to wishlist"} aria-pressed={savedSlugs.includes(model.slug)} onClick={() => setSavedSlugs(toggleZizzWishlist(model.slug))} className="rounded-full border border-[#e4dfd5] p-2 text-[#9b6c2d] transition hover:bg-[#f8f2e8] focus:outline-none focus:ring-2 focus:ring-[#b17b2c]"><Heart className={"h-4 w-4 " + (savedSlugs.includes(model.slug) ? "fill-current" : "")} /></button></div>
                <p className="mt-3 min-h-10 text-xs leading-5 text-[#777d7b]">Specifications and size-wise pricing will be published after confirmation.</p>
                <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3">
                  <Link to="/shop/$slug" params={{ slug: model.slug }} className="inline-flex items-center gap-2 text-sm font-bold text-[#19364f] hover:text-[#9b6c2d]">View model <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></Link>
                  <button type="button" onClick={() => setQuoteSlugs(addZizzQuoteItem(model.slug).map((item) => item.slug))} aria-pressed={quoteSlugs.includes(model.slug)} className="inline-flex items-center gap-1.5 rounded-full border border-[#ded7cb] px-3 py-2 text-xs font-bold text-[#8f672f] transition hover:bg-[#f8f2e8] focus:outline-none focus:ring-2 focus:ring-[#b17b2c]">{quoteSlugs.includes(model.slug) ? "Added to enquiry list" : "Add to enquiry list"}</button>
                </div>
              </div>
            </article>
          ))}
        </div>
        {models.length === 0 && <div className="mt-8 rounded-2xl border border-dashed border-[#d7cfc2] bg-white p-10 text-center"><p className="font-semibold">No matching model found</p><p className="mt-2 text-sm text-[#737a78]">Try a shorter model name.</p></div>}
      </section>
      <section className="border-t border-[#e5dfd7] bg-[#f0ebe2]"><div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-9 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8"><div><h2 className="text-lg font-semibold">Need help choosing a size?</h2><p className="mt-1 text-sm text-[#6d7472]">Measure the inner edges of your bed frame before selecting a mattress.</p></div><Link to="/" className="inline-flex items-center gap-2 text-sm font-bold text-[#19364f]">Visit Zizz home <ArrowRight className="h-4 w-4" /></Link></div></section>
    </main>
  );
}
