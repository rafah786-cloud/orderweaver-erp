import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useId, useRef, useState } from "react";
import {
  ArrowRight,
  BedDouble,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Factory,
  Heart,
  Mail,
  MapPin,
  Menu,
  Search,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Truck,
  X,
} from "lucide-react";
import zizz from "@/assets/brands/zizz.png.asset.json";
import softnights from "@/assets/brands/softnights.jpeg.asset.json";
import mrcoir from "@/assets/brands/mrcoir.jpeg.asset.json";
import byz from "@/assets/brands/byzbedding.jpeg.asset.json";
import ortho from "@/assets/brands/orthomedic.jpeg.asset.json";
import drspine from "@/assets/brands/drspine.jpeg.asset.json";
import zizzBedroom from "@/assets/zizz-flagship-bedroom.jpg.asset.json";
import { useAuth } from "@/hooks/useAuth";

const SITE_URL = "https://www.zizzmattress.com";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Zizz Mattress | Better Sleep. Made for You." },
      {
        name: "description",
        content:
          "Shop and explore Zizz mattresses and sleep solutions from House of Abood Tradings. Spring, foam, latex and coir constructions for different comfort needs.",
      },
      { name: "robots", content: "index, follow" },
      { property: "og:title", content: "Zizz Mattress | Better Sleep. Made for You." },
      {
        property: "og:description",
        content: "Explore Zizz sleep solutions, find your comfort and enquire online.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: SITE_URL },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: SITE_URL }],
  }),
  component: ZizzHome,
});

const brands = [
  { name: "OrthoMedic", tag: "Orthopaedic comfort", src: ortho.url },
  { name: "Dr. Spine", tag: "Spine-focused support", src: drspine.url },
  { name: "Mr. Coir", tag: "Natural coir comfort", src: mrcoir.url },
  { name: "Soft Nights", tag: "Everyday comfort", src: softnights.url },
  { name: "BYZ Bedding", tag: "Modern bedding", src: byz.url },
];

const categories = [
  { title: "Orthopaedic", subtitle: "Support-led comfort", icon: ShieldCheck },
  { title: "Spring", subtitle: "Responsive & breathable", icon: BedDouble },
  { title: "Foam", subtitle: "Adaptive everyday comfort", icon: Sparkles },
  { title: "Latex", subtitle: "Natural-feel comfort", icon: Heart },
  { title: "Coir", subtitle: "Firm, natural support", icon: Factory },
];

const loginItems = [
  { label: "Customer Login", mode: "customer" as const },
  { label: "Staff Login", mode: "staff" as const },
  { label: "Supplier Login", mode: "supplier" as const },
  { label: "Admin / Management", mode: "admin" as const },
];

