import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "node:crypto";

function jsonError(error: string, status: number) {
  return Response.json({ ok: false, error }, { status });
}

export const Route = createFileRoute("/api/public/razorpay/verify-payment")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const keyId = process.env.RAZORPAY_KEY_ID;
        const keySecret = process.env.RAZORPAY_KEY_SECRET;
        if (!keyId || !keySecret || !keyId.startsWith("rzp_test_")) {
          return jsonError("Razorpay test credentials are not configured.", 503);
        }

        const contentType = request.headers.get("content-type") ?? "";
        if (!contentType.toLowerCase().includes("application/json")) {
          return jsonError("Send a JSON request.", 415);
        }

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return jsonError("Invalid JSON request body.", 400);
        }
        if (!body || typeof body !== "object" || Array.isArray(body)) {
          return jsonError("Missing payment verification fields.", 400);
        }

        const input = body as Record<string, unknown>;
        const orderId = input.razorpay_order_id;
        const paymentId = input.razorpay_payment_id;
        const signature = input.razorpay_signature;
        if (
          typeof orderId !== "string" || !/^order_[A-Za-z0-9]+$/.test(orderId) ||
          typeof paymentId !== "string" || !/^pay_[A-Za-z0-9]+$/.test(paymentId) ||
          typeof signature !== "string" || !/^[a-f0-9]{64}$/i.test(signature)
        ) {
          return jsonError("Missing or invalid payment verification fields.", 400);
        }

        const expected = createHmac("sha256", keySecret)
          .update(`${orderId}|${paymentId}`, "utf8")
          .digest();
        const supplied = Buffer.from(signature, "hex");
        if (supplied.length !== expected.length || !timingSafeEqual(expected, supplied)) {
          return jsonError("Payment signature verification failed.", 400);
        }

        // Signature verification alone is not an order/fulfilment record.
        // Do not mark an ERP order paid here: no authoritative website order
        // has yet been created or persisted for this sandbox checkout.
        return Response.json({
          ok: true,
          verified: true,
          mode: "test",
          message: "Test payment signature verified. No ERP order or paid status was recorded.",
        });
      },
    },
  },
});
