import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local", override: true });

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, basename } from "node:path";
import { createClient } from "@supabase/supabase-js";

import { extractBill } from "../src/lib/anthropic/extract";
import type { ExtractionResult, ExtractedLineItem } from "../src/lib/anthropic/extraction-schema";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!ANTHROPIC_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("✗ Missing required env vars (ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)");
  process.exit(1);
}

const pdfPathArg = process.argv[2];
if (!pdfPathArg) {
  console.error("Usage: npm run test:extraction -- <path-to-pdf>");
  process.exit(1);
}

const pdfPath = resolve(pdfPathArg);
if (!existsSync(pdfPath)) {
  console.error(`✗ File not found: ${pdfPath}`);
  process.exit(1);
}

async function readModelFromSettings(): Promise<string> {
  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
  const { data, error } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "anthropic_model")
    .single();
  if (error) {
    console.warn(`⚠ Could not read anthropic_model from settings: ${error.message}. Falling back to claude-sonnet-4-6.`);
    return "claude-sonnet-4-6";
  }
  return data.value;
}

function formatRand(n: number | null): string {
  if (n === null || n === undefined) return "—";
  return `R ${n.toFixed(2)}`;
}

function summarize(result: ExtractionResult): void {
  console.log(`\n--- DOCUMENT TYPE: ${result.document_type} (${result.source_type}) ---`);
  if (result.document_type === "not_a_bill") {
    console.log(`Rejected. Reason: ${result.rejection_reason ?? "(none given)"}`);
    return;
  }
  const bill = result.bill;
  if (!bill) {
    console.log("⚠ document_type says municipal_bill but bill field is null.");
    return;
  }

  console.log(`Municipality:        ${bill.municipality_name ?? "—"}`);
  console.log(`Account:             ${bill.account_number ?? "—"}`);
  console.log(`Customer:            ${bill.customer_name ?? "—"}`);
  console.log(`Tax invoice:         ${bill.tax_invoice_number ?? "—"}`);
  console.log(`Primary property:    ${formatProperty(bill.primary_property)}`);
  console.log(`Statement period:    ${bill.billing_period_start ?? "—"} → ${bill.billing_period_end ?? "—"}`);
  console.log(`Due date:            ${bill.due_date ?? "—"}`);
  console.log(`Previous balance:    ${formatRand(bill.previous_balance)}`);
  console.log(`Payments received:   ${formatRand(bill.payments_received)}`);
  console.log(`Current amount due:  ${formatRand(bill.current_amount_due)}`);
  console.log(`Total amount due:    ${formatRand(bill.total_amount_due)}`);
  console.log(`Amount after credits:${formatRand(bill.amount_payable_after_credits)}`);
  console.log(`Total VAT:           ${formatRand(bill.total_vat)}`);
  console.log(`Overall confidence:  ${bill.overall_confidence}/100`);

  console.log(`\n--- LINE ITEMS (${bill.line_items.length}) ---`);
  const grouped = groupBySection(bill.line_items);
  for (const [section, items] of grouped) {
    const sectionTotal = items
      .filter((i) => i.line_type !== "informational" && i.line_type !== "subtotal" && i.amount !== null)
      .reduce((sum, i) => sum + (i.amount ?? 0), 0);
    console.log(`\n  [${section}]   sum of charges: ${formatRand(sectionTotal)}`);
    for (const item of items) {
      const tier = item.tariff_tier ? ` t${item.tariff_tier}` : "";
      const usage = item.usage_value !== null ? ` ${item.usage_value} ${item.usage_unit ?? ""}` : "";
      const period = item.period_start ? ` [${item.period_start}→${item.period_end ?? "?"}]` : "";
      const unit = item.property?.unit_number ? ` (Unit ${item.property.unit_number})` : "";
      console.log(
        `    ${String(item.line_order).padStart(3)}. ${item.line_type.padEnd(20)} ` +
        `${formatRand(item.amount).padStart(12)}  ${(item.description ?? "").slice(0, 50)}${tier}${usage}${period}${unit} [conf ${item.confidence}]`,
      );
    }
  }

  runHardChecks(bill);
}

function groupBySection(items: ExtractedLineItem[]): Map<string, ExtractedLineItem[]> {
  const grouped = new Map<string, ExtractedLineItem[]>();
  for (const item of items) {
    const key = item.section_label ?? "(no section)";
    const list = grouped.get(key) ?? [];
    list.push(item);
    grouped.set(key, list);
  }
  return grouped;
}

function formatProperty(p: { address: string | null; unit_number: string | null; erf_number: string | null } | null): string {
  if (!p) return "—";
  const parts = [p.address, p.unit_number ? `Unit ${p.unit_number}` : null, p.erf_number ? `Erf ${p.erf_number}` : null];
  return parts.filter(Boolean).join(", ") || "—";
}

