import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  ArrowRight,
  Building2,
  ChevronDown,
  Factory,
  Mail,
  Menu,
  Phone,
  X,
} from "lucide-react";
import zizz from "@/assets/brands/zizz.png.asset.json";
import softnights from "@/assets/brands/softnights.jpeg.asset.json";
import mrcoir from "@/assets/brands/mrcoir.jpeg.asset.json";
import byz from "@/assets/brands/byzbedding.jpeg.asset.json";
import ortho from "@/assets/brands/orthomedic.jpeg.asset.json";
import drspine from "@/assets/brands/drspine.jpeg.asset.json";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Zizz Mattress | House of Abood Tradings" },
      {
        name: "description",
        content:
          "House of Abood Tradings — premium sleep and comfort solutions, led by flagship brand Zizz.",
      },
      { property: "og:title", content: "Zizz Mattress | House of Abood Tradings" },
      {
        property: "og:description",
        content:
          "Premium sleep and comfort solutions from House of Abood Tradings and the Zizz mattress family.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CorporateHome,
});

const brands = [
  { name: "OrthoMedic", tag: "Orthopedic comfort", src: ortho.url },
  { name: "Dr. Spine", tag: "Spine-focused support", src: drspine.url },
  { name: "Mr. Coir", tag: "Natural coir range", src: mrcoir.url },
  { name: "Soft Nights", tag: "Everyday comfort", src: softnights.url },
  { name: "BYZ Bedding", tag: "Bedding essentials", src: byz.url },
];

const loginItems = [
  { label: "Customer Login", mode: "customer" as const },
  { label: "Staff Login", mode: "staff" as const },
  { label: "Supplier Login", mode: "supplier" as const },
  { label: "Admin / Management", mode: "admin" as const },
];

