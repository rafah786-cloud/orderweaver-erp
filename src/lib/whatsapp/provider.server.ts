import type { WhatsAppProvider } from "./providers/types";
import { interaktProvider } from "./providers/interakt.server";

/** Single point that resolves the active WhatsApp provider for the app.
 *  Add more providers (Twilio, Gupshup, Meta Cloud) and switch via env. */
export function getWhatsAppProvider(): WhatsAppProvider {
  const choice = (process.env.WHATSAPP_PROVIDER ?? "interakt").toLowerCase();
  switch (choice) {
    case "interakt":
    default:
      return interaktProvider;
  }
}
