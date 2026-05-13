# Changelog

## 2026-05-13 — Backfill ai_summary for 5 bills

### Data
- Added `scripts/backfill-ai-summary.ts` — calls Claude Opus with each bill's
  structured line-item data and saves 2–5 analytical reviewer bullets to
  `bills.ai_summary`. Idempotent: skips bills that already have a summary.
- Ran backfill for all 5 bills that had no bullets: 3B Vredefort Aug 2025,
  Rockaways Jan 2026, 19 Atholl Feb 2026, 19 Atholl Apr 2026, Rockaways May 2026.
  All 6 bills now show reviewer bullets in the Bill Summary section.

---

## 2026-05-13 — Full bill review: three accuracy fixes

### Fix — Data (DB updates)
- **Rockaways May 2026 sundry subtotal**: corrected `amount` from R521.72 → R181.83.
  The extraction had baked the electricity fixed charge (R339.89) into the sundry
  subtotal even though that charge was correctly stored as a separate electricity row,
  causing the Financial Summary to double-count it by R339.89. The bold Total was
  always correct (it comes from `total_amount_due`).
- **19 Atholl Apr 2026 sewerage**: corrected `reading_type` from `"not_applicable"` →
  `"actual"` on the sewerage consumption_charge row. Now shows "Actual" in the
  Reading column instead of "—".

### Fix — Code (display)
- **Notes per-property aggregation**: `categoryAggNotes`, `categoryAggUsage`, and
  `categoryAggReading` now key on `utility_category|property_id` instead of
  `utility_category` alone. On multi-unit bills (Rockaways), each unit's subtotal row
  now shows only its own charge breakdown in the Notes column — not every other unit's
  figures. Single-property bills are unaffected.

---

## 2026-05-13 — Bills list Period column now uses issue date

### Fix
- The Period column in the bills list (`/bills`) was showing the billing period start
  month (e.g. Apr 2026 for an Apr–May billing window). It now shows the issue date
  month (e.g. May 2026), matching what's printed on the bill. Falls back to
  `billing_period_start` only if `issue_date` is null. `issue_date` added to the
  bills list query and `BillRow` type.

---

## 2026-05-13 — Month column falls back to issue date

### Fix
- Detailed Breakdown "Month" column now falls back to `bill.issue_date` (instead of
  `bill.summary_month`) when a line item has no `period_start` of its own. This ensures
  the displayed month matches the date printed on the bill.

---

## 2026-05-13 — Fix Reading column, Units Used, and Days in Detailed Breakdown

### Fix
- **Reading column** — now shows "Actual" / "Estimated" correctly. Added `formatReading()`
  helper that capitalises the value properly. For subtotal rows whose `reading_type` is
  `"not_applicable"`, a `categoryAggReading` map supplies the first meaningful reading type
  from the section's component rows (e.g. electricity subtotal now shows "Actual").
- **Units Used** — now populates for electricity, water, and sewerage. Subtotal rows that
  carry a null `usage_value` (old extraction format) fall back to `categoryAggUsage`, which
  sums all positive-amount component rows' `usage_value` fields within the same category.
  Electricity totals across all tiers; water/sewerage pick up their single usage row.
- **Days off by one** — `computeDays` was computing exclusive day count. Bills count both
  the start day and end day, so the formula now adds `+1`:
  `Math.round((e − s) / 86_400_000) + 1`.

---

## 2026-05-13 — Richer Notes column from component-row breakdown

### UI
- Notes (Tariffs & Basis) column now shows one bullet per sub-charge when the
  displayed row is a collapsed subtotal. Each bullet is built from the component
  row's `description` (tariff formula / tier label) + its `amount`, e.g.:
  - `R5,065,000 @ 0.0071590 ÷ 365 × 33 = R3,278.33`
  - `Additional rebate credit = −R281.55`
  - `Tier 1 12/06/2025: 374.795 kWh @ R2.987 = R1,119.60`
  - `Reversal of estimated 660.467 kWh = −R2,033.21`
