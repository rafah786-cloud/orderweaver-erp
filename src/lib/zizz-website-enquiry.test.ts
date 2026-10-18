import { describe, expect, it } from "vitest";
import { normalizeZizzEnquiryPhone, WebsiteEnquirySchema } from "./zizz-website-enquiry";

describe("Zizz website enquiry validation", () => {
  it.each([
    ["9876543210", "+919876543210"],
    ["09876543210", "+919876543210"],
    ["+91 98765-43210", "+919876543210"],
    ["919876543210", "+919876543210"],
    ["+971 50 123 4567", "+971501234567"],
  ])("normalizes %s to E.164", (raw, expected) => {
    expect(normalizeZizzEnquiryPhone(raw)).toBe(expected);
  });

  it.each(["123", "0000000000", "+012345678", "+123", "abcdefghij"])(
    "rejects invalid phone format %s",
    (raw) => expect(normalizeZizzEnquiryPhone(raw)).toBeNull(),
  );

  it("accepts a valid typed enquiry and defaults optional fields", () => {
    const result = WebsiteEnquirySchema.parse({
      name: "Customer Name",
      phone: "9876543210",
      type: "business",
    });
    expect(result.email).toBe("");
    expect(result.message).toBe("");
    expect(result.companyWebsite).toBe("");
  });

  it("rejects unknown enquiry types, overlong messages, and malformed input", () => {
    expect(WebsiteEnquirySchema.safeParse({
      name: "Customer",
      phone: "9876543210",
      type: "admin",
    }).success).toBe(false);

    expect(WebsiteEnquirySchema.safeParse({
      name: "Customer",
      phone: "9876543210",
      type: "general",
      message: "x".repeat(4001),
    }).success).toBe(false);
  });
});
