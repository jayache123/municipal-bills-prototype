/**
 * Backfill ai_summary for bills that have none.
 * Reads structured bill + line-item data from the DB and asks Claude to
 * generate 2-5 analytical reviewer bullets — same criteria as the original
 * extraction prompt (unusual periods, estimate reversals, reading offsets, anomalies).
 *
 * Run with:  npx tsx --env-file=.env.local scripts/backfill-ai-summary.ts
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local", override: true });

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

async function main() {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

  // ── Fetch bills that need summaries ──────────────────────────────────────────

  const { data: bills, error } = await supabase
    .from("bills")
    .select(`
      id, raw_pdf_filename,
      billing_period_start, billing_period_end,
      issue_date, due_date,
      total_amount_due, total_vat,
      previous_balance, payments_received, current_amount_due,
      tax_invoice_number,
      billing_accounts ( account_number, customer_name, municipalities ( name ) ),
      primary_property:properties!primary_property_id (
        address, complex_name, unit_number, suburb, erf_number
      )
    `)
    .or("ai_summary.is.null,ai_summary.eq.{}")
    .order("issue_date");

  if (error) { console.error("Failed to fetch bills:", error.message); process.exit(1); }
  console.log(`Found ${bills!.length} bill(s) needing ai_summary backfill.\n`);

  if (bills!.length === 0) { console.log("Nothing to do."); return; }

  // ── Fetch line items for all those bills ────────────────────────────────────

  const billIds = (bills as any[]).map((b: any) => b.id);
  const { data: allItems } = await supabase
    .from("bill_line_items")
    .select("bill_id, line_order, utility_category, line_type, description, amount, period_start, period_end, usage_value, usage_unit, reading_type, notes, properties(unit_number)")
    .in("bill_id", billIds)
    .order("line_order");

  const itemsByBill = new Map<string, any[]>();
  for (const item of (allItems ?? []) as any[]) {
    const arr = itemsByBill.get(item.bill_id) ?? [];
    arr.push(item);
    itemsByBill.set(item.bill_id, arr);
  }

  // ── Build text context for each bill ─────────────────────────────────────────

  function buildContext(bill: any, items: any[]): string {
    const a = bill.billing_accounts;
    const p = bill.primary_property;
    const lines: string[] = [
      `FILE: ${bill.raw_pdf_filename}`,
      `Municipality: ${a?.municipalities?.name ?? "unknown"}`,
      `Account: ${a?.account_number} / ${a?.customer_name}`,
      `Property: ${[p?.complex_name, p?.address, p?.suburb].filter(Boolean).join(", ")}`,
      p?.erf_number  ? `Erf: ${p.erf_number}`   : "",
      p?.unit_number ? `Unit: ${p.unit_number}` : "",
      `Invoice: ${bill.tax_invoice_number}`,
      `Billing period: ${bill.billing_period_start} → ${bill.billing_period_end}`,
      `Issue date: ${bill.issue_date}  |  Due date: ${bill.due_date}`,
      `Previous balance: R${bill.previous_balance}  |  Payments received: R${bill.payments_received}`,
      `Current amount due: R${bill.current_amount_due}  |  VAT: R${bill.total_vat}  |  Total: R${bill.total_amount_due}`,
      "",
      "LINE ITEMS:",
    ];
    for (const item of items) {
      if (item.line_type === "informational") continue;
      const unit    = item.properties?.unit_number ? ` (Unit ${item.properties.unit_number})` : "";
      const period  = item.period_start ? ` | ${item.period_start} → ${item.period_end}` : "";
      const days    = item.period_start && item.period_end
        ? ` (${Math.round((new Date(item.period_end).getTime() - new Date(item.period_start).getTime()) / 86_400_000) + 1}d)`
        : "";
      const usage   = item.usage_value != null ? ` | ${item.usage_value} ${item.usage_unit}` : "";
      const reading = item.reading_type && item.reading_type !== "not_applicable" ? ` | reading:${item.reading_type}` : "";
      const amt     = item.amount != null ? ` | R${item.amount}` : "";
      lines.push(
        `  [${item.line_type}] ${item.utility_category}${unit}${amt}${period}${days}${usage}${reading}`
      );
      if (item.notes)       lines.push(`    notes: ${item.notes}`);
      if (item.description) lines.push(`    desc:  ${item.description}`);
    }
    return lines.filter(l => l !== "").join("\n");
  }

  // ── Generate summaries one by one ───────────────────────────────────────────

  for (const bill of bills as any[]) {
    const items   = itemsByBill.get(bill.id) ?? [];
    const context = buildContext(bill, items);

    console.log(`Generating summary for: ${bill.raw_pdf_filename}...`);

    const response = await anthropic.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 1024,
      system: `You are a reviewer analyst for a South African property management company.
You will be given structured data extracted from a municipal bill.
Generate 2–5 concise analytical bullet points for a human reviewer. Each bullet must be a complete sentence.

Focus on:
- Unusual billing periods (very long/short, or where a utility period differs significantly from the rates period)
- Estimate reversals: what was reversed, net consumption, rand impact
- Meter reading periods that fall in a prior month (e.g. "Water reading covers Feb–Mar, reflected in this April bill")
- Any charge that looks anomalous or noteworthy
- Multi-unit bills: note the unit split and confirm all units seem expected
- Previous balance and payment status

Do NOT simply restate the line item totals. Focus on things a reviewer should specifically pay attention to.
If the bill is straightforward, 2 short bullets confirming it is fine.

Respond with ONLY a JSON array of strings, e.g.: ["Bullet one.", "Bullet two."]
Do not include any prose outside the JSON array.`,
      messages: [{ role: "user", content: context }],
    });

    const raw = (response.content[0] as any).text.trim();

    let bullets: string[];
    try {
      const json = raw.replace(/^```json?\s*/i, "").replace(/\s*```$/, "").trim();
      bullets = JSON.parse(json);
      if (!Array.isArray(bullets) || !bullets.every(b => typeof b === "string")) {
        throw new Error("Not a string array");
      }
    } catch {
      console.error(`  ✗ Failed to parse response for ${bill.raw_pdf_filename}:\n`, raw);
      continue;
    }

    const { error: updateError } = await supabase
      .from("bills")
      .update({ ai_summary: bullets })
      .eq("id", bill.id);

    if (updateError) {
      console.error(`  ✗ DB update failed:`, updateError.message);
    } else {
      console.log(`  ✓ ${bullets.length} bullets saved`);
      for (const b of bullets) console.log(`    • ${b}`);
    }
    console.log();
  }

  console.log("Done.");
}

main().catch((err) => { console.error(err); process.exit(1); });