- Bills with new extraction format (one row per section, own notes field) are
  unchanged — their notes string is still split on ";" into bullets.

---

## 2026-05-13 — Collapse multi-row sections to one row per category

### Fix
- Old extraction format (pre step-13) stored multiple DB rows per utility section
  (charge + rebate + reversal + subtotal). The Detailed Breakdown was rendering all of
  them, making bills like 3B Vredefort show 5 rows for Property Rates and 8 for
  Electricity instead of 1 each.
- New logic: for any utility category that has a `subtotal` row, only the subtotal row
  is shown — its amount is already net (rebate/reversal folded in). Categories without
  a subtotal (new extraction format) show all non-informational rows unchanged.
- Financial Summary fixed for the same reason: previously summed sub-rows AND the
  subtotal, double-counting the amounts. Now uses the same `displayItems` set.
- Notes column: subtotal rows that have sparse notes fall back to aggregated notes
  from their component rows, so tariff/rebate detail is not lost.

---

## 2026-05-13 — Bill detail page redesign

### UI
- `src/app/bills/[id]/page.tsx` — full layout restructure, now standardised across all bills:
  1. **Bill Information** — moved to top; municipality, account, property, erf/unit, invoice, period, dates
  2. **Financial Summary** — category-level amount table (rates, electricity, water, etc. summed from line items); VAT row from `bill.total_vat`; bold total from `bill.total_amount_due`
  3. **Bill Summary** — AI reviewer bullets and field errors combined into one card (previously the blue box was separate and errors were in their own card)
  4. **Detailed Breakdown** — full table: Category (coloured pill on every row) | Item (with unit suffix: "Property Rates — Unit 65") | Month | Amount (R) | Days | Reading | Units Used | Start Date | End Date | Notes (420px wide column; semicolon-delimited clauses rendered as stacked bullet lines)
- Line items query now joins `properties(unit_number)` so multi-unit bills show the unit in the Item column
- `formatShortDate()` and `formatMonth()` helpers added for the new table columns
- `computeDays()` helper computes billing days from period_start → period_end

---

## 2026-05-13 — Property filter dropdown

### UI
- `src/components/property-filter.tsx` — new "use client" searchable dropdown component.
  Shows a pill button ("All properties" or the selected property name); clicking opens a
  panel with a search input (autofocused) and a scrollable list of top-level properties.
  Preserves the `?period=…` param when navigating, and vice versa.
- `src/components/dashboard-period-selector.tsx` — updated `navigate()` to use
  `useSearchParams()` so period changes no longer clobber an active `?property=…` param.
- `src/app/page.tsx` — dashboard fetches top-level property options; reads `?property=`
  from searchParams; applies `primary_property_id` filter to summary stats, review queue,
  and period bills queries; renders `<PropertyFilter>` inline with period selector.
- `src/app/bills/page.tsx` — same: property options fetch, `?property=` filter on bills
  query, `<PropertyFilter>` rendered alongside period selector.

---

## 2026-05-13 — UI polish + data quality

### UI
- All bill and property rows are now fully clickable — removed "View →" links everywhere.
  Dashboard rows: `<Link>` wraps the flex row. Tables: `position:relative` on `<tr>` with an
  `absolute inset-0` `<Link>` stretched across the full row. No client JS required.
- Dashboard period selector redesigned as a single slim row:
  `[All]` `[2024]` `[2025]` `[2026]` | `‹` `[Apr 2026]` `[May 2026]` `[Jun 2026]` `›`
  Dashboard stat cards now respond to three modes: specific month, full year, or all time.
- Properties list and dashboard property count now filter to top-level records only
  (`parent_property_id IS NULL`), showing 4 properties instead of 11.

### Data quality
- `primary_property_id` on all bills corrected to point to top-level parent complex records
  (Rockaways ×2, 3B Vredefort, Twin Towers) — previously pointed to child unit rows.
