import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useId, useState } from "react";
import {
  ArrowRight,
  BedDouble,
  Building2,
  ChevronDown,
  Factory,
  Mail,
  Menu,
  PackageCheck,
  ShieldCheck,
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
      { title: "Zizz Mattress | House of Abood Tradings" },
      {
        name: "description",
        content:
          "House of Abood Tradings manufactures mattresses and sleep solutions across spring, foam and latex categories, with Zizz as its flagship brand.",
      },
      { name: "robots", content: "index, follow" },
      { property: "og:title", content: "Zizz Mattress | House of Abood Tradings" },
      {
        property: "og:description",
        content:
          "Mattress manufacturing, supply and multi-brand sleep solutions from House of Abood Tradings.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: SITE_URL },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: SITE_URL }],
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
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const baseButton =
    "flex items-center gap-1.5 rounded-md text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e6c55c] focus-visible:ring-offset-2";
  const desktopButton =
    "border border-[#cfd8df] bg-white px-4 py-2.5 text-[#19324b] shadow-sm hover:border-[#b7c5d2] hover:bg-[#f7f9fb]";
  const mobileButton =
    "w-full justify-between border border-white/15 bg-white/5 px-4 py-3 text-white hover:bg-white/10";

  return (
    <div
      className={mobile ? "relative w-full" : "relative"}
      onPointerLeave={() => {
        if (!mobile) setOpen(false);
      }}
    >
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
        onFocus={() => undefined}
        className={`${baseButton} ${mobile ? mobileButton : desktopButton}`}
      >
        <span>Login</span>
        <ChevronDown
          aria-hidden
          className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label="Login options"
          className={
            mobile
              ? "mt-2 overflow-hidden rounded-md border border-white/10 bg-[#12263a] shadow-lg"
              : "absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-md border border-[#dbe3e9] bg-white p-1.5 shadow-[0_18px_40px_-18px_rgba(20,40,60,.45)]"
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
                  ? "block border-b border-white/5 px-4 py-3 text-sm text-white/90 last:border-b-0 hover:bg-white/10 focus-visible:outline-none focus-visible:bg-white/10"
                  : "block rounded-sm px-3 py-2.5 text-sm font-medium text-[#263b50] hover:bg-[#f3f6f8] focus-visible:outline-none focus-visible:bg-[#f3f6f8]"
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

  const closeMobile = () => setMobileOpen(false);

  return (
    <div className="min-h-screen bg-[#f7f7f4] text-[#18293b]">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-[#17324d] focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-40 border-b border-[#dfe5e8] bg-[#f7f7f4]/95 backdrop-blur">
        <div className="mx-auto flex min-h-[72px] max-w-7xl items-center justify-between gap-4 px-5 sm:px-8">
          <a
            href="#top"
            className="flex min-w-0 items-center gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e6c55c]"
            aria-label="House of Abood Tradings home"
          >
            <div className="flex h-11 w-16 shrink-0 items-center justify-center rounded-md border border-[#dfe5e8] bg-white px-2">
              <img src={zizz.url} alt="Zizz" className="max-h-8 w-full object-contain" />
            </div>
            <div className="hidden min-[420px]:block">
              <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#7c8792]">
                House of
              </div>
              <div className="text-sm font-bold tracking-tight text-[#20374e]">Abood Tradings</div>
            </div>
          </a>

          <nav
            aria-label="Primary navigation"
            className="hidden items-center gap-7 text-sm font-medium text-[#566576] lg:flex"
          >
            <a href="#about" className="rounded-sm transition hover:text-[#17324d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e6c55c]">
              About
            </a>
            <a href="#capabilities" className="rounded-sm transition hover:text-[#17324d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e6c55c]">
              Capabilities
            </a>
            <a href="#brands" className="rounded-sm transition hover:text-[#17324d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e6c55c]">
              Our Brands
            </a>
            <a href="#contact" className="rounded-sm transition hover:text-[#17324d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e6c55c]">
              Contact
            </a>
          </nav>

          <div className="hidden items-center gap-3 sm:flex">
            {session && (
              <Link
                to="/dashboard"
                className="rounded-md px-3 py-2 text-sm font-semibold text-[#17324d] transition hover:bg-[#edf2f5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e6c55c]"
              >
                Open ERP
              </Link>
            )}
            <LoginMenu />
          </div>

          <div className="flex items-center gap-2 lg:hidden">
            <LoginMenu mobile />
            <button
              type="button"
              className="shrink-0 rounded-md border border-[#d5dfe5] bg-white p-2 text-[#17324d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e6c55c]"
              onClick={() => setMobileOpen((value) => !value)}
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileOpen}
              aria-controls="mobile-navigation"
            >
              {mobileOpen ? <X aria-hidden className="h-5 w-5" /> : <Menu aria-hidden className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {mobileOpen && (
          <div id="mobile-navigation" className="border-t border-[#dfe5e8] bg-[#13283d] px-5 py-4 lg:hidden">
            <nav aria-label="Mobile navigation" className="space-y-1">
              {[
                ["about", "About"],
                ["capabilities", "Capabilities"],
                ["brands", "Our Brands"],
                ["contact", "Contact"],
              ].map(([id, label]) => (
                <a
                  key={id}
                  href={`#${id}`}
                  onClick={closeMobile}
                  className="block rounded-md px-2 py-2.5 text-sm text-white/80 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e6c55c]"
                >
                  {label}
                </a>
              ))}
              {session && (
                <Link
                  to="/dashboard"
                  onClick={closeMobile}
                  className="block rounded-md px-2 py-2.5 text-sm font-semibold text-[#efd06b] hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e6c55c]"
                >
                  Open ERP
                </Link>
              )}
            </nav>
          </div>
        )}
      </header>

      <main id="main-content">
        <section id="top" className="border-b border-[#dfe5e8] bg-[#fbfbf8]">
          <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:py-12">
            <div className="relative overflow-hidden rounded-[22px] border border-[#d7dee3] bg-[#e9e9e2] shadow-[0_28px_70px_-34px_rgba(15,34,53,.35)]">
              <img
                src={zizzBedroom.url}
                alt="Premium bedroom with Zizz mattress"
                className="absolute inset-0 h-full w-full object-cover"
                fetchPriority="high"
              />
              <div
                aria-hidden
                className="absolute inset-0 bg-gradient-to-r from-[#f7f7f4]/97 via-[#f7f7f4]/88 via-[48%] to-transparent"
              />
              <div className="relative z-10 flex min-h-[540px] items-center px-6 py-16 sm:px-10 lg:min-h-[600px] lg:px-14">
                <div className="max-w-2xl">
                  <div className="mb-5 inline-flex items-center gap-2 border-b border-[#d7dde1] pb-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#738091]">
                    <Building2 aria-hidden className="h-3.5 w-3.5" />
                    House of Abood Tradings
                  </div>
                  <h1 className="text-4xl font-semibold leading-[1.02] tracking-[-0.04em] text-[#17324d] sm:text-5xl lg:text-6xl">
                    Sleep solutions,
                    <span className="block font-normal text-[#5f6b78]">made with purpose.</span>
                  </h1>
                  <p className="mt-6 max-w-xl text-base leading-7 text-[#536373] sm:text-lg">
                    Mattress manufacturing, supply and multi-brand sleep solutions for retail,
                    wholesale and project requirements — with Zizz as our flagship premium brand.
                  </p>
                  <div className="mt-8 flex flex-wrap gap-3">
                    <a
                      href="#brands"
                      className="inline-flex items-center gap-2 rounded-md bg-[#17324d] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#11283e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e6c55c] focus-visible:ring-offset-2"
                    >
                      Explore our brands <ArrowRight aria-hidden className="h-4 w-4" />
                    </a>
                    <a
                      href="#contact"
                      className="inline-flex items-center gap-2 rounded-md border border-[#cdd7de] bg-white px-5 py-3 text-sm font-semibold text-[#243a50] transition hover:bg-[#f3f6f8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e6c55c] focus-visible:ring-offset-2"
                    >
                      Talk to us
                    </a>
                  </div>
                  <div className="mt-10 grid max-w-xl grid-cols-3 gap-0 border-t border-[#d6dde1] pt-6">
                    {[
                      ["20,000", "sq ft production area"],
                      ["1,500", "mattresses / month"],
                      ["South India", "manufacturing & supply"],
                    ].map(([value, label], index) => (
                      <div
                        key={label}
                        className={index === 0 ? "pr-4" : "border-l border-[#d6dde1] px-4"}
                      >
                        <div className="text-xl font-semibold tracking-[-0.03em] text-[#17324d]">{value}</div>
                        <div className="mt-1 text-[11px] leading-5 text-[#6e7b88]">{label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="absolute bottom-5 right-6 hidden max-w-xs text-right text-sm font-medium text-white drop-shadow-lg sm:block">
                Zizz · Flagship premium sleep
              </div>
            </div>
          </div>
        </section>

        <section id="about" className="border-b border-[#e1e6e9] bg-white">
          <div className="mx-auto grid max-w-7xl gap-12 px-5 py-16 sm:px-8 lg:grid-cols-[0.78fr_1.22fr] lg:py-20">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#8793a0]">About us</div>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-[#17324d] sm:text-4xl">
                One manufacturing house. Multiple sleep propositions.
              </h2>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              {[
                {
                  icon: Factory,
                  title: "End-to-end manufacturing",
                  text:
                    "Bonnell spring, pocketed spring, medicated and latex mattress production supported by in-house manufacturing capability.",
                },
                {
                  icon: PackageCheck,
                  title: "Built for different markets",
                  text:
                    "Distinct brands and product propositions serving premium, orthopedic, natural-fibre and everyday bedding needs.",
                },
                {
                  icon: Truck,
                  title: "Wholesale & projects",
                  text:
                    "Structured supply for retailers, wholesalers and project requirements with production and packing workflows behind the order.",
                },
                {
                  icon: ShieldCheck,
                  title: "Operational discipline",
                  text:
                    "A growing business platform built around controlled sales, production, inventory, finance and customer workflows.",
                },
              ].map(({ icon: Icon, title, text }) => (
                <div key={title} className="rounded-xl border border-[#dfe5e9] bg-[#fafbf9] p-6">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[#eef2f5] text-[#17324d]">
                    <Icon aria-hidden className="h-5 w-5" />
                  </div>
                  <h3 className="mt-5 text-lg font-semibold text-[#20384f]">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[#6d7b88]">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="capabilities" className="border-b border-[#e1e6e9] bg-[#f7f8f7]">
          <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-20">
            <div className="max-w-2xl">
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#8793a0]">Capabilities</div>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-[#17324d] sm:text-4xl">
                From raw material to finished mattress.
              </h2>
              <p className="mt-4 text-base leading-7 text-[#6d7b88]">
                Manufacturing breadth that supports both established product lines and custom business requirements.
              </p>
            </div>

            <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  icon: BedDouble,
                  title: "Spring systems",
                  text: "Bonnell and pocketed spring mattress constructions.",
                },
                {
                  icon: Factory,
                  title: "Foam & latex",
                  text: "Foam, latex and medicated mattress constructions.",
                },
                {
                  icon: PackageCheck,
                  title: "Production & packing",
                  text: "Manufacturing and packing workflows for finished goods.",
                },
                {
                  icon: Truck,
                  title: "Wholesale & projects",
                  text: "Supply support for retail, wholesale and project business.",
                },
              ].map(({ icon: Icon, title, text }) => (
                <div key={title} className="rounded-xl border border-[#dce3e8] bg-white p-6">
                  <div className="flex h-11 w-11 items-center justify-center rounded-md bg-[#edf2f5] text-[#17324d]">
                    <Icon aria-hidden className="h-5 w-5" />
                  </div>
                  <h3 className="mt-5 text-lg font-semibold text-[#20384f]">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[#6d7b88]">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="brands" className="border-b border-[#e1e6e9] bg-white">
          <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-20">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#8793a0]">Our brands</div>
                <h2 className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-[#17324d] sm:text-4xl">
                  One house. Distinct sleep solutions.
                </h2>
              </div>
              <div className="max-w-sm text-sm leading-6 text-[#768492]">
                Zizz leads the portfolio, with specialised brands covering different comfort and product needs.
              </div>
            </div>

            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
              <article className="group relative overflow-hidden rounded-xl border border-[#cfd9e1] bg-[#f8f8f5] p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg sm:col-span-2 lg:col-span-2">
                <span className="absolute right-4 top-4 rounded-full bg-[#17324d] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-white">
                  Flagship
                </span>
                <div className="flex min-h-[190px] items-center justify-center rounded-lg border border-[#e1e5e8] bg-white p-8">
                  <img src={zizz.url} alt="Zizz flagship brand" className="max-h-36 w-full object-contain" />
                </div>
                <h3 className="mt-5 text-2xl font-semibold text-[#17324d]">Zizz</h3>
                <p className="mt-1 text-sm leading-6 text-[#70808e]">
                  Flagship premium mattresses and sleep solutions.
                </p>
              </article>

              {brands.map((brand) => (
                <article
                  key={brand.name}
                  className="group rounded-xl border border-[#dfe5e9] bg-white p-4 transition hover:-translate-y-0.5 hover:shadow-lg lg:col-span-1"
                >
                  <div className="flex min-h-[190px] items-center justify-center rounded-lg bg-[#fafafa] p-4">
                    <img
                      src={brand.src}
                      alt={brand.name}
                      loading="lazy"
                      className="max-h-32 w-full object-contain"
                    />
                  </div>
                  <h3 className="mt-4 text-sm font-semibold text-[#20384f]">{brand.name}</h3>
                  <p className="mt-1 text-xs leading-5 text-[#768492]">{brand.tag}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="border-b border-[#dfe5e8] bg-[#f7f7f4]">
          <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8 lg:py-16">
            <div className="rounded-2xl border border-[#d7dee3] bg-[#17324d] px-6 py-8 text-white sm:px-10 lg:flex lg:items-center lg:justify-between lg:gap-12">
              <div className="max-w-2xl">
                <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/55">For business</div>
                <h2 className="mt-3 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
                  Need a manufacturing, wholesale or project partner?
                </h2>
                <p className="mt-3 text-sm leading-6 text-white/70">
                  Talk to House of Abood Tradings about products, supply requirements and business enquiries.
                </p>
              </div>
              <a
                href="#contact"
                className="mt-6 inline-flex shrink-0 items-center gap-2 rounded-md bg-white px-5 py-3 text-sm font-semibold text-[#17324d] transition hover:bg-[#eef3f6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e6c55c] focus-visible:ring-offset-2 focus-visible:ring-offset-[#17324d] lg:mt-0"
              >
                Start a conversation <ArrowRight aria-hidden className="h-4 w-4" />
              </a>
            </div>
          </div>
        </section>

        <section id="contact" className="bg-[#17324d] text-white">
          <div className="mx-auto grid max-w-7xl gap-10 px-5 py-16 sm:px-8 lg:grid-cols-[1.15fr_.85fr] lg:py-20">
            <div className="max-w-2xl">
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/55">Contact</div>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
                Let’s build better sleep together.
              </h2>
              <p className="mt-4 text-sm leading-6 text-white/70">
                For retail, wholesale, project and manufacturing enquiries, connect with House of Abood Tradings.
              </p>
              <div className="mt-8 rounded-xl border border-white/10 bg-white/[0.04] p-5">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45">Business email</div>
                <a
                  href="mailto:gm@zizzmattress.com"
                  className="mt-2 inline-flex items-center gap-2 text-base font-semibold text-white underline decoration-white/25 underline-offset-4 hover:decoration-white"
                >
                  <Mail aria-hidden className="h-4 w-4 text-[#ebcd69]" />
                  gm@zizzmattress.com
                </a>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-6">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45">Portal access</div>
              <p className="mt-3 text-sm leading-6 text-white/65">
                Existing customers, staff, suppliers and management can use the Login menu in the top-right corner.
              </p>
              <div className="mt-6">
                <LoginMenu mobile />
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10 bg-[#12283b] text-white/55">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-6 text-xs sm:px-8 md:flex-row md:items-center md:justify-between">
          <span>© {new Date().getFullYear()} House of Abood Tradings. All rights reserved.</span>
          <span>Premium Sleep &amp; Comfort Solutions</span>
        </div>
      </footer>
    </div>
  );
}
