import { z } from "zod";

export const WebsiteEnquirySchema = z.object({
  name: z.string().trim().min(2).max(100),
  phone: z.string().trim().min(8).max(32),
  email: z.string().trim().max(255).optional().default(""),
  type: z.enum(["general", "guidance", "product", "custom", "business", "warranty", "tracking"]),
  model: z.string().trim().max(120).optional().default(""),
  message: z.string().trim().max(4000).optional().default(""),
  companyWebsite: z.string().max(200).optional().default(""),
});

export type WebsiteEnquiryInput = z.infer<typeof WebsiteEnquirySchema>;

/** Normalize accepted visitor phone formats to E.164 before storage and duplicate checks. */
export function normalizeZizzEnquiryPhone(raw: string): string | null {
  const compact = raw.trim().replace(/[\s().-]/g, "");
  let digits = compact.replace(/\D/g, "");

  // Common Indian trunk-prefix format: 0XXXXXXXXXX.
  if (!compact.startsWith("+") && digits.length === 11 && digits.startsWith("0")) {
    digits = digits.slice(1);
  }

  if (/^[6-9][0-9]{9}$/.test(digits)) return `+91${digits}`;
  if (/^91[6-9][0-9]{9}$/.test(digits)) return `+${digits}`;
  if (compact.startsWith("+") && digits.length >= 8 && digits.length <= 15 && !digits.startsWith("0")) {
    return `+${digits}`;
  }
  return null;
}
