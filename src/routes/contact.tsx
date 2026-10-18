import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Mail, MapPin, MessageCircle, Phone, Send } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";

const CUSTOMER_CARE_EMAIL = "customercare@aboodtradings.in";
const CUSTOMER_CARE_PHONE = "+91 92880 22477";
const WHATSAPP_NUMBER = "919288022477";
const MAP_QUERY = "Abood Tradings, Build No 2/53-A Alfa Tower, Malappuram Road, Valluvambram, Malappuram, Kerala";

const enquiryLabels: Record<string, string> = {
  general: "General enquiry",
  guidance: "Mattress buying guidance",
  product: "Product enquiry",
  custom: "Custom mattress enquiry",
  business: "Wholesale, hospitality or project enquiry",
  warranty: "Warranty / service request",
  tracking: "Order tracking request",
};

export const Route = createFileRoute("/contact")({
  validateSearch: (search: Record<string, unknown>): { type: string; model?: string; details?: string } => ({
    type: typeof search.type === "string" && Object.prototype.hasOwnProperty.call(enquiryLabels, search.type) ? search.type : "general",
    model: typeof search.model === "string" ? search.model : "",
    details: typeof search.details === "string" ? search.details : "",
  }),
  head: () => ({
    meta: [
      { title: "Visit & Enquire | Zizz Mattress" },
      { name: "description", content: "Find the Valluvambram location and contact Zizz Mattress customer care for product, custom-size and business enquiries." },
    ],
  }),
  component: ContactPage,
});

