import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const partySchema = z.object({
  name: z.string().min(1).max(255),
  gstin: z.string().max(20).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  email: z.string().max(255).nullable().optional(),
  address: z.string().max(2000).nullable().optional(),
  state_code: z.string().max(20).nullable().optional(),
  pin_code: z.string().max(20).nullable().optional(),
  contact_person: z.string().max(255).nullable().optional(),
  pan: z.string().max(20).nullable().optional(),
  opening_balance: z.number(),
  closing_balance: z.number(),
});

const stockSchema = z.object({
  name: z.string().min(1).max(255),
  unit: z.string().max(40),
  opening_qty: z.number(),
  opening_rate: z.number(),
  group: z.string().max(255),
});

const ledgerEntrySchema = z.object({
  party_name: z.string().min(1).max(255),
  entry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  voucher_type: z.string().max(120).nullable(),
  voucher_number: z.string().max(120).nullable(),
  debit: z.number().min(0),
  credit: z.number().min(0),
  narration: z.string().max(2000).nullable(),
  external_ref: z.string().min(1).max(255),
});

const groupSchema = z.object({
  name: z.string().min(1).max(255),
  parent: z.string().max(255).nullable(),
  nature: z.enum(["assets", "liabilities", "income", "expenses"]),
  affects_gross_profit: z.boolean(),
});

const ledgerMasterSchema = z.object({
  name: z.string().min(1).max(255),
  parent: z.string().max(255),
  gstin: z.string().max(20).nullable(),
  opening_balance: z.number(),
  opening_type: z.enum(["dr", "cr"]),
  notes: z.string().max(500).nullable(),
});

const godownSchema = z.object({
  name: z.string().min(1).max(255),
  parent: z.string().max(255).nullable(),
  address: z.string().max(2000).nullable(),
});

const costCentreSchema = z.object({
  name: z.string().min(1).max(255),
  parent: z.string().max(255).nullable(),
});

const billSchema = z.object({
  party_name: z.string().min(1).max(255),
  bill_name: z.string().min(1).max(255),
  bill_date: z.string().date().nullable(),
  amount: z.number(),
  reference_type: z.enum(["opening", "new_ref", "against_ref", "on_account", "advance", "cleared"]),
  voucher_guid: z.string().max(255).nullable(),
  external_ref: z.string().min(1).max(1000),
});

const inputSchema = z.object({
  customers: z.array(partySchema).max(2000).default([]),
  vendors: z.array(partySchema).max(2000).default([]),
  rawMaterials: z.array(stockSchema).max(2000).default([]),
  finishedGoods: z.array(stockSchema).max(2000).default([]),
  ledgerEntries: z.array(ledgerEntrySchema).max(5000).default([]),
  groups: z.array(groupSchema).max(2000).default([]),
  ledgers: z.array(ledgerMasterSchema).max(2000).default([]),
  godowns: z.array(godownSchema).max(1000).default([]),
  costCentres: z.array(costCentreSchema).max(1000).default([]),
  bills: z.array(billSchema).max(5000).default([]),
  // When true, the handler skips the O(party_count) balance recompute so the
  // caller can stream many chunks fast and call `recomputeTallyBalances` once
  // at the end. Default true — the client always finalizes explicitly.
  skipRecompute: z.boolean().default(true),
});

export type TallyImportResult = {
  customers: { inserted: number; updated: number };
  vendors: { inserted: number; updated: number };
  rawMaterials: { inserted: number; updated: number };
  finishedGoods: { inserted: number; updated: number };
  partyLedgerEntries: { inserted: number; skipped: number };
  supplierLedgerEntries: { inserted: number; skipped: number };
  ledgerGroups: { inserted: number; updated: number };
  ledgerAccounts: { inserted: number; updated: number };
  godowns: { inserted: number; updated: number };
  costCentres: { inserted: number; updated: number };
  billReferences: { staged: number; unmatched: number };
  unmatchedLedgerNames: string[];
  errors: string[];
  /** Party/supplier ids touched by this chunk's ledger inserts.
   *  Aggregated by the client and passed to `recomputeTallyBalances`. */
  touchedPartyIds: string[];
  touchedSupplierIds: string[];
};

