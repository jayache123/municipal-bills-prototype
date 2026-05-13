import { getSupabaseServiceClient } from "@/lib/supabase/server";

async function main() {
  const sb = getSupabaseServiceClient();

  const { data: props } = await sb
    .from("properties")
    .select("id, address, complex_name, unit_number, parent_property_id, status")
    .order("address");

  console.log("\n=== PROPERTIES (" + (props?.length ?? 0) + " rows) ===");
  for (const p of props ?? []) {
    const tag = p.parent_property_id ? "  └─ child" : "TOP-LEVEL ";
    const label = p.address
      + (p.complex_name ? " / " + p.complex_name : "")
      + (p.unit_number  ? " Unit " + p.unit_number  : "");
    console.log(tag + " | " + label.padEnd(50) + " | id:" + p.id.slice(0, 8));
  }

  const { data: bills } = await sb
    .from("bills")
    .select("id, raw_pdf_filename, primary_property_id, status");

  console.log("\n=== BILLS (" + (bills?.length ?? 0) + " rows) ===");
  for (const b of bills ?? []) {
    const prop = props?.find(p => p.id === b.primary_property_id);
    const propLabel = prop
      ? (prop.parent_property_id
          ? "CHILD → Unit " + (prop.unit_number ?? "?")
          : "top-level (" + (prop.complex_name ?? prop.address) + ")")
      : b.primary_property_id ? "ID NOT FOUND" : "null";
    console.log(
      (b.raw_pdf_filename ?? "no filename").slice(0, 45).padEnd(46) +
      "| " + b.status.padEnd(15) +
      "| primary_property → " + propLabel
    );
  }
}

main().catch(console.error);
