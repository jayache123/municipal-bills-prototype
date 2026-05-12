# Architectural Decisions

A chronological log of decisions made on this prototype. Each entry captures the *why*, not just the *what* — so a future contributor (human or AI) understands the reasoning and knows when to revisit.

**Maintenance rule:** Add a new entry every time a non-trivial decision is made. Update entries when a decision is superseded.

---

## Tech stack

### Backend language: TypeScript
**Date:** 2026-05-11
**Status:** Active

**Choice:** TypeScript (Node.js) for everything — frontend, API routes, scripts.

**Alternatives considered:** Python. Brief allowed either.

**Why:**
- One language across the stack = lower learning curve for a beginner developer
- Strong type safety matters for a financial system (catches mismatches at compile time)
- Anthropic, Supabase, and Google APIs all have first-class TypeScript SDKs
- Python's only real advantage (data libraries) doesn't apply — Anthropic does the heavy lifting

**Where:** All source code. `package.json` declares TS as primary.

**Revisit when:** If we add data-science work that Pandas/scikit-learn would dramatically simplify.

---

### Framework: Next.js (App Router)
**Date:** 2026-05-11
**Status:** Active

**Choice:** Next.js v16 with App Router, React 19, Tailwind CSS v4.

**Alternatives considered:** Pure React + separate Express/Hono backend; SvelteKit.

**Why:**
- Brief specifies React + Tailwind + Vercel. Next.js is the canonical match.
- App Router co-locates pages and API routes in one tree → simpler mental model
- Vercel deployment is one click for Next.js

**Where:** `src/app/`, `next.config.ts`, `package.json`.

**Revisit when:** Never expected — this is the standard choice.

---

### Anthropic model: claude-sonnet-4-6 (configurable)
**Date:** 2026-05-11
**Status:** Active

**Choice:** Default to `claude-sonnet-4-6`. Stored in DB `settings.anthropic_model`, not hardcoded.

**Alternatives considered:** Hardcode the model; use Opus 4.7 by default.

**Why:**
- Sonnet 4.6 is sufficient for structured extraction from PDFs (verified on 3 bills)
- ~5× cheaper than Opus per bill (cost matters at "thousands per month" volume)
- Configurable via DB so we can switch without a deploy

**Where:** `settings` table; consumed by `scripts/test-extraction.ts` and (future) the production API route.

**Revisit when:** If extraction accuracy on real-world bills drops, try Opus and compare. If a newer Sonnet ships, swap.

---

## Data model

### Multi-unit bills: introduce `billing_accounts` table
**Date:** 2026-05-11
**Status:** Active

**Choice:** A bill belongs to a `billing_account` (one per municipal account number). A `property` (unit) also belongs to a `billing_account` — one account can have multiple properties. Line items optionally reference a specific property.

**Alternatives considered:**
- **B**: Split one PDF into multiple bills (one per unit). Rejected — lies about reality, breaks "total liability per account."
- **C**: Make `property` = the Erf; units are children. Rejected — doesn't match how the user thinks about properties.

**Why:** Cape Town bills routinely cover multiple units on one Erf (e.g. Rockaways: units 68, 34, 2 on Erf 1705). Option A preserves the one-PDF-one-bill financial integrity while allowing per-unit allocation.

**Where:** [supabase/schema.sql](supabase/schema.sql) → `billing_accounts`, `properties`, `bills`.

**Revisit when:** If we add municipalities that issue truly per-unit bills.

---

### Granular line items: one row per visible sub-charge
**Date:** 2026-05-11
**Status:** Active

**Choice:** Every visible sub-charge on a bill becomes its own row in `bill_line_items` (consumption charge, fixed basic charge, rebate, reversal, etc.). Tariff tiers split into separate rows. Informational headers and subtotals captured too.

**Alternatives considered:** Store one row per utility category with a JSON breakdown of sub-charges.

**Why:**
- Self-verifying math at every level (rate × usage = amount, sum of charges + VAT = total)
- Future-proof for tariff analysis, rate-change tracking
- Aggregated views can always be derived from granular data; the reverse is impossible
- Cost is minimal (a few KB extra per bill)

