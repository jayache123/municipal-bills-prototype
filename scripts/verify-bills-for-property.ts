/**
 * Verify all bills for a given property (unit or parent).
 * Checks: financial reconciliation, VAT, balance arithmetic, meter chain,
 * period ordering, line item count, and property linkage.
 *
 * Usage:
 *   PROPERTY_ID=<uuid> npx tsx --env-file=.env.local scripts/verify-bills-for-property.ts
 *
 * Or edit PROPERTY_ID below directly and run:
 *   npx tsx --env-file=.env.local scripts/verify-bills-for-property.ts
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local", override: true });
import { createClient } from "@supabase/supabase-js";

// ── Configure ────────────────────────────────────────────────────────────────
// Set via env var or hardcode for a one-off run.
const PROPERTY_ID: string = process.env.PROPERTY_ID ?? "f48dd23f-a7d1-448e-9ea4-39f8892fc3a1";

async function main() {
  const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  // Resolve property name for display
  const { data: prop } = await sb.from("properties").select("address, complex_name, unit_number, parent_property_id").eq("id", PROPERTY_ID).maybeSingle();
  const propName = [prop?.complex_name, prop?.unit_number ? `Unit ${prop.unit_number}` : null, prop?.address].filter(Boolean).join(" · ");
  console.log(`\nVerifying bills for: ${propName} (${PROPERTY_ID})\n`);

  // Include child units so running against a parent also catches unit-linked bills
  const { data: childData } = await sb.from("properties").select("id").eq("parent_property_id", PROPERTY_ID);
  const childIds = (childData ?? []).map((p: any) => p.id);
  const propertyIds = [PROPERTY_ID, ...childIds];

  // Fetch bills
  const { data: bills, error } = await sb
    .from("bills")
    .select("id, tax_invoice_number, issue_date, billing_period_start, billing_period_end, due_date, previous_balance, payments_received, current_amount_due, total_amount_due, total_vat, status, primary_property_id, billing_account_id, raw_pdf_filename")
    .in("primary_property_id", propertyIds)
    .order("issue_date");

  if (error) { console.error("Failed to fetch bills:", error.message); process.exit(1); }
  if (!bills || bills.length === 0) { console.log("No bills found for this property."); return; }
  console.log(`Found ${bills.length} bill(s).\n`);

  // Fetch all line items
  const billIds = bills.map((b: any) => b.id);
  const { data: allItems } = await sb
    .from("bill_line_items")
    .select("bill_id, line_order, utility_category, line_type, amount, vat_rate, usage_value, usage_unit, opening_meter_reading, closing_meter_reading, reading_type, property_id")
    .in("bill_id", billIds)
    .order("line_order");

  const itemsByBill = new Map<string, any[]>();
  for (const item of (allItems ?? []) as any[]) {
    const arr = itemsByBill.get(item.bill_id) ?? [];
    arr.push(item);
    itemsByBill.set(item.bill_id, arr);
  }

  // Per-bill checks
  console.log("── Per-bill checks ──────────────────────────────────");
  let prevMeterClosing: number | null = null;
  let prevInvoice: string | null = null;
  let allOk = true;

  for (const bill of bills as any[]) {
    const items = itemsByBill.get(bill.id) ?? [];
    const issues: string[] = [];

    // Financial: sum of charges + VAT = current_amount_due
    const chargeItems = items.filter((i: any) =>
      i.line_type !== "informational" && i.line_type !== "subtotal" && i.amount !== null
    );
    const sumCharges = chargeItems.reduce((acc: number, i: any) => acc + Number(i.amount), 0);
    const calcTotal = sumCharges + Number(bill.total_vat);
    const totalDiff = Math.abs(calcTotal - Number(bill.current_amount_due));
    if (totalDiff >= 0.05) {
      issues.push(`Total mismatch: charges R${sumCharges.toFixed(2)} + VAT R${bill.total_vat} = R${calcTotal.toFixed(2)}, bill says R${bill.current_amount_due} (diff R${totalDiff.toFixed(2)})`);
    }

    // Balance: prev - payments + current = total
    const balCalc = Number(bill.previous_balance) - Number(bill.payments_received) + Number(bill.current_amount_due);
    const balDiff = Math.abs(balCalc - Number(bill.total_amount_due));
    if (balDiff >= 0.05) {
      issues.push(`Balance arithmetic: R${bill.previous_balance} − R${bill.payments_received} + R${bill.current_amount_due} = R${balCalc.toFixed(2)}, total_amount_due = R${bill.total_amount_due} (diff R${balDiff.toFixed(2)})`);
    }

    // VAT consistency
    const vatItems = chargeItems.filter((i: any) => Number(i.vat_rate) > 0);
    const computedVat = vatItems.reduce((acc: number, i: any) => acc + Number(i.amount) * (Number(i.vat_rate) / 100), 0);
    const vatDiff = Math.abs(computedVat - Number(bill.total_vat));
    if (vatDiff >= 0.5) {
      issues.push(`VAT: computed R${computedVat.toFixed(2)} vs stored R${bill.total_vat} (diff R${vatDiff.toFixed(2)})`);
    }

    // Period ordering
    if (bill.billing_period_start >= bill.billing_period_end) {
      issues.push(`Period ordering: start (${bill.billing_period_start}) >= end (${bill.billing_period_end})`);
    }
    if (bill.due_date < bill.billing_period_end) {
      issues.push(`Due date (${bill.due_date}) is before period end (${bill.billing_period_end})`);
    }

    // Meter chain (uses electricity subtotal row)
    const elecSubtotal = items.find((i: any) => i.utility_category === "electricity" && i.line_type === "subtotal");
    if (elecSubtotal && elecSubtotal.opening_meter_reading !== null) {
      if (prevMeterClosing !== null && elecSubtotal.opening_meter_reading !== prevMeterClosing) {
        issues.push(`Meter gap: opening ${elecSubtotal.opening_meter_reading} ≠ prev closing ${prevMeterClosing} (${prevInvoice})`);
      }
      if (elecSubtotal.closing_meter_reading <= elecSubtotal.opening_meter_reading) {
        issues.push(`Meter direction: closing (${elecSubtotal.closing_meter_reading}) ≤ opening (${elecSubtotal.opening_meter_reading})`);
      }
      prevMeterClosing = elecSubtotal.closing_meter_reading;
      prevInvoice = bill.tax_invoice_number;
    }

    // Status
    if (!["approved", "pending_review"].includes(bill.status)) {
      issues.push(`Unexpected status: ${bill.status}`);
    }

    // No line items at all
    if (items.length === 0) issues.push("No line items found");

    const ok = issues.length === 0;
    if (!ok) allOk = false;

    const kWh = elecSubtotal?.usage_value != null ? `${elecSubtotal.usage_value} kWh` : "";
    const meter = elecSubtotal?.opening_meter_reading != null
      ? `meter ${elecSubtotal.opening_meter_reading}→${elecSubtotal.closing_meter_reading}`
      : "";
    console.log(`\n${ok ? "✓" : "✗"} ${bill.issue_date}  ${bill.tax_invoice_number}  R${Number(bill.current_amount_due).toFixed(2)}  [${bill.status}]  ${items.length} items  ${kWh}  ${meter}`);
    for (const issue of issues) console.log(`   ⚠ ${issue}`);
  }

  console.log(`\n── Result ──────────────────────────────────────────`);
  console.log(allOk
    ? `✓ All ${bills.length} bills passed every check.`
    : `✗ Issues found — see above.`
  );
}

main().catch((err) => { console.error(err); process.exit(1); });