function ContactPage() {
  const { type, model, details } = Route.useSearch();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [topic, setTopic] = useState(type);
  const [message, setMessage] = useState("");
  const [readyToSend, setReadyToSend] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState("");
  const [submissionReference, setSubmissionReference] = useState<string | null>(null);
  const [companyWebsite, setCompanyWebsite] = useState("");

  useEffect(() => {
    setTopic(type);
    if (model || details) {
      setMessage([model ? "Mattress model: " + model : "", details].filter(Boolean).join("\n\n"));
    }
  }, [type, model, details]);

  const enquiryText = useMemo(() => [
    "Zizz Mattress website enquiry",
    "",
    "Name: " + name.trim(),
    "Phone: " + phone.trim(),
    "Email: " + (email.trim() || "Not provided"),
    "Enquiry type: " + (enquiryLabels[topic] ?? enquiryLabels.general),
    "",
    "Message:",
    message.trim() || "Please contact me about my enquiry.",
  ].join("\n"), [name, phone, email, topic, message]);

  const emailHref = "mailto:" + CUSTOMER_CARE_EMAIL + "?subject=" + encodeURIComponent("Zizz Mattress website enquiry") + "&body=" + encodeURIComponent(enquiryText);
  const whatsappHref = "https://wa.me/" + WHATSAPP_NUMBER + "?text=" + encodeURIComponent(enquiryText);

  const clearSubmissionState = () => {
    setReadyToSend(false);
    setSubmissionError("");
    setSubmissionReference(null);
  };

  async function submitEnquiry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setSubmissionError("");
    setSubmissionReference(null);
    setReadyToSend(false);
    try {
      const response = await fetch("/api/public/website-enquiry", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          phone,
          email,
          type: topic,
          model,
          message,
          companyWebsite,
        }),
      });
      const result = await response.json().catch(() => null) as { ok?: boolean; referenceNumber?: string | null; error?: string } | null;
      if (!response.ok || !result?.ok) {
        throw new Error(result?.error || "We could not save your enquiry right now.");
      }
      setSubmissionReference(result.referenceNumber ?? null);
      setReadyToSend(true);
    } catch (error) {
      setSubmissionError(error instanceof Error ? error.message : "We could not save your enquiry right now.");
      // Always leave direct email and WhatsApp options available as a fallback.
      setReadyToSend(true);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f8f6f1] text-[#19364f]">
      <header className="border-b border-[#e5e0d7] bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-8">
          <Link to="/" className="text-sm font-bold">ZIZZ <span className="font-normal text-[#89847b]">/ Visit & enquire</span></Link>
          <Link to="/shop" className="text-sm font-semibold text-[#19364f] hover:text-[#9b6c2d]">Shop mattresses <ArrowRight className="ml-1 inline h-4 w-4" /></Link>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
        <Link to="/" className="inline-flex items-center gap-2 text-sm font-semibold text-[#8b6a3e]"><ArrowLeft className="h-4 w-4" /> Back to Zizz home</Link>
        <div className="mt-6 max-w-3xl">
          <p className="text-[10px] font-bold uppercase tracking-[.22em] text-[#a77a3b]">We’re here to help</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-.04em] sm:text-5xl">Visit, ask, or plan your mattress.</h1>
          <p className="mt-4 text-base leading-7 text-[#707976]">Send your product, size, custom-build, service or business enquiry to our customer-care team. Choose email or WhatsApp after completing the form.</p>
        </div>

        <div className="mt-9 grid gap-6 lg:grid-cols-[1.05fr_.95fr]">
          <section className="overflow-hidden rounded-3xl border border-[#e3ded4] bg-white">
            <div className="flex items-start gap-4 p-6 sm:p-8">
              <div className="rounded-2xl bg-[#f4eee4] p-3"><MapPin className="h-6 w-6 text-[#a16f2c]" /></div>
              <div>
                <h2 className="text-xl font-bold">Our Valluvambram location</h2>
                <p className="mt-2 text-sm leading-6 text-[#707976]">Abood Tradings, ALFA Tower, Athanikkal, Valluvambram, Kerala 673642, India.</p>
                <p className="mt-2 text-xs leading-5 text-[#8a8d88]">This map uses the publicly listed Valluvambram business location. Please confirm the exact production-unit/factory access with customer care before travelling.</p>
                <a href={"https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(MAP_QUERY)} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-[#9b6c2d]">Open directions <ArrowRight className="h-4 w-4" /></a>
              </div>
            </div>
            <iframe
              title="Map to the publicly listed Abood Tradings location in Valluvambram"
              src={"https://www.google.com/maps?q=" + encodeURIComponent(MAP_QUERY) + "&output=embed"}
              className="h-[320px] w-full border-0 sm:h-[380px]"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
            />
          </section>

          <section className="rounded-3xl border border-[#e3ded4] bg-white p-6 sm:p-8">
            <p className="text-[10px] font-bold uppercase tracking-[.2em] text-[#a77a3b]">Customer care</p>
            <h2 className="mt-2 text-2xl font-semibold">Send an enquiry</h2>
            <div className="mt-4 grid gap-2 text-sm text-[#66706d]">
              <a className="inline-flex items-center gap-2 hover:text-[#9b6c2d]" href={"mailto:" + CUSTOMER_CARE_EMAIL}><Mail className="h-4 w-4" /> {CUSTOMER_CARE_EMAIL}</a>
              <a className="inline-flex items-center gap-2 hover:text-[#9b6c2d]" href={"tel:" + CUSTOMER_CARE_PHONE.replaceAll(" ", "")}><Phone className="h-4 w-4" /> {CUSTOMER_CARE_PHONE}</a>
              <a className="inline-flex items-center gap-2 hover:text-[#9b6c2d]" href={"https://wa.me/" + WHATSAPP_NUMBER} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4" /> WhatsApp customer care</a>
            </div>

            <form className="mt-6 space-y-4" onSubmit={submitEnquiry}>
              <div className="pointer-events-none absolute left-[-10000px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
                <label>Leave this field blank<input tabIndex={-1} autoComplete="off" name="companyWebsite" value={companyWebsite} onChange={(event) => setCompanyWebsite(event.target.value)} /></label>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-semibold">Your name
                  <input required autoComplete="name" value={name} onChange={(event) => { setName(event.target.value); clearSubmissionState(); }} className="mt-1.5 w-full rounded-xl border border-[#ddd8cf] bg-[#fcfbf8] px-3.5 py-3 font-normal outline-none focus:border-[#a77a3b] focus:ring-2 focus:ring-[#a77a3b]/15" placeholder="Full name" />
                </label>
                <label className="block text-sm font-semibold">Phone number
                  <input required type="tel" autoComplete="tel" value={phone} onChange={(event) => { setPhone(event.target.value); clearSubmissionState(); }} className="mt-1.5 w-full rounded-xl border border-[#ddd8cf] bg-[#fcfbf8] px-3.5 py-3 font-normal outline-none focus:border-[#a77a3b] focus:ring-2 focus:ring-[#a77a3b]/15" placeholder="Your contact number" />
                </label>
              </div>
              <label className="block text-sm font-semibold">Email (optional)
                <input type="email" autoComplete="email" value={email} onChange={(event) => { setEmail(event.target.value); clearSubmissionState(); }} className="mt-1.5 w-full rounded-xl border border-[#ddd8cf] bg-[#fcfbf8] px-3.5 py-3 font-normal outline-none focus:border-[#a77a3b] focus:ring-2 focus:ring-[#a77a3b]/15" placeholder="you@example.com" />
              </label>
              <label className="block text-sm font-semibold">What can we help with?
                <select value={topic} onChange={(event) => { setTopic(event.target.value); clearSubmissionState(); }} className="mt-1.5 w-full rounded-xl border border-[#ddd8cf] bg-[#fcfbf8] px-3.5 py-3 font-normal outline-none focus:border-[#a77a3b] focus:ring-2 focus:ring-[#a77a3b]/15">
                  {Object.entries(enquiryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label className="block text-sm font-semibold">Message
                <textarea rows={4} value={message} onChange={(event) => { setMessage(event.target.value); clearSubmissionState(); }} className="mt-1.5 w-full resize-y rounded-xl border border-[#ddd8cf] bg-[#fcfbf8] px-3.5 py-3 font-normal outline-none focus:border-[#a77a3b] focus:ring-2 focus:ring-[#a77a3b]/15" placeholder="Tell us your mattress size, requirements, order number or project details." />
              </label>
              <button type="submit" disabled={isSubmitting} className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#19364f] px-6 py-3.5 text-sm font-bold text-white transition hover:bg-[#294c67] disabled:cursor-wait disabled:opacity-60"><Send className="h-4 w-4" /> {isSubmitting ? "Submitting enquiry…" : "Submit enquiry"}</button>
              {submissionError && <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">{submissionError} You can still contact customer care directly below.</p>}
              {readyToSend && (
                <div className="rounded-2xl border border-[#e7dfd1] bg-[#faf6ef] p-4" aria-live="polite">
                  <p className="text-sm font-semibold">{submissionReference ? "Your enquiry has been recorded." : submissionError ? "Use a direct customer-care option." : "Your request is ready."}</p>
                  {submissionReference && <p className="mt-1 text-sm font-bold text-[#8b6a3e]">Reference: {submissionReference}</p>}
                  <p className="mt-1 text-xs leading-5 text-[#737a76]">{submissionReference ? "The enquiry is saved in the Mattress Maestro website-enquiry inbox. For immediate follow-up, you can also send the details to customer care by email or WhatsApp." : "The website could not confirm that the enquiry was saved. Use email or WhatsApp below; your message will be pre-filled and must be sent from that app."}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <a href={emailHref} className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-bold text-[#19364f] ring-1 ring-[#d9d1c4]"><Mail className="h-4 w-4" /> Send by email</a>
                    <a href={whatsappHref} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full bg-[#19364f] px-4 py-2.5 text-sm font-bold text-white"><MessageCircle className="h-4 w-4" /> Send on WhatsApp</a>
                  </div>
                </div>
              )}
            </form>
          </section>
        </div>
      </div>
    </main>
  );
}