**Where:** [supabase/schema.sql](supabase/schema.sql) → `bill_line_items` table; [src/lib/anthropic/extraction-prompt.ts](src/lib/anthropic/extraction-prompt.ts) Rule 1.

**Revisit when:** If extraction quality degrades because the prompt is too demanding (so far it's working well).

---

### Property matching: account-number-first
**Date:** 2026-05-11
**Status:** Active

**Choice:** Match a new bill to an existing property by `(municipality_id, account_number)` first. Within an account, match properties by `(erf_number, unit_number)`. Address/suburb/complex-name differences surface as warnings, never block the match.

**Alternatives considered:** Address-first matching with fuzzy comparison.

**Why:**
- Account numbers are stable, unique municipal identifiers — strong primary key
- Addresses on bills can have typos, abbreviations, or change wording over time
- Account-first prevents duplicate property records when the address text differs
- Warnings surface anomalies for review without breaking matching

**Where:** [src/lib/billing/match.ts](src/lib/billing/match.ts) — `matchExtractedBill` function. Identity key is `erf:X|unit:Y`.

**Revisit when:** If we encounter a municipality without stable account numbers, or if property changes hands and account is reassigned.

---

### Property identifier: `erf_number` (not `section_number`)
**Date:** 2026-05-11
**Status:** Active

**Choice:** Renamed brief's `section_number` to `erf_number` to match Cape Town's terminology. Brief's `credit_balance` split into `previous_balance` + `payments_received`.

**Alternatives considered:** Generic `parcel_id` field for cross-municipality portability.

**Why:** Cape Town bills use "Erf" specifically. Other South African municipalities may use "Stand" or "Lot" — we'll rename to a more generic field if/when those arrive. For now, honest naming.

**Where:** [supabase/schema.sql](supabase/schema.sql) → `properties` table.

**Revisit when:** Adding bills from a non-Cape-Town municipality with a different parcel identifier.

---

## Extraction pipeline

### Two-pass disagreement tolerances (configurable)
**Date:** 2026-05-11
**Status:** Active

**Choice:** When confidence is below threshold OR a critical error fires, run a second extraction pass with slightly different prompt wording. Compare passes field-by-field.
- Numeric fields: disagree if differ by more than 0.01 absolute (`two_pass_number_absolute_tolerance`) OR 0.1% relative (`two_pass_number_percent_tolerance`)
- Dates: disagree if different calendar day
- Text: disagree if different after trim + lowercase

**Why:** Two readings rarely match character-for-character even when both correct. Too strict → flag everything; too loose → silently average errors. Defaults are an industry-standard middle ground.

**Where:** `settings` table (tolerances configurable without code changes). Implementation pending — currently single-pass only.

**Revisit when:** After testing two-pass on real bills, calibrate tolerances per actual disagreement patterns.

---

### Warnings always block auto-approve (strict mode, configurable)
**Date:** 2026-05-11
**Status:** Active

**Choice:** Any unresolved warning routes a bill to human review, regardless of confidence score. Controlled by `settings.warnings_block_auto_approve = true`.

**Alternatives considered:** Lenient mode — high-confidence bills can auto-approve despite warnings.

**Why:** The brief's first principle is "be conservative." For a system that drives payments, a small false-positive rate (more bills reviewed than strictly necessary) is far cheaper than a false-negative (silently-approved outlier).

**Where:** `settings.warnings_block_auto_approve`. Routing logic pending (Step 5).

**Revisit when:** Once we have months of real review volume — if reviewers consistently approve all warning-only bills, consider loosening.

---

### Document type detection before extraction
**Date:** 2026-05-11
**Status:** Active

**Choice:** The extraction prompt first decides `document_type`: `"municipal_bill"` or `"not_a_bill"`. Non-bills (proof of payment, remittance advice, query letter) are hard-rejected with a reason; no further extraction is attempted.

**Why:** The example folder mixed bills with proof-of-payment notifications. Running extraction on a non-bill wastes tokens and produces garbage. Detection first → cheap rejection → bills only enter the pipeline.

**Where:** [src/lib/anthropic/extraction-prompt.ts](src/lib/anthropic/extraction-prompt.ts) "Document type detection" section; result in `ExtractionResult.document_type`.

**Revisit when:** If real-world false positives/negatives emerge (e.g. a query response that looks like a bill).

---

### Primary property = the property *being billed*, not the postal address
**Date:** 2026-05-11
**Status:** Active

**Choice:** The `primary_property` field on a bill comes from the "AT <property>" line under the account summary — NOT from the postal address block at the top-left.

**Why we made this explicit:** The 3B Vredefort extraction initially matched on the customer's mailing address (17 Atholl Road, Camps Bay) instead of the property being billed (3B Vredefort, Sea Point). On bills where the customer lives at the property, these coincide; when they differ, they get conflated.

**Where:** [src/lib/anthropic/extraction-prompt.ts](src/lib/anthropic/extraction-prompt.ts) Rule 3a.

**Revisit when:** If a different municipality places the property address in a different layout location.

---

### VAT markers: `&` = 15%, `#` = 0%; reversals inherit section VAT
**Date:** 2026-05-11
**Status:** Active

**Choice:** Cape Town bills mark VAT-rated lines with `&` and zero-rated lines with `#`. The prompt captures these per line item. Reversals/rebates within a VAT-rated section inherit that section's VAT rate, even if the line itself is unmarked.

**Why:** Without inheritance, the math check `sum + VAT = total` fails on bills with reversals (because the reversal would not contribute negatively to the VAT base). We discovered this on the Vredefort bill — reversal had `vat_rate: null` initially.

**Where:** [src/lib/anthropic/extraction-prompt.ts](src/lib/anthropic/extraction-prompt.ts) Rule 6.

**Revisit when:** Adding a non-Cape-Town municipality with different VAT markers.

---

### Aggregate total lines are NOT line items
**Date:** 2026-05-11
**Status:** Active

**Choice:** Lines like "Add 15% VAT on amounts marked with & above", "Current account: Total due", "Total liability" are *aggregate calculations*, not charges. They are skipped during extraction. The bill-level fields (`total_vat`, `total_amount_due`) represent these.

**Why we made this explicit:** First Vredefort run captured the VAT total line as a regular charge → double-counted VAT, broke hard checks.

**Where:** [src/lib/anthropic/extraction-prompt.ts](src/lib/anthropic/extraction-prompt.ts) Rule 1a.

**Revisit when:** A municipality includes a meaningful aggregate that should be preserved.

---

### Tariff tiers as separate line items
**Date:** 2026-05-11
**Status:** Active

**Choice:** Stepped tariffs like `(1) 374.7950 kWh @ R 2.9870 (2) 364.6971 kWh @ R 4.1338` split into one line item per tier, each carrying its own `tariff_tier` (1, 2, ...), `usage_value`, `rate`, and computed `amount`.

**Why:** Granular line items principle — each tier is a distinct charge calculation. Allows tier-by-tier audit and rate-change tracking.

**Where:** [src/lib/anthropic/extraction-prompt.ts](src/lib/anthropic/extraction-prompt.ts) Rule 7.

**Revisit when:** Probably never.

---

### Bill-level billing period = the property rates period
**Date:** 2026-05-11
**Status:** Active

**Choice:** `bills.billing_period_start` / `billing_period_end` mirror the PROPERTY RATES section's period (rates appears on every bill and aligns with the billing cycle). Each line item has its own `period_start/end` for utility-specific periods.

**Why:** Cape Town bills don't have a single bill-wide period — each utility runs on its own dates. Rates is the most consistent / representative. Earlier draft conflated this field with the statement-to-due-date range, which is wrong.

**Where:** [src/lib/anthropic/extraction-prompt.ts](src/lib/anthropic/extraction-prompt.ts) Rule 4.

**Revisit when:** A municipality issues bills with a clear, explicit bill-wide period.

---

## Operational

### `dotenv` with `override: true` for env loading in scripts
**Date:** 2026-05-11
**Status:** Active

**Choice:** All standalone scripts use `dotenv` (not Node's `--env-file` flag) to load `.env.local`, with `override: true`.

**Why:** Node's `--env-file` flag **does not override** existing environment variables — it loads only into unset names. Claude Code runs scripts with `ANTHROPIC_API_KEY=` (empty) pre-set, which silently blocks the value in `.env.local` from being applied. `dotenv` with `override: true` always wins.

**Where:** Top of every script in `scripts/` — `import { config } from "dotenv"; loadEnv({ path: ".env.local", override: true });`. Next.js itself handles this correctly for the web app, so this pattern only matters for standalone scripts.

**Revisit when:** Never expected.

---

### Row-Level Security on all tables, no policies
**Date:** 2026-05-11
**Status:** Active (for v1, no auth)

**Choice:** All Supabase tables have RLS enabled with no policies. Backend uses the service role key (bypasses RLS); clients are blocked from direct table access.

**Why:** Safest default for a no-auth prototype. Avoids accidentally exposing data via the Supabase API. When user auth is added, we add policies here without changing application code.

**Where:** [supabase/schema.sql](supabase/schema.sql) "ROW-LEVEL SECURITY" section.

**Revisit when:** Adding user authentication.

---

### All configurable thresholds in the `settings` table
**Date:** 2026-05-11
**Status:** Active

**Choice:** Tunable values (confidence thresholds, variance thresholds, two-pass tolerances, model name, strict mode flag, etc.) live in the DB `settings` table, editable from the (future) Settings UI without code changes.

**Why:** The brief's principle: "configurability over hardcoding." Hard-coded values would require a redeploy to change.

**Where:** `settings` table (seeded with 11 entries). Listed in [README.md](README.md) "Configuration" section.

**Revisit when:** Never — this is the default approach for any new threshold.

---

## Process / methodology

### Granular small steps with checkpoints
**Date:** 2026-05-12
**Status:** Active

**Choice:** Work in small, individually-verifiable steps. Each step has a clear "end-state" verification before proceeding. The "wire extraction into the app" phase is broken into 7 steps (see [PROGRESS.md](PROGRESS.md)).

**Why:** Beginner-friendly. Smaller blast radius if anything goes wrong. Easier to pause/resume across sessions. Reduces compounded debugging.

**Where:** [PROGRESS.md](PROGRESS.md) for the live plan.

**Revisit when:** Never — this is the working style.

---

### Test extraction on every known-good bill after any prompt change
**Date:** 2026-05-11
**Status:** Active

**Choice:** When the extraction prompt is changed, re-run `npm run test:extraction` against all bills in our test set (currently 3) to confirm no regression. Hard checks catch most regressions automatically.

**Where:** Process discipline; no automated runner yet. Future enhancement: a small script that runs extraction on every `tmp/extraction-*.json`'s source PDF and reports pass/fail counts.

**Revisit when:** Once we have ~10 test bills, build the regression runner.

---

## Deferred

These are choices we've made *to defer*. Documented so they're not forgotten.

| Item | Defer reason | Revisit when |
|---|---|---|
| Google Drive sync | Not needed until manual upload workflow is solid | After Step 7 (drag-drop upload working) |
| Scanned PDF testing | Add one phone-photoed bill once digital extraction is locked in | After all 7 steps complete |
| Credential rotation | Secrets shared in chat during setup; rotate after deploy is stable | Before production demo |
| `complex_name` "3B" prefix | Model drops the "3B" from "3B Vredefort" — match still succeeds via Erf+Unit, surfaces as warning. Cosmetic. | If it causes real matching failures |
| `source_type` "scanned" false positive on digital PDFs | Vredefort intermittently labelled "scanned" despite being digital — doesn't affect data quality | If it becomes a routing signal we depend on |
| Regression test runner | Build once we have ~10 test bills | When test corpus grows |
| Authentication | No auth in v1 per brief | When deploying beyond a private URL |
