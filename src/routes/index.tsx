import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Building2, ChevronDown, Factory, Mail, Menu, X } from "lucide-react";
import zizz from "@/assets/brands/zizz.png.asset.json";
import softnights from "@/assets/brands/softnights.jpeg.asset.json";
import mrcoir from "@/assets/brands/mrcoir.jpeg.asset.json";
import byz from "@/assets/brands/byzbedding.jpeg.asset.json";
import ortho from "@/assets/brands/orthomedic.jpeg.asset.json";
import drspine from "@/assets/brands/drspine.jpeg.asset.json";
import zizzBedroom from "@/assets/zizz-flagship-bedroom.jpg.asset.json";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Zizz Mattress | House of Abood Tradings" },
      {
        name: "description",
        content:
          "House of Abood Tradings manufactures mattresses and sleep solutions, with Zizz as its flagship brand.",
      },
      { name: "robots", content: "index,follow" },
      { property: "og:title", content: "Zizz Mattress | House of Abood Tradings" },
      {
        property: "og:description",
        content:
          "Manufacturing mattresses and sleep solutions across spring, foam, latex and specialty constructions.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://www.zizzmattress.com/" },
      {
        property: "og:image",
        content:
          "https://storage.googleapis.com/gpt-engineer-file-uploads/Lw0gR7977khvbGCmnXKoutSkshF3/social-images/social-1780066816611-D6A5E0FA-94F0-45E9-970A-B975B866769E.webp",
      },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://www.zizzmattress.com/" }],
  }),
  component: CorporateHome,
});

