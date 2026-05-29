/**
 * test-markitdown-comparison.ts
 *
 * Compares two extraction flows on the same municipal bill PDFs:
 *   Flow A — PDF sent directly to Claude (current production approach)
 *   Flow B — PDF converted to text via markitdown first, then sent to Claude
 *
 * Measures: wall-clock time, input tokens, output tokens, estimated cost.
 *
 * Run with:
 *   npx tsx --env-file=.env.local scripts/test-markitdown-comparison.ts
 */

import Anthropic from "@anthropic-ai/sdk";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

// dotenv doesn't auto-load in tsx scripts — read the key directly
const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set — run with --env-file=.env.local");

const client = new Anthropic({ apiKey });

const MODEL = "claude-sonnet-4-6";

// Pricing (USD per million tokens) — Claude Sonnet 4.6
const PRICE_INPUT_PER_M  = 3.00;
const PRICE_OUTPUT_PER_M = 15.00;

const EXTRACTION_PROMPT = `
Extract all line items from this municipal utility bill.

For the bill header return:
- tax_invoice_number
- account_number
- current_amount_due (the current-period charge only, not the running total)
- total_amount_due
- due_date

For each line item return:
- category: one of rates | electricity | water | refuse | sewerage | improvement_district | sundry
- description
- amount (numeric)
- vat_applicable (true if marked & on the bill, false if marked # or unmarked)
- reading_type: actual | estimated | not_applicable
- usage_value (numeric, null if none)
- usage_unit (kWh / kl / null)
- unit_number (null unless this line belongs to a specific unit in a multi-unit bill)

Return ONLY valid JSON — no commentary, no markdown fences.
`.trim();

// ── Test PDFs ─────────────────────────────────────────────────────────────────

const PDF_DIR = path.join(process.cwd(), "example_rates");

const TEST_PDFS = [
  {
    label: "19 Atholl — Feb 2026 (single property, full suite)",
    file: "19 Atholl Road Rates - February 2026.pdf",
  },
  {
    label: "Rockaways — Jan 2026 (multi-unit, 3 units)",
    file: "Rockaways Rates January 2026.PDF",
  },
  {
    label: "3B Vredefort Unit 24 — Aug 2025 (tiers + reversal)",
    file: "3B Vredefort Unit 24 - August 2025 Rates Account.pdf",
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function costUSD(inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens  / 1_000_000) * PRICE_INPUT_PER_M +
    (outputTokens / 1_000_000) * PRICE_OUTPUT_PER_M
  );
}

function pad(s: string, n: number) {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

// ── Flow A: direct PDF ────────────────────────────────────────────────────────

async function flowA(pdfPath: string) {
  const pdfBytes = fs.readFileSync(pdfPath);
  const b64 = pdfBytes.toString("base64");

  const start = Date.now();

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: b64 },
          },
          { type: "text", text: EXTRACTION_PROMPT },
        ],
      },
    ],
  });

  const elapsed = Date.now() - start;
  const text = response.content[0].type === "text" ? response.content[0].text : "";

  return {
    elapsed_ms: elapsed,
    input_tokens:  response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
    output_chars: text.length,
    valid_json: isValidJSON(text),
  };
}

// ── Flow B: markitdown → text ─────────────────────────────────────────────────

async function flowB(pdfPath: string) {
  // Step 1: convert PDF to text (not timed — this is pre-processing)
  const mdText = execSync(
    `/Users/jayache/.local/bin/markitdown "${pdfPath}"`
  ).toString();

  const start = Date.now();

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: `${EXTRACTION_PROMPT}\n\nBill text extracted from PDF:\n\n${mdText}`,
      },
    ],
  });

  const elapsed = Date.now() - start;
  const text = response.content[0].type === "text" ? response.content[0].text : "";

  return {
    elapsed_ms:      elapsed,
    input_tokens:    response.usage.input_tokens,
    output_tokens:   response.usage.output_tokens,
    output_chars:    text.length,
    valid_json:      isValidJSON(text),
    markitdown_chars: mdText.length,
  };
}

