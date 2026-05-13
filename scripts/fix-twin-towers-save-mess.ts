/**
 * One-time cleanup of the mess created by the Twin Towers save:
 *  1. Re-link Rockaways Unit 2 back to the Rockaways parent
 *  2. Delete the duplicate TWIN TOWERS parent (uppercase / wrong case)
 *  3. Fix the Twin Towers bill primary_property_id → correct Twin Towers parent
 */
import { getSupabaseServiceClient } from "@/lib/supabase/server";

async function main() {
  const sb = getSupabaseServiceClient();

  const { data: props } = await sb
    .from("properties")
    .select("id, address, complex_name, unit_number, parent_property_id");

  // IDs we care about (from the audit)
  const dupParentId     = "89dcd706-ffff-ffff-ffff-ffffffffffff"; // placeholder — fetch below
  const correctTTParent = "2dc804a7-ffff-ffff-ffff-ffffffffffff"; // placeholder
  const rockawaParent   = "449b51ca-ffff-ffff-ffff-ffffffffffff"; // placeholder
  const unit2Id         = "0fbde360-ffff-ffff-ffff-ffffffffffff"; // placeholder

  // Resolve real IDs from the DB instead of hardcoding
  const dupParent = props?.find(p =>
    p.complex_name === "TWIN TOWERS" && p.unit_number === null
  );
  const correctTT = props?.find(p =>
    p.complex_name === "Twin Towers" && p.unit_number === null
  );
  const rockaway = props?.find(p =>
    p.complex_name === "Rockaways" && p.unit_number === null
  );
  const unit2 = props?.find(p =>
    p.complex_name === "Rockaways" && p.unit_number === "2"
  );

  if (!dupParent)    { console.log("✓ No duplicate TWIN TOWERS parent found — already clean."); }
  if (!correctTT)    { console.error("✗ Cannot find correct Twin Towers parent"); return; }
  if (!rockaway)     { console.error("✗ Cannot find Rockaways parent"); return; }
  if (!unit2)        { console.error("✗ Cannot find Rockaways Unit 2"); return; }

  console.log("Correct Twin Towers parent: " + correctTT.id);
  console.log("Duplicate TWIN TOWERS parent: " + (dupParent?.id ?? "none"));
  console.log("Rockaways parent: " + rockaway.id);
  console.log("Rockaways Unit 2: " + unit2.id);
  console.log("");

  // Step 1: Re-link Rockaways Unit 2 back to the Rockaways parent
  if (unit2.parent_property_id !== rockaway.id) {
    const { error } = await sb
      .from("properties")
      .update({ parent_property_id: rockaway.id })
      .eq("id", unit2.id);
    if (error) { console.error("✗ Failed to re-link Unit 2:", error.message); return; }
    console.log("✓ Rockaways Unit 2 re-linked to Rockaways parent");
  } else {
    console.log("✓ Rockaways Unit 2 already correctly linked — skipping");
  }

  // Step 2: Delete the duplicate TWIN TOWERS parent
  if (dupParent) {
    // First null out any remaining parent_property_id references to it
    await sb
      .from("properties")
      .update({ parent_property_id: null })
      .eq("parent_property_id", dupParent.id);

    const { error } = await sb
      .from("properties")
      .delete()
      .eq("id", dupParent.id);
    if (error) { console.error("✗ Failed to delete duplicate parent:", error.message); return; }
    console.log("✓ Deleted duplicate TWIN TOWERS parent");
  }

  // Step 3: Fix the Twin Towers bill → correct parent
  const { data: ttBills } = await sb
    .from("bills")
    .select("id, raw_pdf_filename, primary_property_id")
    .ilike("raw_pdf_filename", "%twin towers%");

  for (const bill of ttBills ?? []) {
    const prop = props?.find(p => p.id === bill.primary_property_id);
    if (prop?.parent_property_id) {
      // Points to a child — fix it
      const { error } = await sb
        .from("bills")
        .update({ primary_property_id: correctTT.id })
        .eq("id", bill.id);
      if (error) { console.error("✗ Failed to update bill:", error.message); return; }
      console.log("✓ Fixed bill: " + bill.raw_pdf_filename + " → Twin Towers parent");
    } else {
      console.log("✓ Bill already correctly linked: " + bill.raw_pdf_filename);
    }
  }

  console.log("\nDone.");
}

main().catch(console.error);