function runHardChecks(bill: NonNullable<ExtractionResult["bill"]>): void {
  console.log(`\n--- HARD CHECKS ---`);
  const issues: string[] = [];

  // 1. Sum of charge lines (pre-VAT) + total_vat ≈ current_amount_due
  if (bill.current_amount_due !== null) {
    const chargeLines = bill.line_items.filter(
      (i) => i.line_type !== "informational" && i.line_type !== "subtotal" && i.amount !== null,
    );
    const sum = chargeLines.reduce((acc, i) => acc + (i.amount ?? 0), 0);
    const expected = sum + (bill.total_vat ?? 0);
    const diff = Math.abs(expected - bill.current_amount_due);
    const tag = diff < 0.1 ? "✓" : "✗";
    const verdict = diff < 0.1
      ? "ok"
      : `MISMATCH (pre-VAT sum R${sum.toFixed(2)} + VAT R${(bill.total_vat ?? 0).toFixed(2)} = R${expected.toFixed(2)}, current_amount_due R${bill.current_amount_due.toFixed(2)}, diff R${diff.toFixed(2)})`;
    console.log(`  ${tag} (sum of lines + total_vat) = current_amount_due: ${verdict}`);
    if (diff >= 0.1) issues.push("line item sum mismatch");
  }

  // 1b. total_vat ≈ sum of (line amount × vat_rate / 100) over VAT-rated lines
  if (bill.total_vat !== null) {
    const vatableLines = bill.line_items.filter(
      (i) =>
        i.line_type !== "informational" &&
        i.line_type !== "subtotal" &&
        i.amount !== null &&
        i.vat_rate !== null &&
        i.vat_rate > 0,
    );
    const computedVat = vatableLines.reduce(
      (acc, i) => acc + (i.amount ?? 0) * ((i.vat_rate ?? 0) / 100),
      0,
    );
    const diff = Math.abs(computedVat - bill.total_vat);
    const tag = diff < 0.5 ? "✓" : "✗";
    const verdict = diff < 0.5
      ? `ok (computed R${computedVat.toFixed(2)} vs reported R${bill.total_vat.toFixed(2)})`
      : `MISMATCH (computed R${computedVat.toFixed(2)}, reported R${bill.total_vat.toFixed(2)}, diff R${diff.toFixed(2)})`;
    console.log(`  ${tag} total_vat = sum of per-line VAT: ${verdict}`);
    if (diff >= 0.5) issues.push("total VAT mismatch");
  }

  // 2. previous_balance - payments_received + current_amount_due ≈ total_amount_due
  if (
    bill.previous_balance !== null &&
    bill.payments_received !== null &&
    bill.current_amount_due !== null &&
    bill.total_amount_due !== null
  ) {
    const expected = bill.previous_balance - bill.payments_received + bill.current_amount_due;
    const diff = Math.abs(expected - bill.total_amount_due);
    const tag = diff < 0.1 ? "✓" : "✗";
    const verdict = diff < 0.1
      ? "ok"
      : `MISMATCH (expected R${expected.toFixed(2)}, got R${bill.total_amount_due.toFixed(2)}, diff R${diff.toFixed(2)})`;
    console.log(`  ${tag} prev_balance − payments + current = total: ${verdict}`);
    if (diff >= 0.1) issues.push("balance arithmetic mismatch");
  }

  // 3. Billing period sanity
  if (bill.billing_period_start && bill.billing_period_end) {
    const ok = bill.billing_period_start < bill.billing_period_end;
    console.log(`  ${ok ? "✓" : "✗"} billing_period_start < billing_period_end`);
    if (!ok) issues.push("period dates inverted");
  }

  // 4. Due date after period end
  if (bill.due_date && bill.billing_period_end) {
    const ok = bill.due_date >= bill.billing_period_end;
    console.log(`  ${ok ? "✓" : "✗"} due_date >= billing_period_end`);
    if (!ok) issues.push("due date before period end");
  }

  // 5. Meter readings: closing >= opening
  for (const item of bill.line_items) {
    if (item.opening_meter_reading !== null && item.closing_meter_reading !== null) {
      const ok = item.closing_meter_reading >= item.opening_meter_reading;
      if (!ok) {
        console.log(`  ✗ meter on line ${item.line_order}: closing (${item.closing_meter_reading}) < opening (${item.opening_meter_reading})`);
        issues.push(`meter direction reversed on line ${item.line_order}`);
      }
    }
  }

  // 6. Low-confidence fields
  const lowConfFields = Object.entries(bill.field_confidence)
    .filter(([, v]) => v < 80)
    .map(([k, v]) => `${k}=${v}`);
  if (lowConfFields.length > 0) {
    console.log(`  ⚠ low-confidence fields: ${lowConfFields.join(", ")}`);
  }
  const lowConfLines = bill.line_items.filter((l) => l.confidence < 80);
  if (lowConfLines.length > 0) {
    console.log(`  ⚠ low-confidence line items: ${lowConfLines.length}`);
  }

  console.log(`\n  Summary: ${issues.length === 0 ? "all hard checks passed ✓" : `${issues.length} issue(s) found ✗`}`);
}

async function main(): Promise<void> {
  console.log(`→ Loading PDF: ${pdfPath}`);
  const pdfBuffer = readFileSync(pdfPath);
  const pdfBase64 = pdfBuffer.toString("base64");
  console.log(`  ${(pdfBuffer.length / 1024).toFixed(1)} KB, ${pdfBase64.length} base64 chars`);

  const model = await readModelFromSettings();
  console.log(`→ Calling Anthropic with model: ${model}`);
  const start = Date.now();
  const response = await extractBill({
    apiKey: ANTHROPIC_API_KEY!,
    model,
    pdfBase64,
  });
  const elapsedMs = Date.now() - start;

  console.log(
    `  ✓ extraction returned in ${(elapsedMs / 1000).toFixed(1)}s ` +
    `(${response.usage.input_tokens} input + ${response.usage.output_tokens} output tokens)`,
  );

  // Save full JSON for inspection
  const tmpDir = resolve("tmp");
  if (!existsSync(tmpDir)) mkdirSync(tmpDir);
  const fileBase = basename(pdfPath).replace(/\.(pdf|PDF)$/, "");
  const outPath = resolve(tmpDir, `extraction-${fileBase}.json`);
  writeFileSync(outPath, JSON.stringify(response.result, null, 2));
  console.log(`  full JSON written to: ${outPath}`);

  summarize(response.result);
}

main().catch((err) => {
  console.error("\n✗ Extraction failed:", err instanceof Error ? err.message : String(err));
  if (err instanceof Error && err.stack) console.error(err.stack);
  process.exitCode = 1;
});