const brands = [
  { name: "OrthoMedic", tag: "Orthopedic support", src: ortho.url },
  { name: "Dr. Spine", tag: "Spine-focused comfort", src: drspine.url },
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

function LoginMenu() {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, []);

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        onPointerEnter={() => setOpen(true)}
        onFocus={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-[#cfd8df] bg-white px-4 py-2.5 text-sm font-semibold text-[#19324b] shadow-sm transition hover:border-[#b7c5d2] hover:bg-[#f7f9fb]"
      >
        Login
        <ChevronDown className={"h-4 w-4 transition-transform " + (open ? "rotate-180" : "")} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-md border border-[#dbe3e9] bg-white p-1 shadow-[0_18px_40px_-18px_rgba(20,40,60,.45)]"
        >
          {loginItems.map((item) => (
            <Link
              key={item.mode}
              to="/login"
              search={{ mode: item.mode }}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block rounded-sm px-3 py-3 text-sm font-medium text-[#263b50] hover:bg-[#f3f6f8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e0b83f]"
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
    <div className="min-h-screen bg-[#f5f7fa] text-[#172033]">
      <header className="sticky top-0 z-40 border-b border-[#dce3ea] bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-[76px] max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex min-w-0 items-center gap-3" aria-label="House of Abood Tradings home">
            <div className="flex h-11 w-16 items-center justify-center rounded-md border border-[#dce3ea] bg-white px-2">
              <img src={zizz.url} alt="Zizz" className="max-h-8 w-full object-contain" />
            </div>
            <div className="hidden min-[420px]:block leading-tight">
              <div className="text-[9px] font-semibold uppercase tracking-[0.2em] text-[#8793a0]">House of</div>
              <div className="text-sm font-bold tracking-tight text-[#20374e]">Abood Tradings</div>
            </div>
          </Link>

          <nav className="hidden items-center gap-7 text-sm font-medium text-[#566576] lg:flex" aria-label="Primary">
            <a href="#about" className="transition hover:text-[#17324d]">About</a>
            <a href="#capabilities" className="transition hover:text-[#17324d]">Capabilities</a>
            <a href="#brands" className="transition hover:text-[#17324d]">Our Brands</a>
            <a href="#contact" className="transition hover:text-[#17324d]">Contact</a>
          </nav>

          <div className="hidden items-center gap-3 lg:flex">
            {session && (
              <Link
                to="/dashboard"
                className="rounded-md px-3 py-2 text-sm font-semibold text-[#17324d] hover:bg-[#f0f4f7]"
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
              className="rounded-md border border-[#d5dfe5] bg-white p-2.5 text-[#17324d]"
              onClick={() => setMobileOpen((value) => !value)}
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileOpen}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {mobileOpen && (
          <div className="border-t border-[#dce3ea] bg-[#13283d] px-4 py-4 lg:hidden">
            <nav className="space-y-1" aria-label="Mobile">
              <a href="#about" onClick={() => setMobileOpen(false)} className="block rounded-md px-3 py-2.5 text-sm text-white/80 hover:bg-white/10 hover:text-white">About</a>
              <a href="#capabilities" onClick={() => setMobileOpen(false)} className="block rounded-md px-3 py-2.5 text-sm text-white/80 hover:bg-white/10 hover:text-white">Capabilities</a>
              <a href="#brands" onClick={() => setMobileOpen(false)} className="block rounded-md px-3 py-2.5 text-sm text-white/80 hover:bg-white/10 hover:text-white">Our Brands</a>
              <a href="#contact" onClick={() => setMobileOpen(false)} className="block rounded-md px-3 py-2.5 text-sm text-white/80 hover:bg-white/10 hover:text-white">Contact</a>
              {session && (
                <Link to="/dashboard" onClick={() => setMobileOpen(false)} className="block rounded-md px-3 py-2.5 text-sm font-semibold text-[#f0d15f]">
                  Open ERP
                </Link>
              )}
            </nav>
          </div>
        )}
      </header>

      <a
        href="#main-content"
        className="sr-only fixed left-3 top-3 z-[100] rounded-md bg-[#e0b83f] px-4 py-2 text-sm font-semibold text-[#142235] focus:not-sr-only"
      >
        Skip to content
      </a>

      <main id="main-content">
        <section className="border-b border-[#dce3ea] bg-[#f7f9fb]">
          <div className="mx-auto max-w-7xl px-4 py-7 sm:px-6 lg:px-8 lg:py-10">
            <div className="relative overflow-hidden rounded-2xl border border-[#d7e0e7] bg-[#102235]">
              <img src={zizzBedroom.url} alt="Premium Zizz bedroom setting" className="absolute inset-0 h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-r from-[#102235]/95 via-[#102235]/78 to-transparent" />
              <div className="relative z-10 max-w-2xl px-6 py-16 sm:px-10 lg:px-14 lg:py-24">
                <div className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.23em] text-white/65">
                  <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
                  House of Abood Tradings
                </div>
                <h1 className="mt-5 text-4xl font-semibold leading-[1.02] tracking-[-0.04em] text-white sm:text-5xl lg:text-6xl">
                  Sleep, engineered for real life.
                </h1>
                <p className="mt-5 max-w-xl text-base leading-7 text-white/76 sm:text-lg">
                  We manufacture mattresses and sleep solutions across spring, foam, latex and specialty constructions — with Zizz as our flagship brand.
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <a href="#brands" className="inline-flex items-center gap-2 rounded-md bg-[#e0b83f] px-5 py-3 text-sm font-semibold text-[#142235] hover:bg-[#efd166]">
                    Explore our brands <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </a>
                  <a href="mailto:gm@zizzmattress.com" className="inline-flex items-center gap-2 rounded-md border border-white/25 bg-white/8 px-5 py-3 text-sm font-semibold text-white hover:bg-white/14">
                    Business enquiries
                  </a>
                </div>
                <div className="mt-9 grid max-w-xl grid-cols-2 gap-4 sm:grid-cols-4">
                  <div className="border-l border-white/20 pl-3">
                    <div className="text-xl font-semibold text-white">20,000</div>
                    <div className="mt-1 text-[10px] uppercase tracking-wide text-white/55">sq ft production area</div>
                  </div>
                  <div className="border-l border-white/20 pl-3">
                    <div className="text-xl font-semibold text-white">1,500</div>
                    <div className="mt-1 text-[10px] uppercase tracking-wide text-white/55">mattresses / month</div>
                  </div>
                  <div className="border-l border-white/20 pl-3">
                    <div className="text-xl font-semibold text-white">4</div>
                    <div className="mt-1 text-[10px] uppercase tracking-wide text-white/55">core constructions</div>
                  </div>
                  <div className="border-l border-white/20 pl-3">
                    <div className="text-xl font-semibold text-white">South India</div>
                    <div className="mt-1 text-[10px] uppercase tracking-wide text-white/55">manufacturing & supply</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="about" className="border-b border-[#dce3ea] bg-white">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:px-8 lg:py-20">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#8793a0]">About House of Abood</div>
              <h2 className="mt-3 text-3xl font-semibold leading-tight tracking-[-0.035em] text-[#17324d] sm:text-4xl">
                A manufacturer with a portfolio built for different kinds of sleep.
              </h2>
            </div>
            <div className="grid gap-6 sm:grid-cols-2">
              <div className="border-l-2 border-[#e0b83f] pl-5">
                <h3 className="text-base font-semibold text-[#20384f]">Manufacturing first</h3>
                <p className="mt-2 text-sm leading-6 text-[#68788a]">
                  Our operating base covers spring, foam, latex and specialty mattress production with packing and supply capability.
                </p>
              </div>
              <div className="border-l-2 border-[#dce3ea] pl-5">
                <h3 className="text-base font-semibold text-[#20384f]">One house, multiple propositions</h3>
                <p className="mt-2 text-sm leading-6 text-[#68788a]">
                  Different brands address premium, orthopedic, natural-fibre, everyday comfort and bedding needs without diluting their individual identities.
                </p>
              </div>
              <div className="border-l-2 border-[#dce3ea] pl-5">
                <h3 className="text-base font-semibold text-[#20384f]">Built for business supply</h3>
                <p className="mt-2 text-sm leading-6 text-[#68788a]">
                  Wholesale, retail and project requirements are supported by an end-to-end manufacturing mindset.
                </p>
              </div>
              <div className="border-l-2 border-[#dce3ea] pl-5">
                <h3 className="text-base font-semibold text-[#20384f]">Flagship: Zizz</h3>
                <p className="mt-2 text-sm leading-6 text-[#68788a]">
                  Zizz anchors the portfolio as the flagship premium mattress and sleep-solutions brand.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section id="capabilities" className="border-b border-[#dce3ea] bg-[#f5f7fa]">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
            <div className="max-w-2xl">
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#8793a0]">Capabilities</div>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-[#17324d] sm:text-4xl">
                From materials to finished mattresses.
              </h2>
              <p className="mt-3 text-sm leading-6 text-[#6b7788]">
                Core manufacturing capabilities are organized around the constructions and supply workflows our customers actually buy.
              </p>
            </div>

            <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-[#dce3ea] bg-white p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#eef3f7] text-[#17324d]"><Factory className="h-5 w-5" /></div>
                <h3 className="mt-5 text-base font-semibold text-[#20384f]">Bonnell spring</h3>
                <p className="mt-2 text-sm leading-6 text-[#6f7e8f]">Resilient spring construction for proven everyday support.</p>
              </div>
              <div className="rounded-xl border border-[#dce3ea] bg-white p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#eef3f7] text-[#17324d]"><Factory className="h-5 w-5" /></div>
                <h3 className="mt-5 text-base font-semibold text-[#20384f]">Pocketed spring</h3>
                <p className="mt-2 text-sm leading-6 text-[#6f7e8f]">Independent coil support for a more refined sleep surface.</p>
              </div>
              <div className="rounded-xl border border-[#dce3ea] bg-white p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#eef3f7] text-[#17324d]"><Factory className="h-5 w-5" /></div>
                <h3 className="mt-5 text-base font-semibold text-[#20384f]">Foam & latex</h3>
                <p className="mt-2 text-sm leading-6 text-[#6f7e8f]">Comfort and support profiles across foam, latex and medicated constructions.</p>
              </div>
              <div className="rounded-xl border border-[#dce3ea] bg-white p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#eef3f7] text-[#17324d]"><Factory className="h-5 w-5" /></div>
                <h3 className="mt-5 text-base font-semibold text-[#20384f]">Project supply</h3>
                <p className="mt-2 text-sm leading-6 text-[#6f7e8f]">Structured packing, wholesale, retail and project fulfilment from one manufacturing base.</p>
              </div>
            </div>
          </div>
        </section>

        <section id="brands" className="border-b border-[#dce3ea] bg-white">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#8793a0]">Our brands</div>
                <h2 className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-[#17324d] sm:text-4xl">One house. Distinct sleep propositions.</h2>
              </div>
              <Link to="/signup" className="text-sm font-semibold text-[#17324d] hover:underline">Business access <ArrowRight className="ml-1 inline h-4 w-4" /></Link>
            </div>

            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
              <div className="rounded-xl border border-[#d7e0e7] bg-[#f8fafb] p-4 lg:col-span-2">
                <div className="flex min-h-[220px] items-center justify-center rounded-lg bg-white p-8">
                  <img src={zizz.url} alt="Zizz flagship brand" className="max-h-32 w-full object-contain" />
                </div>
                <div className="mt-4 flex items-end justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold text-[#17324d]">Zizz</div>
                    <p className="mt-1 text-sm text-[#718093]">Flagship premium mattresses and sleep solutions.</p>
                  </div>
                  <span className="rounded-full bg-[#e8eef3] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-wide text-[#41566b]">Flagship</span>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:col-span-4 lg:grid-cols-5">
                {brands.map((brand) => (
                  <div key={brand.name} className="rounded-xl border border-[#dce3ea] bg-white p-3.5">
                    <div className="flex min-h-[150px] items-center justify-center rounded-lg bg-[#fafbfc] p-4">
                      <img src={brand.src} alt={brand.name} loading="lazy" className="max-h-28 w-full object-contain" />
                    </div>
                    <div className="mt-4 text-sm font-semibold text-[#20384f]">{brand.name}</div>
                    <p className="mt-1 text-xs leading-5 text-[#768597]">{brand.tag}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="border-b border-[#dce3ea] bg-[#f5f7fa]">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-xl border border-[#dce3ea] bg-white p-6">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8793a0]">Retail & wholesale</div>
                <h3 className="mt-2 text-xl font-semibold text-[#17324d]">A broad portfolio, one manufacturing partner.</h3>
                <p className="mt-2 text-sm leading-6 text-[#6f7e8f]">Multiple price and comfort propositions can be sourced through the same manufacturing organization.</p>
              </div>
              <div className="rounded-xl border border-[#dce3ea] bg-white p-6">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8793a0]">Projects</div>
                <h3 className="mt-2 text-xl font-semibold text-[#17324d]">Structured fulfilment for larger requirements.</h3>
                <p className="mt-2 text-sm leading-6 text-[#6f7e8f]">Production, packing and supply workflows are designed to support project-scale mattress requirements.</p>
              </div>
              <div className="rounded-xl border border-[#dce3ea] bg-white p-6">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8793a0]">Specialty comfort</div>
                <h3 className="mt-2 text-xl font-semibold text-[#17324d]">Different needs, purpose-built propositions.</h3>
                <p className="mt-2 text-sm leading-6 text-[#6f7e8f]">Orthopedic, spine-focused, natural-fibre, everyday comfort and premium options sit within the portfolio.</p>
              </div>
            </div>
          </div>
        </section>

        <section id="contact" className="bg-[#102235] text-white">
          <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-14 sm:px-6 lg:flex-row lg:items-end lg:justify-between lg:px-8 lg:py-18">
            <div className="max-w-2xl">
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/50">Business enquiries</div>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">Let’s build better sleep together.</h2>
              <p className="mt-3 max-w-xl text-sm leading-6 text-white/68">
                For retail, wholesale, project and manufacturing enquiries, connect with House of Abood Tradings. Existing customers, suppliers and staff can use the Login menu above.
              </p>
            </div>
            <div className="space-y-3">
              <a href="mailto:gm@zizzmattress.com" className="flex items-center gap-3 text-sm font-semibold text-white hover:text-[#f0d15f]">
                <Mail className="h-4 w-4 text-[#e0b83f]" aria-hidden="true" />
                gm@zizzmattress.com
              </a>
              <Link to="/signup" className="inline-flex items-center gap-2 rounded-md bg-[#e0b83f] px-4 py-2.5 text-sm font-semibold text-[#142235] hover:bg-[#efd166]">
                Request business access <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#20374c] bg-[#0e1e2d] text-white/55">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-7 text-xs sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div>© {new Date().getFullYear()} House of Abood Tradings. All rights reserved.</div>
          <div className="flex items-center gap-4">
            <span>Zizz · Premium Sleep & Comfort</span>
            <Link to="/login" className="text-white/70 hover:text-white">Login</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}