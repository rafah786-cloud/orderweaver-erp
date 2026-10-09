import { TallyClient } from "./tally-client.js";
import { createLocalBridge } from "./local-server.js";
const allowedOrigin = process.env.TALLY_ALLOWED_ORIGIN;
const pairingKey = process.env.TALLY_PAIRING_KEY;
if (!allowedOrigin || !pairingKey || pairingKey.length < 32) throw new Error("Set TALLY_ALLOWED_ORIGIN to the exact ERP origin and TALLY_PAIRING_KEY to a random key of at least 32 characters.");
if (new URL(allowedOrigin).origin !== allowedOrigin || !allowedOrigin.startsWith("https://")) throw new Error("TALLY_ALLOWED_ORIGIN must be one exact HTTPS origin.");
const tallyUrl = process.env.TALLY_URL ?? "http://127.0.0.1:9000";
if (tallyUrl !== "http://127.0.0.1:9000") throw new Error("The browser bridge only connects to TallyPrime at http://127.0.0.1:9000.");
createLocalBridge({ allowedOrigin, pairingKey, client: new TallyClient(tallyUrl) }).listen(9010, "127.0.0.1", () => console.log("Read-only local bridge listening on 127.0.0.1:9010. No pairing key is logged."));