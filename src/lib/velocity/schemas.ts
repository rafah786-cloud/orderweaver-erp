import { z } from "zod";

// Official contracts: https://www.velocity.in/shipping-faq/api/serviceability and /api/rates
const pincode = z.string().regex(/^[1-9][0-9]{5}$/, "Enter a six-digit Indian pincode.");
const positive = z.number().finite().positive();
export const serviceabilityInput = z.object({
  from: pincode, to: pincode,
  payment_mode: z.enum(["cod", "prepaid"]), shipment_type: z.enum(["forward", "return"]),
}).strict();
export const serviceabilityResponse = z.object({
  status: z.literal("SUCCESS"),
  result: z.object({
    zone: z.string(),
    serviceability_results: z.array(z.object({ carrier_id: z.string(), carrier_name: z.string() })),
  }),
});

const dimensions = {
  origin_pincode: pincode, destination_pincode: pincode,
  dead_weight: positive, length: positive, width: positive, height: positive,
};
// Zod discriminated unions require unique discriminator values; forward prepaid/COD
// are distinguished by payment_method, so use a regular union for these strict branches.
export const ratesInput = z.union([
  z.object({ ...dimensions, journey_type: z.literal("forward"), payment_method: z.literal("prepaid") }).strict(),
  z.object({ ...dimensions, journey_type: z.literal("forward"), payment_method: z.literal("cod"), shipment_value: positive }).strict(),
  z.object({ ...dimensions, journey_type: z.literal("return"), qc_applicable: z.boolean().optional() }).strict(),
]);
const charges = z.number().finite().nonnegative();
const courier = {
  carrier_id: z.string(), carrier_name: z.string(), carrier_code: z.string(),
  service_level: z.string(), status: z.string(),
  expected_delivery: z.object({ pickup: z.string(), delivery: z.string() }),
};
const shipment = {
  origin_pincode: z.string(), destination_pincode: z.string(), dead_weight: positive,
  volumetric_weight: positive, applicable_weight: positive, zone: z.string(),
};
export const forwardRatesResponse = z.object({
  status: z.literal("SUCCESS"), result: z.object({
    serviceable_couriers: z.array(z.object({ ...courier, is_fast: z.boolean(), is_prime: z.boolean(),
      charges: z.object({ forward_freight_charges: charges, cod_charges: charges, rto_charges: charges, total_forward_charges: charges }),
      platform_fee: charges,
    })),
    shipment_details: z.object({ ...shipment, journey_type: z.literal("forward"), payment_method: z.enum(["cod", "prepaid"]) }),
  }),
});
export const returnRatesResponse = z.object({
  status: z.literal("SUCCESS"), result: z.object({
    serviceable_couriers: z.array(z.object({ ...courier,
      charges: z.object({ return_freight_charges: charges, qc_charges: charges, total_return_charges: charges }),
    })),
    shipment_details: z.object({ ...shipment, journey_type: z.literal("return") }),
  }),
});