- Twin Towers — October 2024 bill extracted and saved: 3 rates line items, 97/100 confidence,
  auto-approved. Now 6 bills total in the system.
- Bug fixed in `ensureParentProperties()` (`src/lib/billing/save.ts`): old code searched for
  existing parents by extracted complex_name/address (case-sensitive — failed when PDF had
  all-caps values), creating duplicate parent records and mis-parenting unrelated units.
  New logic: look up units by `billing_account_id + unit_number` (DB-reliable); skip any that
  already have a `parent_property_id`; use `.ilike()` for case-insensitive parent lookup.

### Maintenance scripts added
- `scripts/db-audit.ts` — prints full property hierarchy and bill → property linkage
- `scripts/fix-bill-property-links.ts` — re-points bills from child units to parent records
- `scripts/fix-twin-towers-save-mess.ts` — one-time cleanup for the duplicate parent incident

---

## 2026-05-13 — Period filter: dashboard + bills list

### UI
- `src/components/period-selector.tsx` — new "use client" component: ‹ Month Year › navigation
  with disabled Next at current month, "All periods" escape hatch, uses `usePathname()` for hrefs
- `src/app/page.tsx` — dashboard now accepts `?period=YYYY-MM` searchParam; defaults to current
  month; stat cards (Needs Review, Amount Pending, Amount Approved) filtered by `summary_month`;
  period label shown in subtitle; PeriodSelector in header (no "All periods" — dashboard always
  shows a specific month); review queue and recent bills remain period-agnostic
- `src/app/bills/page.tsx` — bills list now accepts `?period=YYYY-MM`; filters table by
  `summary_month` when period is set; shows "All periods" PeriodSelector so filter can be cleared;
  empty state message adjusts for "no bills for this period" vs "no bills yet"

---

## 2026-05-13 — Step 13: Section-level extraction, summary_month, ai_summary, parent properties

### Data model
- `bills.summary_month DATE` — canonical billing period (first day of month). For City of Cape Town,
  extracted directly from "Account Summary Month". For others, derived from billing_period_end.
  Indexed. Backfilled on all 5 existing bills via `npm run backfill`.
- `bills.ai_summary JSONB` — array of 2–5 analytical bullet strings generated by Claude during
  extraction. Shown to the reviewer as a "Bill Summary" section on the bill detail page.
- `properties.parent_property_id UUID` — self-referential FK. Child unit records point at a parent
  complex record (unit_number IS NULL). 19 Atholl is standalone (no parent).
- `properties.municipal_valuation NUMERIC(14,2)` — latest rateable valuation captured from rates
  line item base_value during save. Displayed on property detail page.
- DB migration: `supabase/migrations/002_add_summary_month_ai_summary_parent_property.sql`
- Backfill script: `scripts/backfill-summary-month-and-parents.ts` (`npm run backfill`)
  - Created parent properties for Rockaways (225 Main Rd), Twin Towers (22 Fort Rd), 3B Vredefort
  - Linked all 6 existing unit records to their parents

### Extraction
- `src/lib/anthropic/extraction-prompt.ts` — rewritten for section-level output:
  - ONE row per utility section (rates, electricity, water, etc.) — not per sub-charge
  - `notes` field carries the rich breakdown: fixed/variable split, tier rates, reversal context,
    reading type, rate calculation basis
  - `summary_month` rule: extract "Account Summary Month" for Cape Town; derive for others
  - `ai_summary` rule: 2–5 reviewer-focused bullets covering anomalies, reversals, period offsets
  - `other` category handles unknown charge types from any municipality
- `src/lib/anthropic/extraction-schema.ts` — updated types + JSON Schema:
  - `summary_month` and `ai_summary` added to `ExtractedBill`
  - `tariff_tier` removed from `ExtractedLineItem` (now encoded in `notes` text)
  - JSDoc on `notes` field describes what to include

