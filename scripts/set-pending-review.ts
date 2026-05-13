import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local", override: true });

import { getSupabaseServiceClient } from "../src/lib/supabase/server";

async function main() {
  const sb = getSupabaseServiceClient();

  // Show current state
  const { data: bills } = await sb
    .from("bills")
    .select("id, status, raw_pdf_filename, billing_period_start")
    .order("created_at", { ascending: false });

  console.log("\nCurrent bills:\n");
  bills?.forEach((b, i) =>
    console.log(`  [${i}] ${b.status.padEnd(16)} | ${b.billing_period_start} | ${b.raw_pdf_filename?.slice(0, 55)}`)
  );

  // Set the 2 most recent approved bills to pending_review
  const toUpdate = bills?.filter(b => b.status === "approved").slice(0, 2) ?? [];

  for (const bill of toUpdate) {
    await sb.from("bills").update({ status: "pending_review" }).eq("id", bill.id);
    await sb.from("audit_log").insert({
      entity_type: "bill",
      entity_id: bill.id,
      action: "status_changed",
      notes: "Manually set to pending_review for testing",
      user_identifier: "admin",
    });
    console.log(`\n✓ Set to pending_review: ${bill.raw_pdf_filename}`);
  }

  console.log("\nDone.");
}

main().catch(console.error);
