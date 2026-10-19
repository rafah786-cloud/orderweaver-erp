import { createFileRoute } from "@tanstack/react-router";
import { randomUUID } from "node:crypto";

function jsonError(error: string, status: number) {
  return Response.json({ ok: false, error }, { status });
}

function getTestCredentialError(keyId: string | undefined, keySecret: string | undefined) {
  if (!keyId) return "Razorpay test Key ID is missing from this server environment.";
  if (!keySecret) return "Razorpay test Key Secret is missing from this server environment.";
  if (!keyId.startsWith("rzp_test_")) {
    return "The configured Razorpay Key ID is not a test-mode key. Use an rzp_test_ Key ID; live keys are rejected.";
  }
  return null;
}

export const Route = createFileRoute("/api/public/razorpay/create-order")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Read secrets inside the request handler so runtime bindings are available.
        const keyId = process.env.RAZORPAY_KEY_ID;
        const keySecret = process.env.RAZORPAY_KEY_SECRET;
        const configuredAmount = Number(process.env.RAZORPAY_TEST_AMOUNT_PAISE);

        // This endpoint is intentionally sandbox-only until the storefront has
        // authoritative prices, order persistence, stock and fulfilment checks.
        const credentialError = getTestCredentialError(keyId, keySecret);
        if (credentialError) return jsonError(credentialError, 503);
        if (!Number.isSafeInteger(configuredAmount) || configuredAmount < 100 || configuredAmount > 100_000) {
          return jsonError("Set RAZORPAY_TEST_AMOUNT_PAISE to a whole-number test amount between 100 and 100000 paise.", 503);
        }

        const contentType = request.headers.get("content-type") ?? "";
        if (!contentType.toLowerCase().includes("application/json")) {
          return jsonError("Send a JSON request.", 415);
        }
        // Do not accept an amount from the browser. The server-side test amount
        // is fixed by environment configuration to prevent client price tampering.
        try {
          const body = await request.json();
          if (body === null || typeof body !== "object" || Array.isArray(body)) {
            return jsonError("Invalid request body.", 400);
          }
        } catch {
          return jsonError("Invalid JSON request body.", 400);
        }

        let response: Response;
        try {
          response = await fetch("https://api.razorpay.com/v1/orders", {
            method: "POST",
            headers: {
              Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              amount: configuredAmount,
              currency: "INR",
              receipt: `zizz-test-${randomUUID()}`,
              notes: { source: "zizz_website_test_checkout" },
            }),
            signal: AbortSignal.timeout(12_000),
          });
        } catch {
          return jsonError("Razorpay could not be reached. Please try again.", 502);
        }

        if (!response.ok) {
          // Do not return gateway response bodies: they may contain sensitive diagnostics.
          return jsonError(
            response.status === 401 ? "Razorpay rejected the test credentials." : "Razorpay could not create the test order.",
            response.status === 401 ? 401 : 502,
          );
        }

        let order: { id?: string; amount?: number; currency?: string };
        try {
          order = await response.json();
        } catch {
          return jsonError("Razorpay returned an invalid order response.", 502);
        }
        if (!order.id || order.amount !== configuredAmount || order.currency !== "INR") {
          return jsonError("Razorpay returned an unexpected test order.", 502);
        }

        return Response.json({
          ok: true,
          key_id: keyId,
          order_id: order.id,
          amount: order.amount,
          currency: order.currency,
        });
      },
    },
  },
});