### Backend
- `src/lib/billing/save.ts`:
  - Persists `summary_month` and `ai_summary` on bill insert
  - `ensureParentProperties()` — auto-creates parent complex record for multi-unit bills;
    links child units via parent_property_id
  - Updates `municipal_valuation` on property records from rates/CID line item base_value

### UI
- `src/app/bills/[id]/page.tsx`:
  - "Bill Summary" section (blue card) shows ai_summary bullets when present
  - "Breakdown" column in line items table shows the notes field
  - Removed tariff_tier column reference
- `src/app/properties/[id]/page.tsx`:
  - "Units" section shows child properties with unit number, erf, municipal valuation, status, link
  - Municipal Valuation added to Property Details info grid

---

## 2026-05-12 — Step 12: Vercel deployment

- Project linked to Vercel: `jayache123/municipal-bills-prototype`
- 6 production environment variables set via `vercel env add`:
  `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `ANTHROPIC_API_KEY`
- Production deploy via `vercel --prod`: TypeScript clean, all 8 routes
  compiled (static: `/`, `/bills`, `/properties`, `/upload`;
  dynamic: `/bills/[id]`, `/properties/[id]`, `/api/bills/upload`),
  27s build time in Washington D.C. (iad1)
- Live URL: https://municipal-bills-prototype.vercel.app
- Smoke-tested: `/`, `/bills`, `/properties` all HTTP 200

---

## 2026-05-12 — Step 11: Navigation shell

- `src/components/sidebar.tsx` — `'use client'` left sidebar (w-52):
    * "Municipal Bills" app name at top
    * Nav links: Dashboard (exact match), Bills, Properties, Upload Bill
    * Active link highlighted with `bg-zinc-100` via `usePathname()`
    * "Prototype v0.1" label in footer
- `src/components/top-bar.tsx` — `'use client'` top bar (h-14):
    * Path-based breadcrumb from `usePathname()`: splits path into segments,
      maps known slugs to readable labels (Dashboard, Bills, Properties,
      Upload), UUID segments shown as "Detail"
    * Every segment except the last is a clickable `<Link>` back to that level
    * "JA" circular account button (w-8 h-8) top-right; no auth yet, initials
      hardcoded as placeholder
- `src/app/layout.tsx` — updated root layout:
    * Full-height `flex overflow-hidden` shell: `<Sidebar>` + right column
      (`<TopBar>` + scrollable `<main>`)
    * Metadata title updated from "Create Next App" to "Municipal Bills"
- `src/app/bills/[id]/page.tsx` — removed in-page breadcrumb nav; added
  `<h1>` showing the PDF filename (previously only in the breadcrumb)
- `src/app/properties/[id]/page.tsx` — removed in-page breadcrumb nav; added
  `<h1>` showing the property display name (complex · unit · address)

---

## 2026-05-12 — Step 10: Dashboard home page

- `src/app/page.tsx` — replaces the default Next.js scaffold with a real
  dashboard at `/`; server component with four parallel Supabase fetches:
    * All bills (status + amount) → compute aggregate stats in JS
    * `pending_review` bills with property + account joins → review queue
    * Latest 5 bills → recent activity
    * All property IDs → count
- **Summary cards** (top row of 4):
    * Needs Review — count of `pending_review` bills; amber when >0
    * Amount Pending — sum of `total_amount_due` for pending bills; amber when >0
    * Amount Approved — sum for `approved` bills; green when >0
    * Properties — total count; turns red if any `hard_rejected` bills exist
- **Review Queue** — one row per `pending_review` bill showing status badge,
  property address + suburb + customer, amount, period, "Review →" link to
  `/bills/:id`; shows "✓ All bills reviewed" when the queue is empty
- **Recent Bills** — last 5 bills of any status; same row layout with "View →"
  links; "View all →" to `/bills`
- **Quick links** — All Bills, Properties, Upload Bill

---

## 2026-05-12 — Step 9: Properties list + detail pages

- `src/app/properties/page.tsx` — server-rendered properties list at `/properties`:
    * Table columns: Status badge, Property (address + suburb), Complex / Unit,
      Account (number + customer name), Municipality, View →
    * Status badges for: active (green), inactive (grey), sold (muted grey)
    * Sorted alphabetically by address
- `src/app/properties/[id]/page.tsx` — server-rendered property detail at
  `/properties/:id`:
    * Parallel Supabase fetches: property + billing account + municipality;
      bills filtered to `primary_property_id = id` ordered by period desc
    * Status bar: property status badge + address + suburb
    * **Property Details** info grid: municipality, account number, customer,
      address, suburb, complex, unit, erf number, postal code, billing
      frequency, status, registered date
    * **Bills** table (same columns as `/bills`): status badge, period, amount
      due, due date, View → link to `/bills/:id`; empty state ("No bills for
      this property yet") when none exist
    * Breadcrumb: "Properties / {complex} · Unit {n} · {address}"

---

## 2026-05-12 — Step 8: Bills list + bill detail pages

- `src/app/bills/page.tsx` — server-rendered bills list at `/bills`:
    * Table columns: Status, Property, Account, Period, Amount Due, Due Date, View →
    * `StatusBadge` component with colour config for 10 statuses (approved,
      pending_review, hard_rejected, received, expected, queried, reviewed,
      paid, overdue, not_applicable)
    * Dates parsed as `YYYY-MM-DD` local time (no UTC offset shift)
    * Empty state with Upload Bill CTA; "+ Upload Bill" header link
- `src/app/bills/[id]/page.tsx` — server-rendered bill detail at `/bills/:id`:
    * Parallel Supabase fetches: bill + billing_account + municipality + property,
      line items ordered by `line_order`, unresolved `bill_field_errors`
    * Four sections in `SectionCard` wrappers:
        1. **Status bar** — status badge, "Processed {date}", confidence %, issue
           count warning, and Approve Bill button (only when `pending_review`)
        2. **Bill Information** — `InfoGrid` with municipality, account, customer,
           property, erf/unit, invoice number, billing period, issue/due dates
        3. **Financial Summary** — previous balance, payments received, current
           charges, VAT, total amount due
        4. **Issues** — collapsible list of unresolved `bill_field_errors` with
           severity badges (critical / warning / info) and extracted values
        5. **Line Items** — table with #, category badge, description, period,
           usage, amount; tier labels for electricity; green tint for rebates /
           reversals; bold for subtotals
    * Footer shows extraction model + bill UUID
- `src/app/bills/[id]/actions.ts` — `approveBill()` server action:
  sets `status = "approved"`, inserts `audit_log` entry, calls `revalidatePath`
  for both the detail and list pages
- `src/app/bills/[id]/approve-button.tsx` — `'use client'` button using
  `useTransition` for an "Approving…" pending state
- Bug fix: added `formatTimestamp()` for ISO 8601 timestamps (`created_at`);
  the existing `formatDate()` only handles `YYYY-MM-DD` strings and returned
  "Invalid Date" for full timestamps

---

## 2026-05-12 — Step 7: Drag-drop upload UI

- `src/app/upload/page.tsx` — `'use client'` page at `/upload` with a
  five-state machine (idle → selected → uploading → done → error):
    * **Idle**: dashed drop zone; drag-over highlights blue; click-to-browse
      via hidden `<input type="file">`; PDF-only validation before state advance
    * **Selected**: file chip with name + size; "Process Bill" button; "Choose a
      different file" escape hatch
    * **Uploading**: animated spinner; "Extracting bill with AI…"; live elapsed
      timer counting up in `0:00` format; honest progress hint that changes at
      ~5 s (upload) → ~80 s (extraction) → ~80 s+ (validation)
    * **Done**: colour-coded result card for every API outcome:
        - `approved` → green: line items + warnings + errors counts
        - `pending_review` → amber: issue count breakdown
        - `hard_rejected` → red: critical failure count
        - `already_saved` → zinc: "no changes made" + bill_id
        - HTTP 422 not-a-bill → amber: rejection reason + detected type
    * **Error**: red card with message + optional detail + "Try again"
- `.claude/launch.json` — dev server config for the preview tool

---

## 2026-05-12 — Step 6: HTTP upload API route

- `src/app/api/bills/upload/route.ts` — `POST /api/bills/upload` accepts
  `multipart/form-data` with a `file` field and runs the complete pipeline:
    * Validates the file (PDF-only, ≤ 10 MB)
    * Uploads to Supabase Storage
    * Calls Anthropic for extraction (`maxDuration: 300`)
    * Hard-rejects non-bills with HTTP 422 + `rejection_reason`
    * Returns HTTP 200 + `{ status: "already_saved" }` for duplicate `tax_invoice_number`
    * Runs match → save → validate and returns `bill_id`, final `status`, and
      summary counts (entities created, line items, validation failures)
- `next.config.ts` — added `dotenv` with `override: true` at startup so the
  Next.js dev server inherits the real `ANTHROPIC_API_KEY` from `.env.local`
  even when Claude Code pre-sets the variable to `""` in the shell environment.
  No-op on Vercel (`.env.local` does not exist in production).

Verified with curl:
- Rockaways Rates January 2026 (fresh bill, never saved): 200 `approved`, 22 line
  items, 0 validation errors — full pipeline end-to-end in ~90 s
- 19 Atholl Road April 2026 (saved on first upload): 200 `already_saved` on
  the duplicate — idempotency guard working correctly

---



Human-readable summary of changes by session. Each entry covers one or more commits.

Format: `## YYYY-MM-DD — <session theme>` then bullet points of what changed and why.

