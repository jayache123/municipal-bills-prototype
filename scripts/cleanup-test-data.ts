import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local", override: true });

import { getSupabaseServiceClient } from "../src/lib/supabase/server";

/**
 * Wipes all bills (cascades to bill_line_items + bill_field_errors) and all
 * audit_log entries. Leaves seed data intact (municipalities, billing_accounts,
 * properties, settings).
 *
 * Use this when iterating on save/extraction and you want a clean slate.
 */
async function main(): Promise<void> {
  const supabase = getSupabaseServiceClient();

  console.log("→ Counting current data...");
  const before = await counts(supabase);
  printCounts("Before:", before);

  if (before.bills === 0 && before.audit === 0) {
    console.log("\n✓ Nothing to clean. Exiting.");
    return;
  }

  const force = process.argv.includes("--force");
  if (!force) {
    console.log("\n⚠ This will delete all bills, line items, errors, and audit log entries.");
    console.log("  Seed data (municipalities, billing_accounts, properties, settings) is preserved.");
    console.log("  Re-run with --force to confirm.");
    process.exit(1);
  }

  console.log("\n→ Deleting bills (cascades to line items + errors)...");
  const { error: billsError } = await supabase
    .from("bills")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  if (billsError) throw new Error(`Failed to delete bills: ${billsError.message}`);

  console.log("→ Deleting audit log...");
  const { error: auditError } = await supabase
    .from("audit_log")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  if (auditError) throw new Error(`Failed to delete audit log: ${auditError.message}`);

  console.log("\n→ Verifying...");
  const after = await counts(supabase);
  printCounts("After:", after);
  console.log("\n✓ Cleanup complete.");
}

type Counts = { bills: number; line_items: number; errors: number; audit: number };

async function counts(supabase: ReturnType<typeof getSupabaseServiceClient>): Promise<Counts> {
  const tables = ["bills", "bill_line_items", "bill_field_errors", "audit_log"] as const;
  const results = await Promise.all(
    tables.map((t) => supabase.from(t).select("*", { count: "exact", head: true })),
  );
  return {
    bills: results[0].count ?? 0,
    line_items: results[1].count ?? 0,
    errors: results[2].count ?? 0,
    audit: results[3].count ?? 0,
  };
}

function printCounts(label: string, c: Counts): void {
  console.log(`  ${label}`);
  console.log(`    bills:             ${c.bills}`);
  console.log(`    bill_line_items:   ${c.line_items}`);
  console.log(`    bill_field_errors: ${c.errors}`);
  console.log(`    audit_log:         ${c.audit}`);
}

main().catch((err) => {
  console.error("✗", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
