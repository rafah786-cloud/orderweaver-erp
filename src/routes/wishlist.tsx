import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Heart, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { mattressModels } from "@/lib/zizz-store-catalog";
import { readZizzWishlist, subscribeZizzWishlist, toggleZizzWishlist } from "@/lib/zizz-wishlist";

export const Route = createFileRoute("/wishlist")({
  head: () => ({ meta: [{ title: "Saved Mattresses | Zizz Mattress" }, { name: "robots", content: "noindex, follow" }] }),
  component: WishlistPage,
});

function WishlistPage() {
  const [savedSlugs, setSavedSlugs] = useState<string[]>([]);
  useEffect(() => {
    const sync = () => setSavedSlugs(readZizzWishlist());
    sync();
    return subscribeZizzWishlist(sync);
  }, []);
  const savedModels = mattressModels.filter((model) => savedSlugs.includes(model.slug));

  return (
    <main className="min-h-screen bg-[#f8f6f1] text-[#19364f]">
      <header className="border-b border-[#e5e0d7] bg-white"><div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-4 sm:px-6"><Link to="/" className="text-sm font-bold">ZIZZ <span className="font-normal text-[#89847b]">/ Wishlist</span></Link><Link to="/shop" className="text-sm font-semibold">Shop mattresses</Link></div></header>
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
        <Link to="/shop" className="inline-flex items-center gap-2 text-sm font-semibold text-[#8b6a3e]"><ArrowLeft className="h-4 w-4" /> Browse mattresses</Link>
        <h1 className="mt-5 text-4xl font-semibold tracking-tight">Saved mattresses</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[#707976]">Your saved models stay in this browser on this device. The models are currently catalogue drafts; save them to compare or enquire, not to imply they are in stock or ready to order.</p>
        {savedModels.length === 0 ? (
          <section className="mt-8 rounded-3xl border border-[#e3ded4] bg-white p-8 text-center sm:p-12"><Heart className="mx-auto h-8 w-8 text-[#a16f2c]" /><h2 className="mt-4 text-xl font-bold">Nothing saved yet</h2><p className="mt-2 text-sm text-[#707976]">Open a mattress model and tap “Save to wishlist”.</p><Link to="/shop" className="mt-6 inline-flex rounded-full bg-[#19364f] px-6 py-3 text-sm font-bold text-white">Explore models</Link></section>
        ) : (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{savedModels.map((model) => <article key={model.slug} className="rounded-2xl border border-[#e3ded4] bg-white p-5"><h2 className="text-lg font-bold">{model.name}</h2><p className="mt-2 text-sm text-[#707976]">Specifications and size-wise prices await confirmation.</p><div className="mt-5 flex flex-wrap items-center gap-3"><Link to="/shop/$slug" params={{ slug: model.slug }} className="text-sm font-bold text-[#19364f] underline underline-offset-4">View model</Link><button type="button" onClick={() => setSavedSlugs(toggleZizzWishlist(model.slug))} className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#9b6c2d]"><Trash2 className="h-4 w-4" /> Remove</button></div></article>)}</div>
        )}
      </div>
    </main>
  );
}