For full per-commit detail, see `git log`.

---

## 2026-05-12 — Step 5: Hard checks → bill_field_errors → status routing

- `src/lib/billing/validate.ts` — `validateBill()` runs 9 checks against an
  extracted bill, persists failures into `bill_field_errors`, and computes
  the bill's final status:
    * 5 critical bill-level checks: line item sum, VAT self-consistency,
      balance arithmetic, period ordering, due-date ordering
    * 1 critical per-line check: meter reading direction
    * 3 info checks: low field confidence, low line confidence, scanned source
- Status routing combines NEW check failures with EXISTING bill_field_errors
  (e.g. property-match warnings from save). A high-confidence bill with a
  property warning is correctly routed to pending_review under strict mode.
- `scripts/test-save.ts` now chains validate after save, prints summary +
  failed checks for visibility.
- Bug caught and fixed during testing: initial `decideStatus` only looked at
  the just-run checks; without considering existing match warnings, a
  high-confidence bill could have been wrongly auto-approved.

Verified routing on all 3 test bills:
- 19 Atholl (conf 92, 0 issues) → approved
- Rockaways May 2026 (conf 95, 0 issues) → approved
- 3B Vredefort (conf 88, 1 warning + 4 info) → pending_review

Deferred history-based warnings (variance, consecutive estimates,
materially-large reconciliations) until we have ≥3 bills per property.

