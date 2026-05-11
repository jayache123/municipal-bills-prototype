import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local", override: true });

import { readFileSync, existsSync } from "node:fs";
import { resolve, basename } from "node:path";
import { getSupabaseServiceClient } from "../src/lib/supabase/server";
import { matchExtractedBill, type PropertyDecision } from "../src/lib/billing/match";
import type {
  ExtractedProperty,
  ExtractionResult,
} from "../src/lib/anthropic/extraction-schema";

const jsonPathArg = process.argv[2];
if (!jsonPathArg) {
  console.error("Usage: npm run test:matching -- <path-to-extraction-json>");
  console.error("");
  console.error("Hint: the extraction JSONs from `npm run test:extraction` live in tmp/.");
  process.exit(1);
}

const jsonPath = resolve(jsonPathArg);
if (!existsSync(jsonPath)) {
  console.error(`✗ File not found: ${jsonPath}`);
  process.exit(1);
}

function formatExtracted(p: ExtractedProperty): string {
  const parts = [
    p.complex_name,
    p.unit_number ? `Unit ${p.unit_number}` : null,
    p.address,
    p.suburb,
    p.erf_number ? `Erf ${p.erf_number}` : null,
  ];
  return parts.filter(Boolean).join(", ") || "(unknown)";
}

function formatDb(p: NonNullable<PropertyDecision["matched_db_property"]>): string {
  const parts = [
    p.complex_name,
    p.unit_number ? `Unit ${p.unit_number}` : null,
    p.address,
    p.suburb,
    p.erf_number ? `Erf ${p.erf_number}` : null,
  ];
  return parts.filter(Boolean).join(", ") || "(unknown)";
}

async function main(): Promise<void> {
  const extraction = JSON.parse(readFileSync(jsonPath, "utf-8")) as ExtractionResult;
  console.log(`→ Loaded extraction from ${basename(jsonPath)}`);

  const supabase = getSupabaseServiceClient();
  const result = await matchExtractedBill(supabase, extraction);

  console.log(`\n--- MUNICIPALITY ---`);
  if (result.municipality.matched) {
    console.log(`  ✓ Matched: ${result.municipality.name} [${result.municipality.id}]`);
  } else {
    console.log(`  ✗ Needs create: ${result.municipality.name}`);
  }

  console.log(`\n--- BILLING ACCOUNT ---`);
  if (result.billing_account.matched) {
    console.log(`  ✓ Matched: ${result.billing_account.account_number} [${result.billing_account.id}]`);
  } else {
    console.log(`  ✗ Needs create: ${result.billing_account.account_number}`);
  }
  console.log(`    customer:  ${result.billing_account.customer_name ?? "(none)"}`);
  console.log(`    BP number: ${result.billing_account.business_partner_number ?? "(none)"}`);

  console.log(`\n--- PRIMARY PROPERTY ---`);
  if (!result.primary_property) {
    console.log(`  (none in extraction)`);
  } else if (result.primary_property.matched) {
    console.log(`  ✓ Matched: ${formatDb(result.primary_property.matched_db_property!)}`);
    console.log(`           [${result.primary_property.id}]`);
    for (const w of result.primary_property.warnings) console.log(`    ⚠ ${w}`);
  } else {
    console.log(`  ✗ Needs create: ${formatExtracted(result.primary_property.extracted)}`);
  }

  // Group line-item property decisions by identity for clean output
  const byKey = new Map<
    string,
    { decision: PropertyDecision; lineOrders: number[] }
  >();
  for (const lip of result.line_item_properties) {
    const key = lip.decision.matched
      ? `id:${lip.decision.id}`
      : `new:${formatExtracted(lip.decision.extracted)}`;
    const entry = byKey.get(key);
    if (entry) entry.lineOrders.push(lip.line_order);
    else byKey.set(key, { decision: lip.decision, lineOrders: [lip.line_order] });
  }

  console.log(
    `\n--- LINE ITEM PROPERTIES (${result.line_item_properties.length} lines, ${byKey.size} distinct) ---`,
  );
  for (const { decision, lineOrders } of byKey.values()) {
    const linesLabel = lineOrders.length > 1
      ? `${lineOrders.length} lines (${lineOrders.slice(0, 6).join(", ")}${lineOrders.length > 6 ? "..." : ""})`
      : `line ${lineOrders[0]}`;
    if (decision.matched) {
      console.log(`  ✓ ${linesLabel}: ${formatDb(decision.matched_db_property!)} [${decision.id}]`);
    } else {
      console.log(`  ✗ ${linesLabel}: needs create — ${formatExtracted(decision.extracted)}`);
    }
    for (const w of decision.warnings) console.log(`      ⚠ ${w}`);
  }
}

main().catch((err) => {
  console.error("✗", err instanceof Error ? err.message : String(err));
  if (err instanceof Error && err.stack) console.error(err.stack);
  process.exit(1);
});