function norm(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

export async function chunkInsert(
  supabase: any,
  table: "party_ledger_entries" | "supplier_ledger_entries",
  rows: Record<string, unknown>[],
  chunk = 500,
): Promise<{ inserted: number; errors: string[] }> {
  let inserted = 0;
  const errors: string[] = [];
  for (let i = 0; i < rows.length; i += chunk) {
    const slice = rows.slice(i, i + chunk);
    const { error } = await supabase.from(table).insert(slice);
    if (error) {
      // Fall back to per-row to skip duplicates from the unique external_ref index
      for (const row of slice) {
        const { error: e1 } = await supabase.from(table).insert(row);
        if (!e1) inserted++;
        else if (!/duplicate key|unique constraint/i.test(e1.message)) {
          console.error(`[tally-import] insert error in ${table}`, e1);
          errors.push(`${table}: row could not be inserted`);
        }
      }
    } else {
      inserted += slice.length;
    }
  }
  return { inserted, errors };
}

export const importTallyMasters = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => inputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Server-side admin gate. The UI also restricts this, but the client
    // check alone is insufficient because authenticated non-admins could call
    // this server function directly.
    const { data: roles, error: rolesErr } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (rolesErr) {
      console.error("[tally-import] role lookup failed", rolesErr);
      throw new Error("Authorization check failed");
    }
    const isAdmin = (roles ?? []).some((r) => r.role === "admin");
    if (!isAdmin) throw new Error("Admin only");
    const result: TallyImportResult = {
      customers: { inserted: 0, updated: 0 },
      vendors: { inserted: 0, updated: 0 },
      rawMaterials: { inserted: 0, updated: 0 },
      finishedGoods: { inserted: 0, updated: 0 },
      partyLedgerEntries: { inserted: 0, skipped: 0 },
      supplierLedgerEntries: { inserted: 0, skipped: 0 },
      ledgerGroups: { inserted: 0, updated: 0 },
      ledgerAccounts: { inserted: 0, updated: 0 },
      godowns: { inserted: 0, updated: 0 },
      costCentres: { inserted: 0, updated: 0 },
      billReferences: { staged: 0, unmatched: 0 },

      unmatchedLedgerNames: [],
      errors: [],
      touchedPartyIds: [],
      touchedSupplierIds: [],
    };

    // Never acknowledge an accounting import that discards bill allocations.
    // Reject before the first write, including requests bypassing the upload UI.
    if (data.bills.length || data.ledgerEntries.length) {
      throw new Error(
        "Accounting transactions and bills require a validated staging import; no records were written by this request.",
      );
    }

    // Maps populated below for ledger entry matching
    const partyByName = new Map<string, string>(); // lowercased name → id
    const supplierByName = new Map<string, string>();

    /* ---------------- parties (customers) ---------------- */
    {
      const { data: existing, error } = await supabase
        .from("parties")
        .select("id, name, gstin, tally_name");
      if (error) {
        console.error("[tally-import] read parties", error);
        throw new Error("Failed to read existing parties");
      }
      const byName = new Map<string, string>();
      const byGstin = new Map<string, string>();
      (existing ?? []).forEach((p) => {
        byName.set(norm(p.name), p.id);
        if (p.tally_name) byName.set(norm(p.tally_name), p.id);
        if (p.gstin) byGstin.set(norm(p.gstin), p.id);
      });

      for (const c of data.customers) {
        const existingId = (c.gstin && byGstin.get(norm(c.gstin))) || byName.get(norm(c.name));
        const row = {
          name: c.name,
          tally_name: c.name,
          gstin: c.gstin ?? null,
          phone: c.phone ?? null,
          email: c.email ?? null,
          address: c.address ?? null,
          state_code: c.state_code ?? null,
          pin_code: c.pin_code ?? null,
          contact_person: c.contact_person ?? null,
          opening_balance: c.opening_balance,
        };
        if (existingId) {
          const { error: uErr } = await supabase.from("parties").update(row).eq("id", existingId);
          if (uErr) {
            console.error("[tally-import] customer update", uErr);
            result.errors.push(`Customer ${c.name}: update failed`);
          } else result.customers.updated++;
          partyByName.set(norm(c.name), existingId);
        } else {
          const { data: ins, error: iErr } = await supabase
            .from("parties")
            .insert(row)
            .select("id")
            .single();
          if (iErr || !ins) {
            console.error("[tally-import] customer insert", iErr);
            result.errors.push(`Customer ${c.name}: insert failed`);
          } else {
            result.customers.inserted++;
            partyByName.set(norm(c.name), ins.id);
          }
        }
      }

      // Ensure ALL parties (even those not in this import) are addressable for ledger matching
      (existing ?? []).forEach((p) => {
        if (!partyByName.has(norm(p.name))) partyByName.set(norm(p.name), p.id);
        if (p.tally_name && !partyByName.has(norm(p.tally_name)))
          partyByName.set(norm(p.tally_name), p.id);
      });
    }

    /* ---------------- suppliers (vendors) ---------------- */
    {
      const { data: existing, error } = await supabase
        .from("suppliers")
        .select("id, name, gstin, tally_name");
      if (error) {
        console.error("[tally-import] read suppliers", error);
        throw new Error("Failed to read existing suppliers");
      }
      const byName = new Map<string, string>();
      const byGstin = new Map<string, string>();
      (existing ?? []).forEach((s) => {
        byName.set(norm(s.name), s.id);
        if (s.tally_name) byName.set(norm(s.tally_name), s.id);
        if (s.gstin) byGstin.set(norm(s.gstin), s.id);
      });

      for (const v of data.vendors) {
        const existingId = (v.gstin && byGstin.get(norm(v.gstin))) || byName.get(norm(v.name));
        const row = {
          name: v.name,
          tally_name: v.name,
          gstin: v.gstin ?? null,
          phone: v.phone ?? null,
          email: v.email ?? null,
          address: v.address ?? null,
          state_code: v.state_code ?? null,
          contact_person: v.contact_person ?? null,
          opening_balance: v.opening_balance,
        };
        if (existingId) {
          const { error: uErr } = await supabase.from("suppliers").update(row).eq("id", existingId);
          if (uErr) {
            console.error("[tally-import] vendor update", uErr);
            result.errors.push(`Vendor ${v.name}: update failed`);
          } else result.vendors.updated++;
          supplierByName.set(norm(v.name), existingId);
        } else {
          const { data: ins, error: iErr } = await supabase
            .from("suppliers")
            .insert(row)
            .select("id")
            .single();
          if (iErr || !ins) {
            console.error("[tally-import] vendor insert", iErr);
            result.errors.push(`Vendor ${v.name}: insert failed`);
          } else {
            result.vendors.inserted++;
            supplierByName.set(norm(v.name), ins.id);
          }
        }
      }

      (existing ?? []).forEach((s) => {
        if (!supplierByName.has(norm(s.name))) supplierByName.set(norm(s.name), s.id);
        if (s.tally_name && !supplierByName.has(norm(s.tally_name)))
          supplierByName.set(norm(s.tally_name), s.id);
      });
    }

    /* ---------------- raw_materials ---------------- */
    {
      const { data: existing, error } = await supabase.from("raw_materials").select("id, name");
      if (error) {
        console.error("[tally-import] read raw_materials", error);
        throw new Error("Failed to read existing raw_materials");
      }
      const byName = new Map<string, string>();
      (existing ?? []).forEach((r) => byName.set(norm(r.name), r.id));

      for (const m of data.rawMaterials) {
        const existingId = byName.get(norm(m.name));
        const fresh = !existingId;
        const key = `tally:raw:${norm(m.name)}`;
        // @ts-expect-error This RPC is defined by the unapplied accounting migration; fail closed at runtime if absent.
        const { data: accepted, error: ingestErr } = await supabase.rpc("ingest_tally_event", {
          p_key: key,
          p_entity_type: "raw_material",
          p_entity_key: norm(m.name),
        });
        if (ingestErr) throw ingestErr;
        if (accepted === false) {
          result.rawMaterials.updated++;
          continue;
        }
        const row = {
          name: m.name,
          unit: m.unit || "pcs",
          notes: m.group ? `Tally group: ${m.group}` : null,
        };
        if (existingId) {
          const { error: uErr } = await supabase
            .from("raw_materials")
            .update(row)
            .eq("id", existingId);
          if (uErr) {
            console.error("[tally-import] raw update", uErr);
            result.errors.push(`Raw material ${m.name}: update failed`);
          } else result.rawMaterials.updated++;
        } else {
          const { error: iErr } = await supabase.from("raw_materials").insert(row);
          if (iErr) {
            console.error("[tally-import] raw insert", iErr);
            result.errors.push(`Raw material ${m.name}: insert failed`);
          } else result.rawMaterials.inserted++;
        }
      }
    }

    /* ---------------- product_models (finished goods) ---------------- */
    {
      const { data: existing, error } = await supabase.from("product_models").select("id, name");
      if (error) {
        console.error("[tally-import] read product_models", error);
        throw new Error("Failed to read existing product_models");
      }
      const byName = new Map<string, string>();
      (existing ?? []).forEach((p) => byName.set(norm(p.name), p.id));

      for (const f of data.finishedGoods) {
        const existingId = byName.get(norm(f.name));
        // Tally OPENINGRATE is an inventory valuation rate, not the ERP's
        // selling/default price. Never overwrite a sales price from a Tally
        // stock opening valuation.
        const row = {
          name: f.name,
          notes: f.group ? `Tally group: ${f.group}` : null,
        };
        if (existingId) {
          const { error: uErr } = await supabase
            .from("product_models")
            .update(row)
            .eq("id", existingId);
          if (uErr) {
            console.error("[tally-import] finished update", uErr);
            result.errors.push(`Finished good ${f.name}: update failed`);
          } else result.finishedGoods.updated++;
        } else {
          const { error: iErr } = await supabase.from("product_models").insert({ ...row, default_price: 0 });
          if (iErr) {
            console.error("[tally-import] finished insert", iErr);
            result.errors.push(`Finished good ${f.name}: insert failed`);
          } else result.finishedGoods.inserted++;
        }
      }
    }

    /* ---------------- ledger_groups (Tally account groups) ---------------- */
    if (data.groups.length > 0) {
      const { data: existing } = await supabase.from("ledger_groups").select("id, name");
      const byName = new Map<string, string>();
      (existing ?? []).forEach((g) => byName.set(norm(g.name), g.id));

      for (const g of data.groups) {
        const row = {
          name: g.name,
          nature: g.nature,
          affects_gross_profit: g.affects_gross_profit,
        };
        const id = byName.get(norm(g.name));
        if (id) {
          const { error } = await supabase.from("ledger_groups").update(row).eq("id", id);
          if (error) result.errors.push(`Group ${g.name}: update failed`);
          else result.ledgerGroups.updated++;
        } else {
          const { data: ins, error } = await supabase
            .from("ledger_groups")
            .insert(row)
            .select("id")
            .single();
          if (error || !ins) {
            console.error("[tally-import] group insert", error);
            result.errors.push(`Group ${g.name}: insert failed`);
          } else {
            byName.set(norm(g.name), ins.id);
            result.ledgerGroups.inserted++;
          }
        }
      }
      // Second pass: wire up parents now that every group exists.
      for (const g of data.groups) {
        if (!g.parent) continue;
        const id = byName.get(norm(g.name));
        const parentId = byName.get(norm(g.parent));
        if (id && parentId && id !== parentId) {
          await supabase.from("ledger_groups").update({ parent_id: parentId }).eq("id", id);
        }
      }
    }

    /* ---------------- ledger_accounts (full chart of accounts) ---------------- */
    if (data.ledgers.length > 0) {
      const { data: existingGroups } = await supabase.from("ledger_groups").select("id, name");
      const groupByName = new Map<string, string>();
      (existingGroups ?? []).forEach((g) => groupByName.set(norm(g.name), g.id));

      // Fallback bucket for ledgers whose Tally group wasn't in this export.
      let fallbackGroupId = groupByName.get("tally imported") ?? null;

      const { data: existing } = await supabase.from("ledger_accounts").select("id, name");
      const byName = new Map<string, string>();
      (existing ?? []).forEach((l) => byName.set(norm(l.name), l.id));

      for (const l of data.ledgers) {
        let groupId = groupByName.get(norm(l.parent)) ?? null;
        if (!groupId) {
          if (!fallbackGroupId) {
            const { data: ins } = await supabase
              .from("ledger_groups")
              .insert({ name: "Tally Imported", nature: "assets" })
              .select("id")
              .single();
            fallbackGroupId = ins?.id ?? null;
            if (fallbackGroupId) groupByName.set("tally imported", fallbackGroupId);
          }
          groupId = fallbackGroupId;
        }
        if (!groupId) {
          result.errors.push(`Ledger ${l.name}: no group could be resolved`);
          continue;
        }

        const row = {
          name: l.name,
          group_id: groupId,
          opening_balance: l.opening_balance,
          opening_balance_type: l.opening_type,
          gstin: l.gstin,
          notes: l.notes,
        };
        const id = byName.get(norm(l.name));
        if (id) {
          const { error } = await supabase.from("ledger_accounts").update(row).eq("id", id);
          if (error) result.errors.push(`Ledger ${l.name}: update failed`);
          else result.ledgerAccounts.updated++;
        } else {
          const { error } = await supabase.from("ledger_accounts").insert(row);
          if (error) {
            console.error("[tally-import] ledger insert", error);
            result.errors.push(`Ledger ${l.name}: insert failed`);
          } else {
            result.ledgerAccounts.inserted++;
            byName.set(norm(l.name), "new");
          }
        }
      }
    }

    /* ---------------- godowns ---------------- */
    if (data.godowns.length > 0) {
      const { data: existing } = await supabase.from("godowns").select("id, name");
      const byName = new Map<string, string>();
      (existing ?? []).forEach((g) => byName.set(norm(g.name), g.id));

      for (const g of data.godowns) {
        const row = { name: g.name, address: g.address };
        const id = byName.get(norm(g.name));
        if (id) {
          const { error } = await supabase.from("godowns").update(row).eq("id", id);
          if (error) result.errors.push(`Godown ${g.name}: update failed`);
          else result.godowns.updated++;
        } else {
          const { data: ins, error } = await supabase
            .from("godowns")
            .insert(row)
            .select("id")
            .single();
          if (error || !ins) {
            console.error("[tally-import] godown insert", error);
            result.errors.push(`Godown ${g.name}: insert failed`);
          } else {
            byName.set(norm(g.name), ins.id);
            result.godowns.inserted++;
          }
        }
      }
      for (const g of data.godowns) {
        if (!g.parent) continue;
        const id = byName.get(norm(g.name));
        const parentId = byName.get(norm(g.parent));
        if (id && parentId && id !== parentId) {
          await supabase.from("godowns").update({ parent_id: parentId }).eq("id", id);
        }
      }
    }

    /* ---------------- cost centres ---------------- */
    if (data.costCentres.length > 0) {
      const { data: existing } = await supabase.from("cost_centers").select("id, name");
      const byName = new Map<string, string>();
      (existing ?? []).forEach((c) => byName.set(norm(c.name), c.id));

      for (const c of data.costCentres) {
        const id = byName.get(norm(c.name));
        if (id) {
          result.costCentres.updated++;
          continue;
        }
        const { data: ins, error } = await supabase
          .from("cost_centers")
          .insert({ name: c.name })
          .select("id")
          .single();
        if (error || !ins) {
          console.error("[tally-import] cost centre insert", error);
          result.errors.push(`Cost centre ${c.name}: insert failed`);
        } else {
          byName.set(norm(c.name), ins.id);
          result.costCentres.inserted++;
        }
      }
      for (const c of data.costCentres) {
        if (!c.parent) continue;
        const id = byName.get(norm(c.name));
        const parentId = byName.get(norm(c.parent));
        if (id && parentId && id !== parentId) {
          await supabase.from("cost_centers").update({ parent_id: parentId }).eq("id", id);
        }
      }
    }

    /* ---------------- ledger entries (vouchers) ---------------- */
    if (data.ledgerEntries.length > 0) {
      const partyRows: Record<string, unknown>[] = [];
      const supplierRows: Record<string, unknown>[] = [];
      const unmatched = new Set<string>();

      for (const e of data.ledgerEntries) {
        const key = norm(e.party_name);
        const pid = partyByName.get(key);
        const sid = supplierByName.get(key);
        const base = {
          entry_date: e.entry_date,
          voucher_type: e.voucher_type,
          voucher_number: e.voucher_number,
          debit: e.debit,
          credit: e.credit,
          narration: e.narration,
          source: "tally",
          external_ref: e.external_ref,
        };
        if (pid) partyRows.push({ ...base, party_id: pid });
        else if (sid) supplierRows.push({ ...base, supplier_id: sid });
        else unmatched.add(e.party_name);
      }

      if (partyRows.length > 0) {
        const r = await chunkInsert(supabase, "party_ledger_entries", partyRows);
        result.partyLedgerEntries.inserted = r.inserted;
        result.partyLedgerEntries.skipped = partyRows.length - r.inserted;
        result.errors.push(...r.errors);
      }
      if (supplierRows.length > 0) {
        const r = await chunkInsert(supabase, "supplier_ledger_entries", supplierRows);
        result.supplierLedgerEntries.inserted = r.inserted;
        result.supplierLedgerEntries.skipped = supplierRows.length - r.inserted;
        result.errors.push(...r.errors);
      }
      result.unmatchedLedgerNames = Array.from(unmatched).slice(0, 100);

      const partyIds = Array.from(new Set(partyRows.map((r) => r.party_id as string)));
      const supplierIds = Array.from(new Set(supplierRows.map((r) => r.supplier_id as string)));
      result.touchedPartyIds = partyIds;
      result.touchedSupplierIds = supplierIds;

      /* ---------------- recompute current_balance from ledger ----------------
         current_balance = opening_balance + sum(debit) - sum(credit).
         Skipped for chunked imports — the client calls `recomputeTallyBalances`
         once at the end with the union of all touched ids so we don't re-scan
         each party's full ledger for every chunk. */
      if (!data.skipRecompute) {
        for (const id of partyIds) {
          const { data: sums } = await supabase
            .from("party_ledger_entries")
            .select("debit, credit")
            .eq("party_id", id);
          const totalDr = (sums ?? []).reduce((a, r) => a + Number(r.debit ?? 0), 0);
          const totalCr = (sums ?? []).reduce((a, r) => a + Number(r.credit ?? 0), 0);
          const { data: p } = await supabase
            .from("parties")
            .select("opening_balance")
            .eq("id", id)
            .single();
          const opening = Number(p?.opening_balance ?? 0);
          // @ts-expect-error RPC is unavailable until its migration is applied.
          await supabase.rpc("record_tally_balance", {
            p_entity_type: "party",
            p_entity_id: id,
            p_source_key: id,
            p_reported: opening + totalDr - totalCr,
          });
        }
        for (const id of supplierIds) {
          const { data: sums } = await supabase
            .from("supplier_ledger_entries")
            .select("debit, credit")
            .eq("supplier_id", id);
          const totalDr = (sums ?? []).reduce((a, r) => a + Number(r.debit ?? 0), 0);
          const totalCr = (sums ?? []).reduce((a, r) => a + Number(r.credit ?? 0), 0);
          const { data: s } = await supabase
            .from("suppliers")
            .select("opening_balance")
            .eq("id", id)
            .single();
          const opening = Number(s?.opening_balance ?? 0);
          // @ts-expect-error RPC is unavailable until its migration is applied.
          await supabase.rpc("record_tally_balance", {
            p_entity_type: "supplier",
            p_entity_id: id,
            p_source_key: id,
            p_reported: opening + totalDr - totalCr,
          });
        }
      }
    }

    return result;
  });

