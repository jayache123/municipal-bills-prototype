/**
 * One-off backfill script. Safe to re-run — all operations are idempotent.
 *
 * Does two things:
 *
 * 1. Backfills bills.summary_month from billing_period_end (first day of that month).
 *    For City of Cape Town, billing_period_end falls within the "Account Summary Month"
 *    so taking the first-of-month gives the correct period label.
 *
 * 2. Creates parent property records for multi-unit complexes (Rockaways, Twin Towers,
 *    3B Vredefort) and links each unit's parent_property_id to the new parent.
 *    19 Atholl Road is a standalone property — no parent needed.
 *
 * Run with:  npm run backfill
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local", override: true });

import { getSupabaseServiceClient } from "../src/lib/supabase/server";

const supabase = getSupabaseServiceClient();

async function backfillSummaryMonth() {
  console.log("\n── Backfilling summary_month ──────────────────────────────");

  const { data: bills, error } = await supabase
    .from("bills")
    .select("id, billing_period_end, summary_month, raw_pdf_filename");

  if (error) throw new Error(`Failed to fetch bills: ${error.message}`);

  let updated = 0;
  for (const bill of bills ?? []) {
    if (bill.summary_month) {
      console.log(`  SKIP  ${bill.raw_pdf_filename} (already has summary_month ${bill.summary_month})`);
      continue;
    }
    if (!bill.billing_period_end) {
      console.log(`  SKIP  ${bill.raw_pdf_filename} (no billing_period_end)`);
      continue;
    }

    // First day of the billing_period_end month.
    const [year, month] = bill.billing_period_end.split("-");
    const summaryMonth = `${year}-${month}-01`;

    const { error: updateError } = await supabase
      .from("bills")
      .update({ summary_month: summaryMonth })
      .eq("id", bill.id);

    if (updateError) throw new Error(`Failed to update bill ${bill.id}: ${updateError.message}`);
    console.log(`  SET   ${bill.raw_pdf_filename} → summary_month ${summaryMonth}`);
    updated++;
  }

  console.log(`  Done — ${updated} bill(s) updated.`);
}

type ParentSpec = {
  complex_name: string;
  address: string;
  billing_account_id: string;
  suburb: string | null;
  erf_number: string | null;
};

async function backfillParentProperties() {
  console.log("\n── Creating parent properties ─────────────────────────────");

  // Fetch all current properties.
  const { data: properties, error } = await supabase
    .from("properties")
    .select("id, complex_name, unit_number, address, suburb, erf_number, billing_account_id, parent_property_id");
  if (error) throw new Error(`Failed to fetch properties: ${error.message}`);

  // Group multi-unit properties by complex. A complex is identified by
  // (complex_name + address). If there are multiple unit_numbers for the same
  // complex, we need a parent.
  const complexGroups = new Map<string, typeof properties>();
  for (const prop of properties ?? []) {
    if (!prop.unit_number) continue; // already a parent or standalone — skip
    const key = `${prop.complex_name}||${prop.address}`;
    if (!complexGroups.has(key)) complexGroups.set(key, []);
    complexGroups.get(key)!.push(prop);
  }

  for (const [key, units] of complexGroups) {
    const first = units[0];
    console.log(`\n  Complex: ${first.complex_name}, ${first.address} (${units.length} unit(s))`);

    // Check if a parent (no unit_number, same complex+address) already exists.
    const { data: existing } = await supabase
      .from("properties")
      .select("id")
      .eq("complex_name", first.complex_name)
      .eq("address", first.address)
      .is("unit_number", null)
      .maybeSingle();

    let parentId: string;
    if (existing) {
      parentId = existing.id;
      console.log(`    Parent already exists: ${parentId}`);
    } else {
      // Create the parent.
      const { data: created, error: createError } = await supabase
        .from("properties")
        .insert({
          billing_account_id: first.billing_account_id,
          address: first.address,
          complex_name: first.complex_name,
          unit_number: null,
          erf_number: first.erf_number,
          suburb: first.suburb,
          postal_code: null,
          status: "active",
          billing_frequency: "monthly",
        })
        .select("id")
        .single();

      if (createError || !created) throw new Error(`Failed to create parent: ${createError?.message}`);
      parentId = created.id;
      console.log(`    Created parent: ${parentId}`);

      // Audit log entry for the new parent.
      await supabase.from("audit_log").insert({
        entity_type: "property",
        entity_id: parentId,
        action: "created",
        user_identifier: "system_backfill",
        notes: `Backfill: parent property created for complex ${first.complex_name}, ${first.address}`,
      });
    }

    // Link each unit to the parent.
    for (const unit of units) {
      if (unit.parent_property_id === parentId) {
        console.log(`    SKIP  Unit ${unit.unit_number} (already linked)`);
        continue;
      }
      const { error: linkError } = await supabase
        .from("properties")
        .update({ parent_property_id: parentId })
        .eq("id", unit.id);
      if (linkError) throw new Error(`Failed to link unit ${unit.id}: ${linkError.message}`);
      console.log(`    LINK  Unit ${unit.unit_number} → parent`);
    }
  }

  console.log("\n  Done.");
}

async function main() {
  console.log("=== Backfill: summary_month + parent properties ===");
  await backfillSummaryMonth();
  await backfillParentProperties();
  console.log("\n=== Complete ===");
}

main().catch((e) => { console.error(e); process.exit(1); });