---

## 2026-05-12 — Step 4: DB insert pipeline

- `src/lib/billing/save.ts` — `saveExtractedBill()` persists an extraction:
  creates missing municipality / billing account / properties (where the match
  step said "needs create"), inserts the bill, batch-inserts line items with
  correct property linkage, records matching warnings as `bill_field_errors`,
  writes an `audit_log` entry. Idempotent via `tax_invoice_number`; `--force`
  re-inserts cleanly via cascade-delete + re-insert.
- `scripts/test-save.ts` — end-to-end CLI: upload PDF → match → save.
- `scripts/cleanup-test-data.ts` — wipes bills/line-items/errors/audit log;
  preserves seed data.
- `match.ts` — exported `propertyIdentityKey` so save can reuse the same
  identity rule when deduplicating new properties to create.
- Warning collection in save now dedupes by message (the same property
  warning attached to N line items collapses to a single bill_field_errors
  row). Without this, Vredefort produced 14 identical warnings.

Verified against all 3 test bills:
- 19 Atholl: 23 line items, 0 warnings
- Rockaways May 2026 (multi-unit): 21 line items, 3 unit IDs mapped, 0 warnings
- 3B Vredefort: 15 line items, 1 deduped warning (complex_name diff)

Test commands:
- `npm run test:save -- <pdf>` — save (errors if a matching tax_invoice_number exists)
- `npm run test:save -- <pdf> --force` — replace existing bill
- `npm run cleanup:test-data -- --force` — clean slate for re-runs

