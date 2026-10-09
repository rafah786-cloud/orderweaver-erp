import assert from "node:assert/strict";
import test from "node:test";
import type { IncomingMessage } from "node:http";
import { authorizeLocalRequest } from "./local-server.js";
import { TallyClient } from "./tally-client.js";
const config = { allowedOrigin: "https://erp.example.com", pairingKey: "a".repeat(32), client: new TallyClient() };
const req = (origin: string, token: string) => ({ headers: { origin, authorization: `Bearer ${token}` } }) as IncomingMessage;
test("pairing requires both exact origin and key", () => {
  assert.equal(authorizeLocalRequest(req(config.allowedOrigin, config.pairingKey), config), true);
  assert.equal(authorizeLocalRequest(req("https://evil.example.com", config.pairingKey), config), false);
  assert.equal(authorizeLocalRequest(req(config.allowedOrigin, "wrong"), config), false);
});