/**
 * Fix bills whose primary_property_id points to a child unit instead of
 * the parent complex record. Runs for all complexes that have a parent.
 *
 * Safe to re-run: only updates bills that are currently linked to a child.
 */
import { getSupabaseServiceClient } from "@/lib/supabase/server";

async function main() {
  const sb = getSupabaseServiceClient();

  // Fetch all properties so we can build parent/child maps.
  const { data: props, error: propsErr } = await sb
    .from("properties")
    .select("id, address, complex_name, unit_number, parent_property_id");
  if (propsErr) throw propsErr;

  // Map: child id → parent id
  const childToParent = new Map<string, string>();
  for (const p of props ?? []) {
    if (p.parent_property_id) {
      childToParent.set(p.id, p.parent_property_id);
    }
  }

  // Fetch all bills with their current primary_property_id.
  const { data: bills, error: billsErr } = await sb
    .from("bills")
    .select("id, raw_pdf_filename, primary_property_id");
  if (billsErr) throw billsErr;

  // Find bills that point to a child unit.
  const toFix = (bills ?? []).filter(
    b => b.primary_property_id && childToParent.has(b.primary_property_id)
  );

  if (toFix.length === 0) {
    console.log("✓ No bills need fixing — all primary_property_id values already point to top-level records.");
    return;
  }

  console.log(`Found ${toFix.length} bill(s) to fix:\n`);

  for (const bill of toFix) {
    const oldId  = bill.primary_property_id!;
    const newId  = childToParent.get(oldId)!;
    const oldProp = props?.find(p => p.id === oldId);
    const newProp = props?.find(p => p.id === newId);

    console.log(`  ${bill.raw_pdf_filename ?? bill.id}`);
    console.log(`    was → ${oldProp?.complex_name ?? oldProp?.address} Unit ${oldProp?.unit_number} (${oldId.slice(0,8)})`);
    console.log(`    now → ${newProp?.complex_name ?? newProp?.address} parent (${newId.slice(0,8)})`);

    const { error } = await sb
      .from("bills")
      .update({ primary_property_id: newId })
      .eq("id", bill.id);

    if (error) {
      console.error(`    ✗ UPDATE FAILED: ${error.message}`);
    } else {
      console.log(`    ✓ updated`);
    }
  }

  console.log("\nDone.");
}

main().catch(console.error);