---

## 2026-05-12 — Documentation hardening + project hygiene

Synced yesterday's commit (`47cb530`) into local `main` and pushed to GitHub `origin/main`.

Documentation suite:
- Added `DECISIONS.md` — architectural decisions with rationale, alternatives, and revisit triggers (19 decisions across 6 categories)
- Added `PROGRESS.md` — live build state with the 7-step "wire into app" plan
- Added `TROUBLESHOOTING.md` — known gotchas (npm cache permissions, dotenv override, lockfile warning, etc.)
- Added `ARCHITECTURE.md` — system diagram and component responsibilities
- Added `CONTRIBUTING.md` — workflow and doc-maintenance rules
- Added this `CHANGELOG.md`
- Updated `CLAUDE.md` to require these files be read at session start and updated on every commit

Project hygiene:
- Added `.nvmrc` pinning Node v24
- Added `.editorconfig` for consistent indentation/line-endings across editors
- Added `npm run typecheck` (`tsc --noEmit`) and `npm run check` (lint + typecheck + connections) scripts
- Set `turbopack.root` in `next.config.ts` to silence the "multiple lockfiles" warning when working from a git worktree
- Verified: lint clean, typecheck clean, connections healthy, build clean

---

## 2026-05-11 — Prototype foundation

Commit: `47cb530` — *Scaffold prototype: Next.js project, Supabase schema, extraction pipeline*

- Scaffolded Next.js v16 + TypeScript + Tailwind v4 in the worktree
- Wrote `supabase/schema.sql`: 8 tables, 6 enums, indexes, RLS, 11 seeded settings, plus seed data for City of Cape Town with 4 example billing accounts and 8 properties
- Built the extraction pipeline:
  - JSON Schema + TypeScript types in `src/lib/anthropic/extraction-schema.ts`
  - System prompt in `src/lib/anthropic/extraction-prompt.ts` covering granular line items, multi-unit bills, VAT markers, tariff tiers, reversals, primary-property-vs-postal-address
  - Anthropic tool-use call in `src/lib/anthropic/extract.ts`
- Set up Supabase Storage:
  - Private `bills` bucket (10 MB, PDF-only) via `scripts/setup-storage.ts`
  - Upload helper + signed URL helper in `src/lib/supabase/storage.ts`
- Built property/account matching (account-number-first) in `src/lib/billing/match.ts`
- Wrote CLI test scripts: connections, extraction, storage, matching
- Verified extraction end-to-end against three real Cape Town bills:
  - 19 Atholl Road (Feb 2026) — single property, full utility suite
  - 3B Vredefort Unit 24 (Aug 2025) — stepped tariffs + reversal
  - Rockaways May 2026 — multi-unit, 3 distinct property IDs resolved
- All 5 hard checks pass on every test bill
- README with setup, configuration, and structure
- `.env.local.example` template; `.env.local` gitignored

Earlier commits:
- `a5c6808` — Add CLAUDE.md project context file
- `0376a09` — Initial commit