function LoginMenu({ mobile = false }: { mobile?: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <div className={mobile ? "relative w-full" : "relative"}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onPointerEnter={() => {
          if (!mobile) setOpen(true);
        }}
        className={
          mobile
            ? "flex w-full items-center justify-between rounded-md border border-white/15 bg-white/5 px-4 py-3 text-sm font-semibold text-white"
            : "flex items-center gap-1.5 rounded-md border border-[#cfd8df] bg-white px-4 py-2.5 text-sm font-semibold text-[#19324b] shadow-sm transition hover:border-[#b7c5d2] hover:bg-[#f7f9fb]"
        }
      >
        <span>Login</span>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div
          role="menu"
          onPointerLeave={() => {
            if (!mobile) setOpen(false);
          }}
          className={
            mobile
              ? "mt-2 overflow-hidden rounded-md border border-white/10 bg-[#12263a]"
              : "absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-md border border-[#dbe3e9] bg-white p-1 shadow-[0_18px_40px_-18px_rgba(20,40,60,.45)]"
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
                  ? "block border-b border-white/5 px-4 py-3 text-sm text-white/90 last:border-b-0 hover:bg-white/10"
                  : "block rounded-sm px-3 py-2.5 text-sm font-medium text-[#263b50] hover:bg-[#f3f6f8]"
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

function CorporateHome() {
  const { session } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#f7f7f4] text-[#18293b]">
      <header className="sticky top-0 z-40 border-b border-[#dfe5e8] bg-[#f7f7f4]/95 backdrop-blur">
        <div className="mx-auto flex h-[76px] max-w-7xl items-center justify-between px-5 sm:px-8">
          <a href="#top" className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-16 items-center justify-center rounded-md border border-[#dfe5e8] bg-white px-2">
              <img src={zizz.url} alt="Zizz" className="max-h-8 w-full object-contain" />
            </div>
            <div className="hidden min-[420px]:block">
              <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#7c8792]">
                House of
              </div>
              <div className="text-sm font-bold tracking-tight text-[#20374e]">Abood Tradings</div>
            </div>
          </a>

          <nav className="hidden items-center gap-7 text-sm font-medium text-[#566576] lg:flex">
            <a href="#about" className="transition hover:text-[#17324d]">About</a>
            <a href="#capabilities" className="transition hover:text-[#17324d]">Capabilities</a>
            <a href="#brands" className="transition hover:text-[#17324d]">Our Brands</a>
            <a href="#contact" className="transition hover:text-[#17324d]">Contact</a>
          </nav>

          <div className="hidden items-center gap-3 sm:flex">
            {session && (
              <Link
                to="/dashboard"
                className="rounded-md px-3 py-2 text-sm font-semibold text-[#17324d] hover:bg-[#edf2f5]"
              >
                Open ERP
              </Link>
            )}
            <LoginMenu />
          </div>

          <div className="flex items-center gap-2 lg:hidden">
            <LoginMenu />
            <button
              type="button"
              className="rounded-md border border-[#d5dfe5] bg-white p-2"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label="Open menu"
              aria-expanded={mobileOpen}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {mobileOpen && (
          <div className="border-t border-[#dfe5e8] bg-[#13283d] px-5 py-4 lg:hidden">
            <nav className="space-y-1">
              {["about", "capabilities", "brands", "contact"].map((id) => (
                <a
                  key={id}
                  href={`#${id}`}
                  onClick={() => setMobileOpen(false)}
                  className="block px-2 py-2.5 text-sm capitalize text-white/80 hover:text-white"
                >
                  {id}
                </a>
              ))}
              {session && (
                <Link
                  to="/dashboard"
                  onClick={() => setMobileOpen(false)}
                  className="block px-2 py-2.5 text-sm font-semibold text-[#efd06b]"
                >
                  Open ERP
                </Link>
              )}
            </nav>
          </div>
        )}
      </header>

      <main id="top">
        <section className="border-b border-[#dfe5e8] bg-[#fbfbf8]">
          <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-16 sm:px-8 lg:grid-cols-[1.02fr_.98fr] lg:py-24">
            <div className="max-w-2xl">
              <div className="mb-5 inline-flex items-center gap-2 border-b border-[#d7dde1] pb-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#738091]">
                <Building2 className="h-3.5 w-3.5" />
                House of Abood Tradings
              </div>
              <h1 className="text-4xl font-semibold leading-[1.03] tracking-[-0.04em] text-[#17324d] sm:text-5xl lg:text-6xl">
                Better sleep,
                <span className="block font-normal text-[#5f6b78]">built with purpose.</span>
              </h1>
              <p className="mt-6 max-w-xl text-base leading-7 text-[#667483] sm:text-lg">
                We design and manufacture mattresses and sleep solutions for modern homes,
                hospitality, healthcare and retail — with Zizz as our flagship premium brand.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a
                  href="#brands"
                  className="inline-flex items-center gap-2 rounded-md bg-[#17324d] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#11283e]"
                >
                  Explore our brands <ArrowRight className="h-4 w-4" />
                </a>
                <a
                  href="#contact"
                  className="inline-flex items-center gap-2 rounded-md border border-[#cdd7de] bg-white px-5 py-3 text-sm font-semibold text-[#243a50] transition hover:bg-[#f3f6f8]"
                >
                  Talk to us
                </a>
              </div>
            </div>

            <div className="relative">
              <div className="absolute -inset-4 rounded-[28px] bg-[#ece8db]" />
              <div className="relative overflow-hidden rounded-[22px] border border-[#d7dee3] bg-white p-5 shadow-[0_28px_70px_-34px_rgba(15,34,53,.38)] sm:p-8">
                <div className="mb-4 flex items-center justify-between border-b border-[#edf0f2] pb-4">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#8a96a2]">
                    Flagship Brand
                  </span>
                  <span className="text-xs text-[#85909b]">Premium sleep & comfort</span>
                </div>
                <div className="flex min-h-[230px] items-center justify-center">
                  <img src={zizz.url} alt="Zizz premium mattress brand" className="w-full max-w-md object-contain" />
                </div>
                <div className="border-t border-[#edf0f2] pt-5">
                  <div className="text-2xl font-semibold tracking-[-0.03em] text-[#17324d]">Zizz</div>
                  <p className="mt-1 text-sm leading-6 text-[#70808e]">
                    Premium mattress engineering focused on comfort, support and restorative sleep.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="about" className="border-b border-[#e1e6e9] bg-white">
          <div className="mx-auto grid max-w-7xl gap-10 px-5 py-16 sm:px-8 lg:grid-cols-[.75fr_1.25fr] lg:py-20">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#8793a0]">
                About us
              </div>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-[#17324d]">
                A sleep company built around products people trust.
              </h2>
            </div>
            <div className="grid gap-6 sm:grid-cols-2">
              <div className="border-l-2 border-[#e5c55d] pl-5">
                <div className="text-sm font-semibold text-[#20384f]">Manufacturing capability</div>
                <p className="mt-2 text-sm leading-6 text-[#6c7a88]">
                  Spring, foam, latex and specialty mattress production with an end-to-end manufacturing mindset.
                </p>
              </div>
              <div className="border-l-2 border-[#d7dee4] pl-5">
                <div className="text-sm font-semibold text-[#20384f]">Multi-brand portfolio</div>
                <p className="mt-2 text-sm leading-6 text-[#6c7a88]">
                  Distinct product propositions for premium, orthopedic, natural-fibre and everyday bedding needs.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section id="capabilities" className="border-b border-[#e1e6e9] bg-[#f7f8f7]">
          <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-20">
            <div className="max-w-2xl">
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#8793a0]">
                Capabilities
              </div>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-[#17324d]">
                From material to finished mattress.
              </h2>
            </div>
            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {[
                {
                  title: "Spring systems",
                  copy: "Bonnell and pocketed spring manufacturing for resilient support and consistent performance.",
                },
                {
                  title: "Foam & latex",
                  copy: "Foam, latex and medicated constructions for tailored comfort and support profiles.",
                },
                {
                  title: "Project supply",
                  copy: "Structured manufacturing, packing and supply for wholesale, retail and project requirements.",
                },
              ].map((item, i) => (
                <div key={item.title} className="rounded-lg border border-[#dce3e8] bg-white p-6">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[#eef2f5] text-[#17324d]">
                    {i === 0 ? <Factory className="h-5 w-5" /> : i === 1 ? <Building2 className="h-5 w-5" /> : <ArrowRight className="h-5 w-5" />}
                  </div>
                  <h3 className="mt-5 text-lg font-semibold text-[#20384f]">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[#6d7b88]">{item.copy}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="brands" className="border-b border-[#e1e6e9] bg-white">
          <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-20">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#8793a0]">
                  Our brands
                </div>
                <h2 className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-[#17324d]">
                  One house. Distinct sleep solutions.
                </h2>
              </div>
              <div className="text-sm text-[#768492]">Zizz leads the premium portfolio.</div>
            </div>

            <div className="mt-10 rounded-lg border border-[#d8dfe4] bg-[#f8f8f5] p-5 sm:p-6">
              <div className="flex min-h-[190px] items-center justify-center rounded-md border border-[#e1e5e8] bg-white p-6">
                <img src={zizz.url} alt="Zizz flagship brand" className="max-h-28 w-full object-contain" />
              </div>
              <div className="mt-5 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <div className="text-2xl font-semibold tracking-[-0.03em] text-[#17324d]">Zizz</div>
                  <p className="mt-1 text-sm text-[#71808e]">Flagship premium mattresses and sleep solutions.</p>
                </div>
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8a95a0]">Flagship</span>
              </div>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {brands.map((brand) => (
                <div key={brand.name} className="rounded-lg border border-[#dfe5e9] bg-white p-4">
                  <div className="flex min-h-[145px] items-center justify-center rounded-md bg-[#fafafa] p-3">
                    <img src={brand.src} alt={brand.name} loading="lazy" className="max-h-28 w-full object-contain" />
                  </div>
                  <div className="mt-4 text-sm font-semibold text-[#20384f]">{brand.name}</div>
                  <p className="mt-1 text-xs leading-5 text-[#768492]">{brand.tag}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="contact" className="bg-[#17324d] text-white">
          <div className="mx-auto flex max-w-7xl flex-col gap-8 px-5 py-14 sm:px-8 lg:flex-row lg:items-end lg:justify-between lg:py-18">
            <div className="max-w-xl">
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/55">
                Contact
              </div>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.035em]">
                Let’s build better sleep together.
              </h2>
              <p className="mt-3 text-sm leading-6 text-white/70">
                For retail, wholesale, project and manufacturing enquiries, connect with House of Abood Tradings.
              </p>
            </div>
            <div className="space-y-3 text-sm text-white/85">
              <div className="flex items-center gap-3"><Mail className="h-4 w-4 text-[#ebcd69]" /> info@zizzmattress.com</div>
              <div className="flex items-center gap-3"><Phone className="h-4 w-4 text-[#ebcd69]" /> Contact House of Abood Tradings</div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#263f56] bg-[#12283b] text-white/55">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-6 text-xs sm:px-8 sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} House of Abood Tradings. All rights reserved.</span>
          <span>Premium Sleep & Comfort Solutions</span>
        </div>
      </footer>
    </div>
  );
}