function isValidJSON(s: string): boolean {
  try {
    // strip any markdown fences Claude might add
    const clean = s.replace(/^```[a-z]*\n?/m, "").replace(/```$/m, "").trim();
    JSON.parse(clean);
    return true;
  } catch {
    return false;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${"=".repeat(72)}`);
  console.log("  markitdown vs Direct PDF — Extraction Comparison");
  console.log(`  Model: ${MODEL}`);
  console.log(`${"=".repeat(72)}\n`);

  const results: Array<{
    label: string;
    a: Awaited<ReturnType<typeof flowA>>;
    b: Awaited<ReturnType<typeof flowB>>;
  }> = [];

  for (const pdf of TEST_PDFS) {
    const pdfPath = path.join(PDF_DIR, pdf.file);
    console.log(`\n── ${pdf.label}`);
    console.log(`   File: ${pdf.file}`);
    console.log(`   Size: ${(fs.statSync(pdfPath).size / 1024).toFixed(0)} KB`);

    console.log("   Running Flow A (direct PDF)...");
    const a = await flowA(pdfPath);
    console.log(`     → ${a.elapsed_ms}ms | in:${a.input_tokens} out:${a.output_tokens} | JSON:${a.valid_json}`);

    // Small delay between calls
    await new Promise((r) => setTimeout(r, 1000));

    console.log("   Running Flow B (markitdown → text)...");
    const b = await flowB(pdfPath);
    console.log(`     → ${b.elapsed_ms}ms | in:${b.input_tokens} out:${b.output_tokens} | JSON:${b.valid_json}`);

    results.push({ label: pdf.label, a, b });

    await new Promise((r) => setTimeout(r, 1000));
  }

  // ── Summary table ───────────────────────────────────────────────────────────

  console.log(`\n\n${"=".repeat(72)}`);
  console.log("  RESULTS SUMMARY");
  console.log(`${"=".repeat(72)}\n`);

  for (const { label, a, b } of results) {
    const tokenDiff    = a.input_tokens - b.input_tokens;
    const tokenPct     = ((tokenDiff / a.input_tokens) * 100).toFixed(0);
    const speedDiff    = a.elapsed_ms  - b.elapsed_ms;
    const costA        = costUSD(a.input_tokens, a.output_tokens);
    const costB        = costUSD(b.input_tokens, b.output_tokens);
    const costSaving   = costA - costB;

    console.log(`📄 ${label}`);
    console.log(`   ${"─".repeat(60)}`);
    console.log(`   ${pad("", 26)} ${pad("Flow A (PDF)", 18)} ${pad("Flow B (markitdown)", 20)}`);
    console.log(`   ${pad("Time (ms)",         26)} ${pad(String(a.elapsed_ms),       18)} ${String(b.elapsed_ms)}`);
    console.log(`   ${pad("Input tokens",      26)} ${pad(String(a.input_tokens),     18)} ${String(b.input_tokens)}`);
    console.log(`   ${pad("Output tokens",     26)} ${pad(String(a.output_tokens),    18)} ${String(b.output_tokens)}`);
    console.log(`   ${pad("Est. cost (USD)",   26)} ${pad("$" + costA.toFixed(5),     18)} $${costB.toFixed(5)}`);
    console.log(`   ${pad("Valid JSON output", 26)} ${pad(String(a.valid_json),       18)} ${String(b.valid_json)}`);
    console.log(`   ${"─".repeat(60)}`);
    console.log(`   Token difference:   Flow A uses ${tokenDiff > 0 ? "+" : ""}${tokenDiff} tokens (${tokenPct}%) ${tokenDiff > 0 ? "MORE" : "FEWER"} than Flow B`);
    console.log(`   Speed difference:   Flow A is ${Math.abs(speedDiff)}ms ${speedDiff > 0 ? "SLOWER" : "FASTER"} than Flow B`);
    console.log(`   Cost saving (B→A):  $${costSaving.toFixed(5)} per bill`);
    console.log();
  }

  // ── Aggregate ───────────────────────────────────────────────────────────────

  const totA = results.reduce((s, r) => ({
    tokens: s.tokens + r.a.input_tokens + r.a.output_tokens,
    cost:   s.cost   + costUSD(r.a.input_tokens, r.a.output_tokens),
    ms:     s.ms     + r.a.elapsed_ms,
  }), { tokens: 0, cost: 0, ms: 0 });

  const totB = results.reduce((s, r) => ({
    tokens: s.tokens + r.b.input_tokens + r.b.output_tokens,
    cost:   s.cost   + costUSD(r.b.input_tokens, r.b.output_tokens),
    ms:     s.ms     + r.b.elapsed_ms,
  }), { tokens: 0, cost: 0, ms: 0 });

  console.log(`${"=".repeat(72)}`);
  console.log("  AGGREGATE (3 bills)");
  console.log(`${"=".repeat(72)}`);
  console.log(`   ${pad("",               26)} ${pad("Flow A",  18)} Flow B`);
  console.log(`   ${pad("Total tokens",   26)} ${pad(String(totA.tokens), 18)} ${totB.tokens}`);
  console.log(`   ${pad("Total cost",     26)} ${pad("$" + totA.cost.toFixed(4), 18)} $${totB.cost.toFixed(4)}`);
  console.log(`   ${pad("Total time (ms)",26)} ${pad(String(totA.ms),  18)} ${totB.ms}`);
  console.log(`\n   At 1,000 bills/month:`);
  console.log(`   Flow A cost: $${(totA.cost / 3 * 1000).toFixed(2)}/month`);
  console.log(`   Flow B cost: $${(totB.cost / 3 * 1000).toFixed(2)}/month`);
  console.log(`   Saving:      $${((totA.cost - totB.cost) / 3 * 1000).toFixed(2)}/month`);
  console.log(`${"=".repeat(72)}\n`);
}

main().catch(console.error);
