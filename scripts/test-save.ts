import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local", override: true });

import { readFileSync, existsSync } from "node:fs";
import { resolve, basename } from "node:path";
import { getSupabaseServiceClient } from "../src/lib/supabase/server";
import { uploadBillPdf } from "../src/lib/supabase/storage";
import { matchExtractedBill } from "../src/lib/billing/match";
import { saveExtractedBill } from "../src/lib/billing/save";
import { validateBill } from "../src/lib/billing/validate";
import type { ExtractionResult } from "../src/lib/anthropic/extraction-schema";

const args = process.argv.slice(2);
const force = args.includes("--force");
const pdfPathArg = args.find((a) => !a.startsWith("--"));

if (!pdfPathArg) {
  console.error("Usage: npm run test:save -- <path-to-pdf> [--force]");
  console.error("");
  console.error("Expects an extraction JSON in tmp/extraction-<filename>.json.");
  console.error("Run `npm run test:extraction -- <pdf>` first if missing.");
  console.error("");
  console.error("--force  delete and re-insert if a bill with the same tax_invoice_number exists");
  process.exit(1);
}

const pdfPath = resolve(pdfPathArg);
if (!existsSync(pdfPath)) {
  console.error(`✗ PDF not found: ${pdfPath}`);
  process.exit(1);
}

const fileBase = basename(pdfPath).replace(/\.(pdf|PDF)$/, "");
const jsonPath = resolve("tmp", `extraction-${fileBase}.json`);
if (!existsSync(jsonPath)) {
  console.error(`✗ Extraction JSON not found at: ${jsonPath}`);
  console.error("  Run `npm run test:extraction -- '" + pdfPathArg + "'` first.");
  process.exit(1);
}

async function readModelFromSettings(): Promise<string> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "anthropic_model")
    .single();
  if (error) return "claude-sonnet-4-6";
  return data.value;
}

async function main(): Promise<void> {
  console.log(`→ Loading extraction JSON: ${basename(jsonPath)}`);
  const extraction = JSON.parse(readFileSync(jsonPath, "utf-8")) as ExtractionResult;

  if (extraction.document_type !== "municipal_bill" || !extraction.bill) {
    console.error(`✗ Extraction is not a municipal bill (document_type=${extraction.document_type}). Aborting.`);
    process.exit(1);
  }

  console.log(`→ Uploading PDF to Storage...`);
  const pdfBuffer = readFileSync(pdfPath);
  const upload = await uploadBillPdf({ fileBuffer: pdfBuffer, filename: basename(pdfPath) });
  console.log(`  ✓ ${upload.bucket}/${upload.storagePath}`);

  const supabase = getSupabaseServiceClient();

  console.log(`→ Running match...`);
  const match = await matchExtractedBill(supabase, extraction);
  console.log(
    `  municipality: ${match.municipality.matched ? "matched" : "needs create"}, ` +
    `account: ${match.billing_account.matched ? "matched" : "needs create"}, ` +
    `primary: ${match.primary_property?.matched ? "matched" : match.primary_property ? "needs create" : "n/a"}, ` +
    `line-item props: ${match.line_item_properties.length} (${match.line_item_properties.filter((l) => !l.decision.matched).length} need create)`,
  );

  console.log(`→ Saving to Supabase${force ? " (force mode)" : ""}...`);
  const model = await readModelFromSettings();
  const result = await saveExtractedBill(supabase, {
    extraction,
    match,
    rawPdfUrl: `${upload.bucket}/${upload.storagePath}`,
    rawPdfFilename: upload.originalFilename,
    extractionModel: model,
    force,
  });

  if (result.was_already_saved) {
    console.log(`\n⚠ A bill with this tax_invoice_number already exists.`);
    console.log(`   bill_id: ${result.bill_id}`);
    console.log(`   Use --force to delete and re-insert.`);
    return;
  }

  console.log(`\n✓ Saved successfully.`);
  console.log(`   bill_id:             ${result.bill_id}`);
  console.log(`   municipality created: ${result.entities_created.municipality}`);
  console.log(`   billing acct created: ${result.entities_created.billing_account}`);
  console.log(`   properties created:   ${result.entities_created.properties}`);
  console.log(`   line items inserted:  ${result.line_items_inserted}`);
  console.log(`   match warnings:       ${result.warnings_inserted}`);

  console.log(`\n→ Running hard checks...`);
  const validation = await validateBill(supabase, {
    bill_id: result.bill_id,
    bill: extraction.bill,
    source_type: extraction.source_type,
  });

  console.log(`✓ Validation complete.`);
  console.log(`   critical failures:  ${validation.failed_critical}`);
  console.log(`   warning failures:   ${validation.failed_warning}`);
  console.log(`   info failures:      ${validation.failed_info}`);
  console.log(`   errors persisted:   ${validation.errors_inserted}`);
  console.log(`   final status:       ${validation.status.toUpperCase()}`);

  const failed = validation.results.filter((r) => !r.passed);
  if (failed.length > 0) {
    console.log(`\n--- Failed checks ---`);
    for (const r of failed) {
      const lineRef = r.line_order !== undefined ? ` [line ${r.line_order}]` : "";
      console.log(`  [${r.severity.padEnd(8)}] ${r.rule_name}${lineRef}: ${r.message}`);
    }
  }
}

main().catch((err) => {
  console.error("\n✗ Save failed:", err instanceof Error ? err.message : String(err));
  if (err instanceof Error && err.stack) console.error(err.stack);
  process.exit(1);
});
