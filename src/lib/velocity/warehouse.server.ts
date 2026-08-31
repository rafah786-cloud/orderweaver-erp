import { getVelocityBaseUrl, getVelocityToken } from "./auth.server";

/**
 * Velocity Shipping — warehouses (server-only).
 * Fetches the live warehouse list from Velocity and mirrors it into
 * public.velocity_warehouses. The bearer token never leaves the server.
 */

export type VelocityWarehouse = {
  velocity_id: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  country: string | null;
  is_active: boolean;
  raw: Record<string, unknown>;
};

// Velocity has not published a single canonical list path; try the documented
// resource first and fall back to common variants before giving up.
const LIST_PATHS = [
  "/custom/api/v1/warehouse",
  "/custom/api/v1/warehouse/list",
  "/custom/api/v1/warehouses",
];

function str(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number") return String(v);
  return null;
}

function pick(o: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = str(o[k]);
    if (v) return v;
  }
  return null;
}

function normalize(item: Record<string, unknown>, index: number): VelocityWarehouse {
  const addr = (item["address"] && typeof item["address"] === "object"
    ? (item["address"] as Record<string, unknown>)
    : item) as Record<string, unknown>;
  const active = item["is_active"] ?? item["active"] ?? item["status"];
  return {
    velocity_id:
      pick(item, ["id", "warehouse_id", "uuid", "code", "warehouse_code"]) ??
      `${pick(item, ["name", "warehouse_name"]) ?? "warehouse"}-${index}`,
    name: pick(item, ["name", "warehouse_name", "title"]) ?? `Warehouse ${index + 1}`,
    contact_person: pick(item, ["contact_person", "contact_name", "contact"]),
    phone: pick(item, ["phone", "mobile", "contact_number", "phone_number"]),
    email: pick(item, ["email", "contact_email"]),
    address_line1: pick(addr, ["address_line1", "address1", "line1", "address", "street"]),
    address_line2: pick(addr, ["address_line2", "address2", "line2", "landmark"]),
    city: pick(addr, ["city", "district"]),
    state: pick(addr, ["state", "state_name"]),
    pincode: pick(addr, ["pincode", "pin_code", "zip", "postal_code", "zipcode"]),
    country: pick(addr, ["country", "country_name"]),
    is_active: active === undefined || active === null ? true : active === true || active === "active" || active === 1 || active === "1",
    raw: item,
  };
}

function extractList(body: unknown): Record<string, unknown>[] | null {
  if (Array.isArray(body)) return body as Record<string, unknown>[];
  if (body && typeof body === "object") {
    const obj = body as Record<string, unknown>;
    for (const key of ["data", "warehouses", "results", "records", "items"]) {
      const v = obj[key];
      if (Array.isArray(v)) return v as Record<string, unknown>[];
      if (v && typeof v === "object") {
        const nested = extractList(v);
        if (nested) return nested;
      }
    }
  }
  return null;
}

export class VelocityApiError extends Error {
  status: number;
  code: string | null;
  constructor(message: string, status: number, code: string | null) {
    super(message);
    this.name = "VelocityApiError";
    this.status = status;
    this.code = code;
  }
}

/** Fetches the live warehouse list from Velocity. */
export async function fetchVelocityWarehouses(): Promise<VelocityWarehouse[]> {
  const token = await getVelocityToken();
  const base = getVelocityBaseUrl();
  let lastError: VelocityApiError | null = null;

  for (const path of LIST_PATHS) {
    const res = await fetch(`${base}${path}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    });
    const text = await res.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }

    if (res.ok) {
      const list = extractList(body) ?? [];
      return list.map((item, i) => normalize(item, i));
    }

    const meta =
      body && typeof body === "object" && typeof (body as Record<string, unknown>)["meta"] === "object"
        ? ((body as Record<string, unknown>)["meta"] as Record<string, unknown>)
        : {};
    const code = str(meta["message"]);
    const message =
      str(meta["details"]) ||
      code ||
      (body && typeof body === "object" ? str((body as Record<string, unknown>)["message"]) : null) ||
      `Velocity returned HTTP ${res.status}`;

    // 404 just means this path variant does not exist — keep probing.
    if (res.status !== 404) {
      lastError = new VelocityApiError(message, res.status, code);
      break;
    }
    lastError = new VelocityApiError(
      "Velocity did not expose a warehouse list endpoint for this account.",
      404,
      "NOT_FOUND",
    );
  }

  throw lastError ?? new VelocityApiError("Velocity warehouse request failed.", 500, null);
}

/** Fetches from Velocity and mirrors the result into the database. */
export async function syncVelocityWarehouses(): Promise<{ synced: number; warehouses: VelocityWarehouse[] }> {
  const warehouses = await fetchVelocityWarehouses();
  if (warehouses.length) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = new Date().toISOString();
    const { error } = await supabaseAdmin
      .from("velocity_warehouses")
      .upsert(
        warehouses.map((w) => ({ ...w, last_synced_at: now, updated_at: now })),
        { onConflict: "velocity_id" },
      );
    if (error) throw new Error(error.message);
  }
  return { synced: warehouses.length, warehouses };
}
