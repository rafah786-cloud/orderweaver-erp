import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, BedDouble, CheckCircle2 } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/sleep-finder")({
  head: () => ({
    meta: [
      { title: "Find Your Mattress | Zizz Mattress" },
      { name: "description", content: "Share your sleep preferences and receive guidance from Zizz Mattress customer care." },
    ],
  }),
  component: SleepFinderPage,
});

function SleepFinderPage() {
  const [position, setPosition] = useState("Side and back");
  const [firmness, setFirmness] = useState("Medium-firm");
  const [construction, setConstruction] = useState("Open to options");
  const [size, setSize] = useState("");
  const [budget, setBudget] = useState("");
  const [extra, setExtra] = useState("");
  const [showSummary, setShowSummary] = useState(false);

  const summary = [
    "I'd like mattress buying guidance. Please recommend options only from confirmed available products.",
    "",
    "Usual sleeping position: " + position,
    "Preferred feel: " + firmness,
    "Preferred mattress construction: " + construction,
    "Bed size / mattress dimensions: " + (size || "Not sure yet"),
    "Budget: " + (budget || "Please discuss with me"),
    "Additional requirements: " + (extra || "None provided"),
  ].join("\n");

  const contactDetails = summary;

  return (
    <main className="min-h-screen bg-[#f8f6f1] text-[#19364f]">
      <header className="border-b border-[#e5e0d7] bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6"><Link to="/" className="text-sm font-bold">ZIZZ <span className="font-normal text-[#89847b]">/ Sleep finder</span></Link><Link to="/shop" className="text-sm font-semibold">Shop mattresses <ArrowRight className="ml-1 inline h-4 w-4" /></Link></div>
      </header>
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <Link to="/" className="inline-flex items-center gap-2 text-sm font-semibold text-[#8b6a3e]"><ArrowLeft className="h-4 w-4" /> Back to home</Link>
        <div className="mt-6 rounded-3xl bg-[#17324d] p-7 text-white sm:p-10">
          <div className="flex items-center gap-3 text-[#d7b06e]"><BedDouble className="h-6 w-6" /><p className="text-[10px] font-bold uppercase tracking-[.22em]">Zizz Sleep Finder</p></div>
          <h1 className="mt-4 text-3xl font-semibold tracking-[-.04em] sm:text-4xl">Tell us how you sleep.</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-white/70">Answer a few quick questions. We’ll prepare an enquiry for our team so they can match you against the verified products and sizes currently available.</p>
        </div>

        <form className="mt-6 space-y-5 rounded-3xl border border-[#e3ded4] bg-white p-6 sm:p-9" onSubmit={(event) => { event.preventDefault(); setShowSummary(true); }}>
          <label className="block text-sm font-semibold">Usual sleeping position
            <select value={position} onChange={(event) => { setPosition(event.target.value); setShowSummary(false); }} className="mt-2 w-full rounded-xl border border-[#ddd8cf] bg-[#fcfbf8] px-4 py-3 font-normal">
              <option>Side and back</option><option>Mostly side</option><option>Mostly back</option><option>Mostly stomach</option><option>Changes through the night</option>
            </select>
          </label>
          <label className="block text-sm font-semibold">Preferred feel
            <select value={firmness} onChange={(event) => { setFirmness(event.target.value); setShowSummary(false); }} className="mt-2 w-full rounded-xl border border-[#ddd8cf] bg-[#fcfbf8] px-4 py-3 font-normal">
              <option>Soft</option><option>Medium</option><option>Medium-firm</option><option>Firm</option><option>Not sure</option>
            </select>
          </label>
          <label className="block text-sm font-semibold">Preferred mattress construction
            <select value={construction} onChange={(event) => { setConstruction(event.target.value); setShowSummary(false); }} className="mt-2 w-full rounded-xl border border-[#ddd8cf] bg-[#fcfbf8] px-4 py-3 font-normal">
              <option>Open to options</option><option>Foam</option><option>Spring</option><option>Coir</option><option>Latex</option><option>Orthopaedic/support-focused</option>
            </select>
          </label>
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="block text-sm font-semibold">Bed size or dimensions
              <input value={size} onChange={(event) => { setSize(event.target.value); setShowSummary(false); }} className="mt-2 w-full rounded-xl border border-[#ddd8cf] bg-[#fcfbf8] px-4 py-3 font-normal" placeholder="e.g. 75 × 60 inches, or not sure" />
            </label>
            <label className="block text-sm font-semibold">Budget
              <input value={budget} onChange={(event) => { setBudget(event.target.value); setShowSummary(false); }} className="mt-2 w-full rounded-xl border border-[#ddd8cf] bg-[#fcfbf8] px-4 py-3 font-normal" placeholder="e.g. ₹10,000" />
            </label>
          </div>
          <label className="block text-sm font-semibold">Anything else we should know?
            <textarea value={extra} onChange={(event) => { setExtra(event.target.value); setShowSummary(false); }} rows={3} className="mt-2 w-full rounded-xl border border-[#ddd8cf] bg-[#fcfbf8] px-4 py-3 font-normal" placeholder="Room for two sleepers, custom size, preferred fabric, etc." />
          </label>
          <button type="submit" className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#19364f] px-6 py-3.5 text-sm font-bold text-white hover:bg-[#294c67]">Prepare my guidance request <ArrowRight className="h-4 w-4" /></button>
          {showSummary && <div className="rounded-2xl border border-[#e7dfd1] bg-[#faf6ef] p-4" aria-live="polite"><p className="flex items-center gap-2 text-sm font-semibold"><CheckCircle2 className="h-4 w-4 text-[#9b6c2d]" /> Your preferences are ready.</p><p className="mt-2 text-sm leading-6 text-[#707976]">Because verified product specifications and prices are not yet published in the store, this tool won’t guess or auto-select a model. Send your preferences to customer care for a real recommendation.</p><Link to="/contact" search={{ type: "guidance", details: contactDetails }} className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#19364f] px-5 py-3 text-sm font-bold text-white">Continue to enquiry <ArrowRight className="h-4 w-4" /></Link></div>}
        </form>
      </div>
    </main>
  );
}