/**
 * Finalize a chunked Tally import by recomputing `current_balance` on the
 * given parties/suppliers. Called once after all ledger chunks have been
 * uploaded so we scan each party's ledger only once regardless of how many
 * chunks touched it. Bounded to a sane max per call; the client batches.
 */
export const recomputeTallyBalances = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        partyIds: z.array(z.string().uuid()).max(2000).default([]),
        supplierIds: z.array(z.string().uuid()).max(2000).default([]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: roles, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (roleError || !(roles ?? []).some((r) => r.role === "admin")) throw new Error("Admin only");
    const { data: companyId, error: companyError } = await supabase.rpc("current_company_id");
    if (companyError || !companyId) throw new Error("No active company selected");

    let recomputedParties = 0;
    let recomputedSuppliers = 0;

    for (const id of data.partyIds) {
      const { data: p } = await supabase
        .from("parties")
        .select("opening_balance")
        .eq("id", id)
        .eq("company_id", companyId)
        .maybeSingle();
      if (!p) throw new Error("Party is not in the active company");
      const { data: sums } = await supabase
        .from("party_ledger_entries")
        .select("debit, credit")
        .eq("party_id", id);
      const totalDr = (sums ?? []).reduce((a, r) => a + Number(r.debit ?? 0), 0);
      const totalCr = (sums ?? []).reduce((a, r) => a + Number(r.credit ?? 0), 0);
      const opening = Number(p?.opening_balance ?? 0);
      // @ts-expect-error RPC is unavailable until its migration is applied.
      await supabase.rpc("record_tally_balance", {
        p_entity_type: "party",
        p_entity_id: id,
        p_source_key: id,
        p_reported: opening + totalDr - totalCr,
      });
      recomputedParties++;
    }
    for (const id of data.supplierIds) {
      const { data: supplier } = await supabase
        .from("suppliers")
        .select("opening_balance")
        .eq("id", id)
        .eq("company_id", companyId)
        .maybeSingle();
      if (!supplier) throw new Error("Supplier is not in the active company");
      const { data: sums } = await supabase
        .from("supplier_ledger_entries")
        .select("debit, credit")
        .eq("supplier_id", id);
      const totalDr = (sums ?? []).reduce((a, r) => a + Number(r.debit ?? 0), 0);
      const totalCr = (sums ?? []).reduce((a, r) => a + Number(r.credit ?? 0), 0);
      const opening = Number(supplier?.opening_balance ?? 0);
      // @ts-expect-error RPC is unavailable until its migration is applied.
      await supabase.rpc("record_tally_balance", {
        p_entity_type: "supplier",
        p_entity_id: id,
        p_source_key: id,
        p_reported: opening + totalDr - totalCr,
      });
      recomputedSuppliers++;
    }
    return { recomputedParties, recomputedSuppliers };
  });
