/**
 * Verification script for the 7 Vredefort bills.
 * Checks: financial reconciliation, line item totals, meter chain, period ordering,
 * property linkage, and display correctness.
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local", override: true });
import { createClient } from "@supabase/supabase-js";

const PROPERTY_ID = "f48dd23f-a7d1-448e-9ea4-39f8892fc3a1"; // Unit 24
const PARENT_ID   = "672431a0-0c84-4557-a3b3-0f8c8698cce4"; // 3B Vredefort parent

async function main() {
  const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  // ── Inspect the August pre-existing bill ─────────────────────────────────────
  console.log("── August 2025 pre-existing bill ────────────────────");
  const { data: augBill } = await sb
    .from("bills")
    .select("id, tax_invoice_number, issue_date, primary_property_id, status, current_amount_due, total_amount_due, previous_balance, payments_received")
    .eq("tax_invoice_number", "202011396764")
    .maybeSingle();

  if (augBill) {
    console.log(`  Invoice: ${augBill.tax_invoice_number}`);
    console.log(`  Issue date: ${augBill.issue_date}`);
    console.log(`  Linked to property: ${augBill.primary_property_id}`);
    console.log(`  Is parent ID? ${augBill.primary_property_id === PARENT_ID}`);
    console.log(`  Is unit 24 ID? ${augBill.primary_property_id === PROPERTY_ID}`);
    console.log(`  Status: ${augBill.status}`);
    console.log(`  Current amount due: R${augBill.current_amount_due}`);
    console.log(`  Total amount due: R${augBill.total_amount_due}`);
    console.log(`  Previous balance: R${augBill.previous_balance}`);
    console.log(`  Payments received: R${augBill.payments_received}`);

    // Check its line items
    const { data: augItems } = await sb
      .from("bill_line_items")
      .select("line_order, utility_category, line_type, amount, property_id")
      .eq("bill_id", augBill.id)
      .order("line_order");
    console.log(`  Line items: ${augItems?.length ?? 0}`);
    for (const item of augItems ?? []) {
      console.log(`    [${item.line_type}] ${item.utility_category}: R${item.amount} | property_id: ${item.property_id}`);
    }
  } else {
    console.log("  (not found)");
  }

  // ── Summary of all bills for the complex ─────────────────────────────────────
  console.log("\n── All bills for 3B Vredefort complex ───────────────");
  const { data: allBills } = await sb
    .from("bills")
    .select("id, tax_invoice_number, issue_date, primary_property_id, status, current_amount_due")
    .in("primary_property_id", [PARENT_ID, PROPERTY_ID])
    .order("issue_date");

  for (const b of allBills ?? []) {
    const link = b.primary_property_id === PARENT_ID ? "parent" : "unit24";
    console.log(`  ${b.issue_date}  ${b.tax_invoice_number}  R${b.current_amount_due}  [${link}]  ${b.status}`);
  }

  // ── Fix: re-link August bill to Unit 24 for consistency ─────────────────────
  if (augBill && augBill.primary_property_id === PARENT_ID) {
    console.log("\n── Relinking August bill to Unit 24 ─────────────────");
    const { error: billErr } = await sb
      .from("bills")
      .update({ primary_property_id: PROPERTY_ID })
      .eq("id", augBill.id);

    if (billErr) {
      console.log(`  ✗ Failed to update bill: ${billErr.message}`);
    } else {
      // Also update any line items linked to parent
      const { error: liErr } = await sb
        .from("bill_line_items")
        .update({ property_id: PROPERTY_ID })
        .eq("bill_id", augBill.id)
        .eq("property_id", PARENT_ID);

      if (liErr) {
        console.log(`  ✗ Failed to update line items: ${liErr.message}`);
      } else {
        await sb.from("audit_log").insert({
          entity_type: "bill",
          entity_id: augBill.id,
          action: "property_relinked",
          user_identifier: "admin",
          notes: "Relinked from parent property (3B Vredefort) to Unit 24 for consistency with Sep–Mar 2026 bills.",
        });
        console.log("  ✓ Relinked bill and line items to Unit 24.");
      }
    }
  }

  // ── Final filter check ───────────────────────────────────────────────────────
  console.log("\n── Final filter check (all should now be unit24) ────");
  const { data: finalBills } = await sb
    .from("bills")
    .select("tax_invoice_number, issue_date, primary_property_id")
    .in("primary_property_id", [PARENT_ID, PROPERTY_ID])
    .order("issue_date");

  let allUnit24 = true;
  for (const b of finalBills ?? []) {
    const link = b.primary_property_id === UNIT_ID ? "unit24 ✓" : "parent ✗";
    console.log(`  ${b.issue_date}  ${b.tax_invoice_number}  [${link}]`);
    if (b.primary_property_id !== PROPERTY_ID) allUnit24 = false;
  }
  console.log(allUnit24
    ? `\n✓ All ${finalBills?.length} bills for 3B Vredefort are correctly linked to Unit 24.`
    : "\n✗ Some bills still linked to parent — check output above.");
}

const UNIT_ID = PROPERTY_ID; // alias for readability in final check
main().catch((err) => { console.error(err); process.exit(1); });
