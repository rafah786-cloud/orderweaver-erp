import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Razorpay sandbox checkout safety", () => {
  const createOrder = read("src/routes/api/public/razorpay/create-order.ts");
  const verifyPayment = read("src/routes/api/public/razorpay/verify-payment.ts");
  const checkout = read("src/routes/checkout.tsx");
  const gitignore = read(".gitignore");

  it("uses a server-configured fixed test amount and rejects live credentials", () => {
    expect(createOrder).toContain('process.env.RAZORPAY_TEST_AMOUNT_PAISE');
    expect(createOrder).toContain('keyId.startsWith("rzp_test_")');
    expect(createOrder).toContain("configuredAmount < 100");
    expect(createOrder).toContain("configuredAmount > 100_000");
    expect(createOrder).toContain('https://api.razorpay.com/v1/orders');
    expect(createOrder).not.toMatch(/amount:\s*body\./);
  });

  it("verifies Standard Checkout signatures using HMAC SHA-256 and constant-time comparison", () => {
    expect(verifyPayment).toContain('createHmac("sha256", keySecret)');
    expect(verifyPayment).toContain('update(`${orderId}|${paymentId}`, "utf8")');
    expect(verifyPayment).toContain("timingSafeEqual(expected, supplied)");
    expect(verifyPayment).toContain('return jsonError("Payment signature verification failed.", 400)');
    expect(verifyPayment).toContain('keyId.startsWith("rzp_test_")');
    expect(verifyPayment).toContain("No authoritative website order");
  });

  it("handles modal dismissal, payment failure, and server verification", () => {
    expect(checkout).toContain("https://checkout.razorpay.com/v1/checkout.js");
    expect(checkout).toContain('checkout.on("payment.failed"');
    expect(checkout).toContain("ondismiss:");
    expect(checkout).toContain("/api/public/razorpay/create-order");
    expect(checkout).toContain("/api/public/razorpay/verify-payment");
    expect(checkout).toContain("does not create a Zizz sales order");
  });

  it("ignores real local environment files but keeps the example template", () => {
    expect(gitignore).toContain(".env");
    expect(gitignore).toContain(".env.*");
    expect(gitignore).toContain("!.env.example");
  });
});