function LoginMenu({ mobile = false }: { mobile?: boolean }) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <div
      ref={menuRef}
      className="relative"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
        className={
          mobile
            ? "flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white"
            : "flex items-center gap-2 rounded-full border border-[#d9dfe3] bg-white px-4 py-2.5 text-sm font-semibold text-[#19324b] shadow-sm transition hover:border-[#b9c6cf]"
        }
      >
        Login <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          className={
            mobile
              ? "mt-2 overflow-hidden rounded-xl border border-white/10 bg-[#12283b]"
              : "absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-2xl border border-[#e0e5e8] bg-white p-1.5 shadow-[0_22px_60px_-24px_rgba(15,35,52,.45)]"
          }
        >
          {loginItems.map((item) => (
            <Link
              key={item.mode}
              to="/login"
              search={{ mode: item.mode }}
              role="menuitem"
              onClick={() => setOpen(false)}
              className={
                mobile
                  ? "block border-b border-white/5 px-4 py-3 text-sm text-white/85 last:border-0 hover:bg-white/10"
                  : "block rounded-xl px-3 py-2.5 text-sm font-medium text-[#263b50] hover:bg-[#f3f6f8]"
              }
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function ZizzHome() {
  const { session } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#f7f5f0] text-[#182b3c]">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-[#17324d] focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to content
      </a>

      <div className="bg-[#17324d] px-4 py-2 text-center text-[11px] font-semibold tracking-[0.08em] text-white sm:text-xs">
        ZIZZ · PREMIUM SLEEP & COMFORT SOLUTIONS · RETAIL · WHOLESALE · PROJECTS
      </div>

      <header className="sticky top-0 z-50 border-b border-[#e1e3e2] bg-[#f7f5f0]/95 backdrop-blur-xl">
        <div className="mx-auto flex h-[72px] max-w-[1440px] items-center gap-4 px-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex shrink-0 items-center gap-3" aria-label="Zizz home">
            <div className="flex h-11 w-[76px] items-center justify-center rounded-xl bg-white px-2 shadow-sm ring-1 ring-[#e2e3df]">
              <img src={zizz.url} alt="Zizz" className="max-h-8 w-full object-contain" />
            </div>
            <div className="hidden xl:block">
              <div className="text-[9px] font-bold uppercase tracking-[0.24em] text-[#8b8d87]">House of</div>
              <div className="text-sm font-bold text-[#19324b]">Abood Tradings</div>
            </div>
          </Link>

          <nav className="ml-3 hidden items-center gap-6 lg:flex" aria-label="Main navigation">
            <a href="#shop" className="text-sm font-semibold text-[#32495d] hover:text-[#b07d2b]">Shop</a>
            <a href="#collections" className="text-sm font-semibold text-[#32495d] hover:text-[#b07d2b]">Collections</a>
            <a href="#find-your-mattress" className="text-sm font-semibold text-[#32495d] hover:text-[#b07d2b]">Find Your Mattress</a>
            <a href="#custom" className="text-sm font-semibold text-[#32495d] hover:text-[#b07d2b]">Custom Mattress</a>
            <a href="#brands" className="text-sm font-semibold text-[#32495d] hover:text-[#b07d2b]">Our Brands</a>
          </nav>

          <div className="ml-auto hidden items-center gap-2 sm:flex">
            <button
              type="button"
              aria-label="Search"
              className="rounded-full p-2.5 text-[#344b5d] hover:bg-white"
              onClick={() => document.getElementById("shop-search")?.focus()}
            >
              <Search className="h-5 w-5" />
            </button>
            <a href="#support" aria-label="Help" className="rounded-full p-2.5 text-[#344b5d] hover:bg-white">
              <CircleHelp className="h-5 w-5" />
            </a>
            <a href="#wishlist" aria-label="Wishlist" className="rounded-full p-2.5 text-[#344b5d] hover:bg-white">
              <Heart className="h-5 w-5" />
            </a>
            <a href="#cart" aria-label="Cart" className="relative rounded-full p-2.5 text-[#344b5d] hover:bg-white">
              <ShoppingBag className="h-5 w-5" />
              <span className="absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#c78c31] px-1 text-[9px] font-bold text-white">0</span>
            </a>
            {session && (
              <Link to="/dashboard" className="rounded-full px-3 py-2 text-sm font-semibold text-[#17324d] hover:bg-white">
                ERP
              </Link>
            )}
            <LoginMenu />
          </div>

          <button
            type="button"
            className="ml-auto rounded-xl border border-[#d9dfdf] bg-white p-2.5 lg:hidden"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            onClick={() => setMobileOpen((value) => !value)}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {mobileOpen && (
          <div className="border-t border-[#e1e3e2] bg-[#17324d] px-4 py-4 lg:hidden">
            <nav className="space-y-1">
              {[
                ["shop", "Shop Mattresses"],
                ["collections", "Collections"],
                ["find-your-mattress", "Find Your Mattress"],
                ["custom", "Custom Mattress"],
                ["brands", "Our Brands"],
                ["support", "Help & Support"],
              ].map(([id, label]) => (
                <a
                  key={id}
                  href={`#${id}`}
                  onClick={() => setMobileOpen(false)}
                  className="block rounded-xl px-4 py-3 text-sm font-semibold text-white/85 hover:bg-white/10"
                >
                  {label}
                </a>
              ))}
              <div className="pt-2"><LoginMenu mobile /></div>
            </nav>
          </div>
        )}
      </header>

      <main id="main-content">
        <section className="relative overflow-hidden bg-[#e7e2d8]">
          <div className="mx-auto grid min-h-[620px] max-w-[1440px] lg:grid-cols-[0.88fr_1.12fr]">
            <div className="relative z-10 flex items-center px-6 py-16 sm:px-10 lg:px-14 xl:px-20">
              <div className="max-w-xl">
                <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#c9c1b3] bg-white/55 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-[#786d5d]">
                  <Sparkles className="h-3.5 w-3.5" /> The Zizz sleep collection
                </p>
                <h1 className="text-5xl font-semibold leading-[0.98] tracking-[-0.055em] text-[#17324d] sm:text-6xl xl:text-7xl">
                  Sleep better.
                  <span className="block font-normal text-[#6b6257]">Wake brighter.</span>
                </h1>
                <p className="mt-6 max-w-lg text-base leading-7 text-[#5e665f] sm:text-lg">
                  Discover mattresses designed around the way you sleep — from spring and foam to latex and coir comfort.
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <a href="#shop" className="inline-flex items-center gap-2 rounded-full bg-[#17324d] px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-[#17324d]/15 transition hover:-translate-y-0.5 hover:bg-[#10283d]">
                    Shop mattresses <ArrowRight className="h-4 w-4" />
                  </a>
                  <a href="#find-your-mattress" className="inline-flex items-center gap-2 rounded-full border border-[#bcb6ab] bg-white/70 px-6 py-3.5 text-sm font-bold text-[#263e52] transition hover:bg-white">
                    Find my mattress
                  </a>
                </div>
                <div className="mt-9 grid max-w-lg grid-cols-2 gap-x-6 gap-y-3 border-t border-[#c9c1b3] pt-6 text-xs font-semibold text-[#62665f] sm:grid-cols-4">
                  {["Spring", "Foam", "Latex", "Coir"].map((item) => (
                    <span key={item} className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-[#b17b2c]" />{item}</span>
                  ))}
                </div>
              </div>
            </div>
            <div className="relative min-h-[390px] lg:min-h-0">
              <img
                src={zizzBedroom.url}
                alt="Zizz mattress in a premium bedroom"
                className="absolute inset-0 h-full w-full object-cover"
                fetchPriority="high"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-[#e7e2d8] via-transparent to-transparent lg:from-[#e7e2d8] lg:via-transparent" />
              <div className="absolute bottom-6 right-6 rounded-2xl border border-white/30 bg-[#17324d]/85 px-5 py-4 text-white backdrop-blur">
                <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/60">Made for comfort</div>
                <div className="mt-1 text-sm font-semibold">A mattress for every kind of sleeper.</div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-b border-[#e4e2dc] bg-white">
          <div className="mx-auto grid max-w-[1440px] grid-cols-2 divide-x divide-y divide-[#e6e5e1] sm:grid-cols-4 sm:divide-y-0">
            {[
              [Factory, "Manufactured with care", "Spring, foam, latex & coir"],
              [Truck, "Retail & delivery ready", "Built for home & business"],
              [MapPin, "Find the right fit", "Sizes for different beds"],
              [ShieldCheck, "Support beyond purchase", "Warranty & service workflows"],
            ].map(([Icon, title, text]) => (
              <div key={String(title)} className="flex gap-3 px-5 py-5 sm:px-7">
                <Icon className="mt-0.5 h-5 w-5 shrink-0 text-[#b17b2c]" />
                <div><div className="text-sm font-bold text-[#243b4e]">{String(title)}</div><div className="mt-1 text-xs text-[#7a817e]">{String(text)}</div></div>
              </div>
            ))}
          </div>
        </section>

        <section id="shop" className="bg-[#f7f5f0] py-14 sm:py-16">
          <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#a77a3b]">Shop by comfort</p>
                <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[#17324d] sm:text-4xl">Find the feel that fits you.</h2>
              </div>
              <div className="flex items-center gap-3">
                <label className="sr-only" htmlFor="shop-search">Search mattresses</label>
                <div className="hidden items-center gap-2 rounded-full border border-[#d9d7d1] bg-white px-4 py-2.5 sm:flex">
                  <Search className="h-4 w-4 text-[#8b918d]" />
                  <input id="shop-search" className="w-48 bg-transparent text-sm outline-none placeholder:text-[#9aa09c]" placeholder="Search mattresses..." />
                </div>
                <a href="#collections" className="inline-flex items-center gap-1 text-sm font-bold text-[#17324d]">View collection <ChevronRight className="h-4 w-4" /></a>
              </div>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {categories.map(({ title, subtitle, icon: Icon }, index) => (
                <a key={title} href="#collections" className={`group relative overflow-hidden rounded-2xl border p-5 transition hover:-translate-y-1 hover:shadow-xl ${index === 0 ? "border-[#cba66e] bg-[#efe3d0]" : "border-[#e1e1dc] bg-white"}`}>
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-[#17324d] shadow-sm ring-1 ring-black/5"><Icon className="h-6 w-6" /></div>
                  <h3 className="mt-8 text-lg font-bold text-[#20384d]">{title}</h3>
                  <p className="mt-1 text-xs text-[#737a76]">{subtitle}</p>
                  <div className="mt-6 flex items-center gap-1 text-xs font-bold text-[#a16f2c]">Explore <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-1" /></div>
                </a>
              ))}
            </div>
          </div>
        </section>

        <section id="collections" className="border-y border-[#e3e1db] bg-white py-14 sm:py-16">
          <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#a77a3b]">The collection</p>
                <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[#17324d] sm:text-4xl">Built around real sleep needs.</h2>
              </div>
              <p className="max-w-md text-sm leading-6 text-[#747b77]">As the online store is populated, this section becomes the live product catalogue with size selection, price, stock, offers and cart actions.</p>
            </div>

            <div className="mt-9 grid gap-4 md:grid-cols-3">
              {[
                { title: "Everyday Comfort", text: "Practical mattress choices for dependable everyday sleep.", tone: "bg-[#e9e1d3]" },
                { title: "Orthopaedic Support", text: "Support-led constructions for sleepers who prioritise stability.", tone: "bg-[#dce4e4]" },
                { title: "Premium Sleep", text: "Higher-spec constructions for a more elevated sleep experience.", tone: "bg-[#ded9d0]" },
              ].map((item) => (
                <article key={item.title} className="group overflow-hidden rounded-3xl border border-[#dfdfda] bg-[#fafaf8]">
                  <div className={`relative h-56 ${item.tone}`}>
                    <img src={zizzBedroom.url} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover mix-blend-multiply opacity-65 transition duration-500 group-hover:scale-105" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
                    <span className="absolute left-5 top-5 rounded-full bg-white/90 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.15em] text-[#17324d]">Collection</span>
                  </div>
                  <div className="p-6">
                    <h3 className="text-xl font-bold text-[#20384d]">{item.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-[#737a76]">{item.text}</p>
                    <a href="#find-your-mattress" className="mt-5 inline-flex items-center gap-1.5 text-sm font-bold text-[#a16f2c]">Explore <ArrowRight className="h-4 w-4" /></a>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="find-your-mattress" className="bg-[#17324d] py-14 text-white sm:py-16">
          <div className="mx-auto grid max-w-[1440px] gap-10 px-4 sm:px-6 lg:grid-cols-[1.05fr_.95fr] lg:px-8">
            <div className="flex flex-col justify-center">
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#d7b06e]">Zizz Sleep Finder</p>
              <h2 className="mt-3 text-4xl font-semibold tracking-[-0.045em] sm:text-5xl">Not sure which mattress is right?</h2>
              <p className="mt-5 max-w-xl text-base leading-7 text-white/70">Answer a few simple questions about firmness, sleeping style, preferred construction and budget. The storefront can then present the best matching published products.</p>
              <div className="mt-7 grid max-w-xl gap-3 sm:grid-cols-2">
                {["Sleeping position", "Preferred firmness", "Mattress type", "Budget & size"].map((item) => (
                  <div key={item} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm font-semibold text-white/85"><Check className="h-4 w-4 text-[#d7b06e]" />{item}</div>
                ))}
              </div>
              <button type="button" className="mt-8 inline-flex w-fit items-center gap-2 rounded-full bg-white px-6 py-3.5 text-sm font-bold text-[#17324d]">Start finding my mattress <ArrowRight className="h-4 w-4" /></button>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-5 sm:p-7">
              <div className="rounded-2xl bg-[#f5f1e9] p-6 text-[#17324d] sm:p-8">
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#a77a3b]">Example journey</div>
                <h3 className="mt-3 text-2xl font-bold">Your comfort profile</h3>
                <div className="mt-6 space-y-3">
                  {[
                    ["Sleep position", "Side / Back"],
                    ["Firmness", "Medium-firm"],
                    ["Construction", "Open to options"],
                    ["Budget", "Choose your range"],
                  ].map(([a, b]) => (
                    <div key={a} className="flex items-center justify-between rounded-xl border border-[#dedbd4] bg-white px-4 py-3">
                      <span className="text-xs font-semibold text-[#7a7d78]">{a}</span><span className="text-sm font-bold">{b}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-5 rounded-xl bg-[#17324d] px-4 py-3 text-xs font-semibold text-white/85">Recommendations will be based on published catalogue data — never invented.</div>
              </div>
            </div>
          </div>
        </section>

        <section id="custom" className="bg-[#eee9df] py-14 sm:py-16">
          <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8">
            <div className="grid overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-[#ddd9d0] lg:grid-cols-[1.1fr_.9fr]">
              <div className="p-7 sm:p-10 lg:p-14">
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#a77a3b]">Build your mattress</p>
                <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[#17324d] sm:text-4xl">Your bed. Your dimensions. Your comfort.</h2>
                <p className="mt-4 max-w-xl text-sm leading-7 text-[#6f7773]">Create a guided custom-mattress journey for non-standard beds, selected firmness and approved construction options.</p>
                <div className="mt-7 grid gap-3 sm:grid-cols-3">
                  {["Size", "Comfort", "Finish"].map((step, i) => (
                    <div key={step} className="rounded-2xl border border-[#e2e1dc] bg-[#fafaf8] p-4">
                      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#a77a3b]">0{i + 1}</div>
                      <div className="mt-2 text-sm font-bold text-[#243b4e]">{step}</div>
                    </div>
                  ))}
                </div>
                <a href="#support" className="mt-7 inline-flex items-center gap-2 rounded-full bg-[#17324d] px-6 py-3.5 text-sm font-bold text-white">Start a custom enquiry <ArrowRight className="h-4 w-4" /></a>
              </div>
              <div className="relative min-h-[300px]">
                <img src={zizzBedroom.url} alt="Zizz bedroom" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-[#17324d]/35" />
              </div>
            </div>
          </div>
        </section>

        <section id="brands" className="bg-white py-14 sm:py-16">
          <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#a77a3b]">Our house of brands</p>
                <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[#17324d] sm:text-4xl">One manufacturing house. Distinct comfort propositions.</h2>
              </div>
              <p className="max-w-md text-sm leading-6 text-[#747b77]">Zizz is the flagship. Our wider portfolio serves different comfort, health and value positions.</p>
            </div>
            <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <article className="rounded-2xl border border-[#cfa96d] bg-[#f3eadc] p-5 sm:col-span-2 lg:col-span-1">
                <div className="flex h-32 items-center justify-center rounded-xl bg-white p-5"><img src={zizz.url} alt="Zizz" className="max-h-20 w-full object-contain" /></div>
                <div className="mt-4 text-xs font-bold uppercase tracking-[0.16em] text-[#a16f2c]">Flagship</div>
                <h3 className="mt-1 text-lg font-bold text-[#20384d]">Zizz</h3>
                <p className="mt-1 text-xs leading-5 text-[#747a76]">Premium sleep solutions.</p>
              </article>
              {brands.map((brand) => (
                <article key={brand.name} className="rounded-2xl border border-[#e0e1dd] bg-[#fafaf8] p-4 transition hover:-translate-y-1 hover:shadow-lg">
                  <div className="flex h-32 items-center justify-center rounded-xl bg-white p-4"><img src={brand.src} alt={brand.name} loading="lazy" className="max-h-20 w-full object-contain" /></div>
                  <h3 className="mt-4 text-sm font-bold text-[#243b4e]">{brand.name}</h3>
                  <p className="mt-1 text-xs leading-5 text-[#747a76]">{brand.tag}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="support" className="border-y border-[#e0ded7] bg-[#f7f5f0] py-14 sm:py-16">
          <div className="mx-auto grid max-w-[1440px] gap-8 px-4 sm:px-6 lg:grid-cols-[1fr_1fr_1fr] lg:px-8">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#a77a3b]">Need help?</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[#17324d]">Make the buying decision easier.</h2>
              <p className="mt-4 text-sm leading-6 text-[#707772]">The new storefront is designed around discovery first, then product comparison, size selection and purchase.</p>
            </div>
            {[
              [MapPin, "Visit / enquire", "Talk to our team about fit, size and product requirements."],
              [CircleHelp, "Buying guidance", "Use the sleep finder and comparison journey before you buy."],
              [Mail, "Business enquiries", "Retail, wholesale, hospitality and project requirements."],
            ].map(([Icon, title, text]) => (
              <div key={String(title)} className="rounded-2xl border border-[#deded9] bg-white p-6">
                <Icon className="h-6 w-6 text-[#a16f2c]" />
                <h3 className="mt-5 text-lg font-bold text-[#243b4e]">{String(title)}</h3>
                <p className="mt-2 text-sm leading-6 text-[#747a76]">{String(text)}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-[#17324d] py-12 text-white">
          <div className="mx-auto flex max-w-[1440px] flex-col gap-6 px-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#d7b06e]">For business</p>
              <h2 className="mt-2 text-2xl font-semibold sm:text-3xl">Retailer, wholesaler, hotel or project?</h2>
              <p className="mt-2 text-sm text-white/65">Connect with House of Abood Tradings for supply and manufacturing enquiries.</p>
            </div>
            <a href="mailto:gm@zizzmattress.com" className="inline-flex w-fit items-center gap-2 rounded-full bg-white px-6 py-3.5 text-sm font-bold text-[#17324d]">Talk to us <ArrowRight className="h-4 w-4" /></a>
          </div>
        </section>
      </main>

      <footer className="bg-[#102538] text-white/65">
        <div className="mx-auto grid max-w-[1440px] gap-10 px-4 py-12 sm:px-6 md:grid-cols-4 lg:px-8">
          <div className="md:col-span-1">
            <div className="flex h-11 w-[76px] items-center justify-center rounded-xl bg-white px-2"><img src={zizz.url} alt="Zizz" className="max-h-8 w-full object-contain" /></div>
            <p className="mt-4 text-sm leading-6">Premium sleep and comfort solutions from House of Abood Tradings.</p>
          </div>
          {[
            ["Shop", ["Mattresses", "Collections", "Find Your Mattress", "Custom Mattress"]],
            ["Help", ["Buying Guide", "Contact", "Warranty", "Track Order"]],
            ["Business", ["Wholesale", "Projects", "Hospitality", "Enquiries"]],
          ].map(([title, items]) => (
            <div key={String(title)}>
              <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-white">{String(title)}</h3>
              <div className="mt-4 space-y-2.5">
                {(items as string[]).map((item) => <a key={item} href="#support" className="block text-sm hover:text-white">{item}</a>)}
              </div>
            </div>
          ))}
        </div>
        <div className="border-t border-white/10">
          <div className="mx-auto flex max-w-[1440px] flex-col gap-2 px-4 py-5 text-xs sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
            <span>© {new Date().getFullYear()} House of Abood Tradings. All rights reserved.</span>
            <span>Zizz · Premium Sleep & Comfort Solutions</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
