# Build Progress

Where we are right now and what's next. Updated on every commit.

**Last updated:** 2026-06-07
**Last commit:** docs: add CLIENT_FEEDBACK.md — Daleglen demo notes (Xavier Badenhorst, 4 Jun 2026)
**Live URL:** https://municipal-bills-prototype.vercel.app
**Branch:** `main`

---

## Current phase: "Analytics + UI polish"

### Status

- [x] **Responsive shell — mobile hamburger nav + UI/UX fixes (all breakpoints)**
  - `src/components/app-shell.tsx` (new) — "use client" wrapper that manages `mobileOpen` state; renders sidebar as `hidden md:flex` on desktop, slide-out drawer + black/40 backdrop on mobile; `<AppShell>` replaces the manual sidebar+topbar wiring in `layout.tsx`
  - `src/components/sidebar.tsx` — accepts optional `onClose` prop; shows × close button in mobile mode; nav links call `onClose` on tap so drawer auto-closes after navigation
  - `src/components/top-bar.tsx` — accepts `onMenuOpen` prop; hamburger button (`md:hidden`) opens mobile drawer; breadcrumb parent crumbs hidden on mobile (`hidden sm:inline`) to avoid truncation
  - `src/app/layout.tsx` — simplified to use `<AppShell>`; removed direct Sidebar+TopBar imports
  - `src/app/page.tsx`, `src/app/bills/page.tsx`, `src/app/utilities/utilities-view.tsx` — filter bar separators (`h-4 w-px`) changed to `hidden sm:block` so they don't render as orphaned lines when filter pills wrap on mobile
  - Verified at 375px (mobile), 768px (tablet), 1440px (desktop) — no regressions

- [x] **Analysis page — utility spend/usage analytics (mockup with sample data)**
  - New route at `/utilities` (sidebar label: "Analysis") with full client-rendered analytics view
  - `src/lib/categories.ts` — shared category metadata: `UtilityCategory` type, `CATEGORY_ORDER` (8 categories), `CATEGORY_LABELS`, `CATEGORY_SHORT_LABELS`, `CATEGORY_BADGE_CLASSES`, `CATEGORY_CHART_COLORS` (hex), `CATEGORY_VAT_RATE` (rates=0, others=0.15), `USAGE_CATEGORIES`, `VAT_LABEL`, `VAT_CHART_COLOR`
  - `src/app/utilities/sample-data.ts` — 12 months Apr 2025–Mar 2026, 4 properties; includes water-leak spike (19 Atholl Nov 2025: 95 kL), estimated electricity readings (Atholl Aug+Sep, Vredefort Feb)
  - `src/app/utilities/date-filter.tsx` — multi-select date dropdown; months grouped by year with year-level select-all; 3-col grid layout
  - `src/app/utilities/category-filter.tsx` — multi-select category dropdown; each row shows colour swatch + label
  - `src/app/utilities/utilities-view.tsx` — full interactive view: stat cards (total spend, avg/month, highest category, bills in view), spend-over-time stacked bar chart, usage line charts (electricity/water/sewerage) with estimated-reading hollow dots, monthly breakdown matrix table, spend-by-category donut, property comparison bar chart
  - Charts: Recharts with a custom `ChartArea` component (ResizeObserver for explicit numeric width/height — avoids `width(-1)` console warnings from ResponsiveContainer)
  - Filters: date multi-select, property single-select, category multi-select — all sticky/floating (sticky top-0) as the user scrolls; reset button appears when filters are active
  - VAT: computed inline from `CATEGORY_VAT_RATE`; shown as its own segment in spend chart and matrix; responds to category filter
  - Property comparison chart always shows all 4 properties; highlights selected property
  - Sidebar updated: "Analysis" added between Properties and Upload Bill
  - Breadcrumb updated: `/utilities` segment labelled "Analysis"
  - **Next step:** wire to real Supabase data (replace `sample-data.ts` with server fetch); add URL params for filter state

- [x] **Inline status pills** — Every status badge across the app is now a clickable pill that changes status inline without a page reload
  - `src/components/status-pill.tsx` — "use client" dropdown: fixed-position panel (escapes `overflow:hidden` tables), optimistic UI update with revert on error, outside-click close, `stopPropagation` so stretched-link rows don't navigate when clicking the pill
  - `src/lib/status-options.ts` — single source of truth for `BILL_STATUS_OPTIONS` (10 statuses) and `PROPERTY_STATUS_OPTIONS` (3 statuses)
  - `src/app/bills/[id]/actions.ts` — `updateBillStatus()` server action; `approveBill()` now delegates to it
  - `src/app/properties/actions.ts` — `updatePropertyStatus()` server action
  - All 4 pages updated: bills list, bill detail, properties list, property detail (status bar + info grid + child units table + bills table)
  - Properties list: added `export const dynamic = "force-dynamic"` (was pre-rendering as Static — caused stale status after changes)
  - Removed `ApproveButton` component and local `STATUS_CONFIG` / `StatusBadge` from all pages

- [x] **Manual bill insertion: 3B Vredefort Unit 24 (Sep 2025–Mar 2026)** — 7 months of bills ingested without using Anthropic API credits
  - `scripts/insert-vredefort-bills.ts` — idempotent insertion via `tax_invoice_number`; all bills set to `status: "approved"`, `extraction_model: "manual"`, `confidence_score: 100`; each bill has hand-written `ai_summary` bullets; audit log entry per bill
  - Bills cover: Sep 2025, Oct 2025, Nov 2025, Dec 2025, Jan 2026, Feb 2026, Mar 2026
  - Meter chain verified: 24171→25091→25831→26282→26635→26977→27266→27562 (all actual readings, no gaps)
  - Script header contains full template documentation for future CLI insertions: property linkage rules, idempotency, financial checks, meter chain verification, status guidance, post-insert verification command
  - Pre-existing August 2025 bill (Invoice 202011396764) discovered linked to parent property — relinked to Unit 24 for consistency; audit log entry written

- [x] **Property filter + property detail bills bug fix** — Bills were not showing when filtering by 3B Vredefort; bills section was empty on property detail page
  - Root cause: filter used `.eq("primary_property_id", parentId)` but bills are linked to Unit 24 (child property)
  - Fix in `src/app/bills/page.tsx`: fetch child unit IDs first, then `.in("primary_property_id", [parentId, ...childIds])`
  - Fix in `src/app/properties/[id]/page.tsx`: restructured data fetching from single parallel `Promise.all` to two steps — get child units first, then bills with combined property ID array

- [x] **Verification scripts**
  - `scripts/verify-bills-for-property.ts` — general-purpose per-property verifier; checks per bill: financial totals, VAT consistency, balance arithmetic, period ordering, meter chain continuity, line item existence; accepts `PROPERTY_ID` env var; also resolves child unit IDs so running against a parent catches unit-linked bills
  - `scripts/verify-vredefort-bills.ts` — one-off verification + August bill relink script (no longer needed but kept for reference)

- [x] **Full bill review** — Methodical pass through all 6 bills; three issues found and fixed:
  - Rockaways May 2026: sundry subtotal corrected in DB (R521.72 → R181.83, was double-counting electricity fixed charge)
  - 19 Atholl Apr 2026: sewerage `reading_type` corrected in DB (`not_applicable` → `actual`)
  - All bills: Notes aggregation now keyed on `utility_category|property_id` so each unit row shows only its own breakdown
  - All 6 bills now have `ai_summary` bullets (backfilled via `scripts/backfill-ai-summary.ts`)

- [x] **Bill detail data accuracy fixes** — Three data display bugs corrected in Detailed Breakdown table
  - Reading column now shows "Actual" / "Estimated" (formatted from `reading_type`); subtotal rows that have `reading_type = "not_applicable"` fall back to the first meaningful value from their component rows via `categoryAggReading`
  - Units Used now shows for electricity, water, and sewerage: subtotal rows with null `usage_value` aggregate positive-amount component rows via `categoryAggUsage` (e.g. sums tier kWh for electricity)
  - Days column now counts inclusively (both start and end day), matching the printed bill: `computeDays` updated with `+1`

- [x] **Bill detail page redesign** — New four-section layout standardised across all bills
  - Section 1: Bill Information (municipality, account, property, invoice, period, dates)
  - Section 2: Financial Summary — category-level amounts (rates, electricity, water, etc.) summed from line items, VAT row, total
  - Section 3: Bill Summary — AI reviewer bullets + any issues/field errors combined into one card
  - Section 4: Detailed Breakdown — full table matching the Excel output format: Category badge (every row) | Item (with unit suffix e.g. "Property Rates — Unit 65") | Month | Amount (R) | Days | Reading | Units Used | Start Date | End Date | Notes (Tariffs & Basis, 420px wide column, semicolon-split into bullet lines)
  - Line items query extended to join `properties(unit_number)` so unit info appears in the Item column for multi-unit bills

- [x] **Property filter dropdown** — Searchable property dropdown alongside the period selector on dashboard and bills list
  - `src/components/property-filter.tsx` — "use client" searchable dropdown
  - Preserves `period` param when selecting a property; preserves `property` param when changing period
  - `DashboardPeriodSelector` updated to use `useSearchParams()` so it no longer clobbers `?property=…`
  - Dashboard: summary stats, review queue, and period bills all filtered by selected property
  - Bills list: bills query filtered by selected property
  - Dropdown: "All properties" clears filter; search input autofocuses; closes on outside click
  - Active state: dark pill; inactive: bordered pill (matches period selector style)

- [x] **Clickable rows** — Every bill and property row is now fully clickable (no "View →" link)
  - Dashboard rows: wrapped in `<Link>` directly (div-based layout)
  - Tables (bills list, properties list, property detail units + bills): `position:relative` on `<tr>` + `absolute inset-0` `<Link>` in first cell; no client JS needed
  - Trailing empty column and "View →" cells removed from all tables

- [x] **Dashboard period selector** — Replaced simple ‹ › nav with single-row multi-mode selector
  - `src/components/dashboard-period-selector.tsx` — "use client" component
  - Row of pills: `[All]` `[2024]` `[2025]` `[2026]` | `‹` `[Apr 2026]` `[May 2026]` `[Jun 2026]` `›`
  - Dashboard handles three modes: month (`YYYY-MM`), year (`YYYY`), all-time (`all`)
  - Stat cards filter accordingly; review queue and recent bills remain period-agnostic
  - Fixed "All" button bug: now navigates to `?period=all` explicitly instead of stripping params

- [x] **Period filter** — Dashboard and bills list filterable by `?period=YYYY-MM`
  - `PeriodSelector` client component on bills list: ‹ Month Year › nav + "All periods" link
  - Dashboard defaults to current month; bills list defaults to all periods

- [x] **Property hierarchy display** — Child unit records hidden from lists and counts
  - Properties list: `.is("parent_property_id", null)` filter — shows 4 top-level properties only
  - Dashboard property count: same filter — shows 4, not 11
  - Child units still accessible via "Units" section on parent property detail page

- [x] **DB data quality fixes**
  - `primary_property_id` on all bills re-pointed to top-level parent records (was pointing to child units)
  - Twin Towers bill (October 2024) extracted, saved, and approved — 3 rates line items, 97/100 confidence
  - `ensureParentProperties()` bug fixed: now looks up units by `unit_number` (DB-reliable) rather than
    extracted complex_name/address (case-sensitive mismatch caused duplicate parent + mis-parented unit)
  - New utility scripts: `scripts/db-audit.ts`, `scripts/fix-bill-property-links.ts`, `scripts/fix-twin-towers-save-mess.ts`

- [x] **Step 13** — Section-level extraction + summary_month + ai_summary + parent properties
  - Extraction prompt rewritten: one row per utility section (not per sub-charge)
  - `notes` field on line items carries rich breakdown (fixed/variable split, tier rates, reversal context)
  - `summary_month DATE` added to `bills` — canonical period for filtering; backfilled for all 5 existing bills
  - `ai_summary JSONB` added to `bills` — Claude generates 2–5 reviewer bullet points per bill
  - `parent_property_id UUID` added to `properties` — parent-child hierarchy for complexes
  - `municipal_valuation NUMERIC` added to `properties` — rateable value captured from rates line items
  - DB migration: `supabase/migrations/002_add_summary_month_ai_summary_parent_property.sql`
  - Backfill script: `npm run backfill` — created parent properties for Rockaways, Twin Towers, 3B Vredefort; backfilled summary_month on all bills
  - `save.ts` updated: persists summary_month + ai_summary; auto-creates parent property for multi-unit bills; updates municipal_valuation from rates line items
  - Bill detail UI: new "Bill Summary" section showing ai_summary bullets; "Breakdown" column on line items showing notes
  - Property detail UI: new "Units" section on parent properties showing child units + valuations

---

## Earlier phase: "Wire extraction into the app"

A 7-step plan to take the working CLI extraction and turn it into a real upload-to-database-to-review pipeline.

### Status

- [x] **Step 1** — Create Supabase Storage bucket for bills
  - `npm run setup:storage` creates a private `bills` bucket (10MB limit, PDF-only)
- [x] **Step 2** — Storage upload helper + CLI test
  - [`src/lib/supabase/storage.ts`](src/lib/supabase/storage.ts) — `uploadBillPdf()`, `getBillPdfSignedUrl()`
  - `npm run test:storage -- <pdf>` uploads a file and prints a signed URL
- [x] **Step 3** — Property/account matching logic (pure function)
  - [`src/lib/billing/match.ts`](src/lib/billing/match.ts) — `matchExtractedBill()`
  - `npm run test:matching -- tmp/extraction-*.json` resolves matches without writing
  - Verified against 19 Atholl (single property), Vredefort (single unit + complex-name warning), Rockaways (multi-unit)
- [x] **Step 4** — DB insert pipeline (bill + line items + properties)
  - [`src/lib/billing/save.ts`](src/lib/billing/save.ts) — `saveExtractedBill()` creates missing entities, inserts bill + lines + warnings + audit; idempotent via `tax_invoice_number`; `--force` mode for re-insert
  - [`scripts/test-save.ts`](scripts/test-save.ts) — full end-to-end CLI test (upload → match → save)
  - [`scripts/cleanup-test-data.ts`](scripts/cleanup-test-data.ts) — wipes bills/line items/errors/audit; preserves seed data
  - Verified against all 3 test bills: 3 bills, 59 line items, 1 warning persisted with full granular detail
  - Multi-unit linkage confirmed: Rockaways line items correctly map to 3 different unit IDs; sundries correctly carry null `property_id`
- [x] **Step 5** — Hard checks → bill_field_errors → status routing
  - [`src/lib/billing/validate.ts`](src/lib/billing/validate.ts) — `validateBill()` runs 9 checks (5 critical + 1 critical-per-line + 3 info), persists failures as `bill_field_errors`, computes final status
  - Status routing considers BOTH check failures AND pre-existing errors (match warnings), so a high-confidence bill with a property warning is correctly routed to pending_review under strict mode
  - Verified routing on all 3 test bills: 19 Atholl (conf 92, 0 issues) → approved; Rockaways (conf 95, 0 issues) → approved; Vredefort (conf 88, 1 warning + 4 info) → pending_review
  - Deferred: history-based checks (variance vs baseline, consecutive estimates, materially-large reconciliations). Build after we have ≥3 bills per property.
- [x] **Step 6** — HTTP upload API route + curl test
  - [`src/app/api/bills/upload/route.ts`](src/app/api/bills/upload/route.ts) — `POST /api/bills/upload` accepts multipart/form-data, runs the full upload → extract → match → save → validate pipeline, returns `bill_id` + `status` + summary counts
  - `export const maxDuration = 300` handles Anthropic's ~60–90 s extraction time
  - Validation: PDF-only, ≤ 10 MB; graceful 422 for non-bills; 200 + `already_saved` for duplicate `tax_invoice_number`
  - Verified with curl against Rockaways Jan 2026 (fresh bill): `status: "approved"`, 22 line items, 0 errors
  - Also added `dotenv` override to `next.config.ts` to fix Claude Code shell env-var issue (see TROUBLESHOOTING.md)
- [x] **Step 7** — Drag-drop upload UI + status feedback
  - [`src/app/upload/page.tsx`](src/app/upload/page.tsx) — `'use client'` page at `/upload`
  - Five-state machine: idle → selected → uploading → done → error
  - Idle: dashed drop zone with drag-over highlight and click-to-browse fallback
  - Selected: file chip with name + size, "Process Bill" button
  - Uploading: spinner + "Extracting bill with AI…" + live `0:00` elapsed timer + honest progress hint (upload → extraction → validation)
  - Done: colour-coded result card for each outcome — approved (green), pending_review (amber), hard_rejected (red), already_saved (zinc), not_a_bill (amber 422); each shows relevant counts and bill_id
  - Error: red card with message + detail + "Try again" link
  - Also added `.claude/launch.json` so `preview_start` can manage the dev server

---

## Earlier phases (already complete)

- [x] Project scaffolded (Next.js + TypeScript + Tailwind)
- [x] Supabase schema deployed (8 tables, 6 enums, RLS, indexes, 11 settings, seed data)
- [x] `.env.local` populated; connection test passing
- [x] CLI extraction working end-to-end on 3 real bills, all 5 hard checks passing
- [x] README + DECISIONS + PROGRESS + supporting docs ac63303
- [x] Project hygiene: `.nvmrc`, `.editorconfig`, `npm run check` (lint + typecheck + connections), `turbopack.root` set in `next.config.ts`

---

## Frontend + deployment phase (Steps 8–12, complete)

- [x] **Step 8** — Bills list + bill detail (review panel)
  - [`src/app/bills/page.tsx`](src/app/bills/page.tsx) — server component at `/bills`; table with Status, Property, Account, Period, Amount Due, Due Date columns; `StatusBadge` with full status config; empty state with Upload Bill CTA
  - [`src/app/bills/[id]/page.tsx`](src/app/bills/[id]/page.tsx) — server component at `/bills/:id`; parallel Supabase fetches (bill + line items + errors); four sections: status bar (with Approve button if `pending_review`), bill info grid, financial summary, issues list, line items table with category badges + tier labels + rebate/reversal markers
  - [`src/app/bills/[id]/actions.ts`](src/app/bills/[id]/actions.ts) — `approveBill()` server action: sets `status = "approved"`, writes audit log, calls `revalidatePath`
  - [`src/app/bills/[id]/approve-button.tsx`](src/app/bills/[id]/approve-button.tsx) — `'use client'` button using `useTransition` for pending state
  - Fix: `formatTimestamp()` helper for ISO timestamps (`created_at`) — `formatDate()` only handles `YYYY-MM-DD` strings
  - Smoke-tested: 5 bills render correctly; "Needs Review" detail shows all 15 line items, 5 issues, correct Approve button; approve action working
- [x] **Step 9** — Properties list + detail pages
  - [`src/app/properties/page.tsx`](src/app/properties/page.tsx) — server component at `/properties`; table with Status, Property, Complex/Unit, Account, Municipality columns; 8 properties rendered
  - [`src/app/properties/[id]/page.tsx`](src/app/properties/[id]/page.tsx) — server component at `/properties/:id`; parallel fetches for property + bills; Property Details info grid (12 fields); Bills history table (same style as `/bills`, filtered to `primary_property_id`); empty state when no bills exist
  - Smoke-tested: 269 Beach Road (1 bill shown); 225 Main Road Unit 34 (0 bills, empty state); breadcrumb, status bar, all fields correct

- [x] **Step 10** — Dashboard home page
  - [`src/app/page.tsx`](src/app/page.tsx) — replaces the Next.js scaffold; server component at `/`
  - Four summary stat cards: Needs Review (count + amber highlight when >0), Amount Pending (sum of pending_review bills, amber), Amount Approved (sum of approved bills, green), Properties (count + red if any rejected)
  - **Review Queue** section: lists all `pending_review` bills with property, period, amount, "Review →" link; shows "✓ All bills reviewed" when empty
  - **Recent Bills** section: last 5 bills of any status; "View all →" link to `/bills`
  - Quick links bar: All Bills, Properties, Upload Bill
  - Smoke-tested: 1 pending review (R 11 147,16), R 43 554,38 approved, 8 properties, 5 recent bills showing correctly

- [x] **Step 11** — Navigation shell (sidebar + top bar)
  - [`src/components/sidebar.tsx`](src/components/sidebar.tsx) — `'use client'` left sidebar; "Municipal Bills" app name; links for Dashboard, Bills, Properties, Upload Bill; active link highlighted via `usePathname()`; "Prototype v0.1" footer
  - [`src/components/top-bar.tsx`](src/components/top-bar.tsx) — `'use client'` top bar; path-based breadcrumb built from `usePathname()` segments (UUID segments shown as "Detail"); each breadcrumb segment is a clickable link back to that level; "JA" circular account button top-right
  - [`src/app/layout.tsx`](src/app/layout.tsx) — wired into root layout: full-height flex shell, sidebar fixed-left, right column = top bar + scrollable `<main>`; metadata updated to "Municipal Bills"
  - [`src/app/bills/[id]/page.tsx`](src/app/bills/[id]/page.tsx) — replaced in-page breadcrumb nav with a proper `<h1>` showing the PDF filename; removed now-unused `Link` import
  - [`src/app/properties/[id]/page.tsx`](src/app/properties/[id]/page.tsx) — replaced in-page breadcrumb nav with a `<h1>` showing the property display name
  - Smoke-tested: Dashboard shows "Dashboard" crumb; bill detail shows "Dashboard / Bills / Detail" with all levels clickable; page heading shows full PDF filename

- [x] **Step 12** — Vercel deployment
  - Project linked: `jayache123/municipal-bills-prototype`
  - 6 production env vars set via CLI: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `ANTHROPIC_API_KEY`
  - Build: TypeScript clean, all 8 routes built, 27s build time
  - Live at: https://municipal-bills-prototype.vercel.app
  - Smoke-tested: `/`, `/bills`, `/properties` all returning 200

---

## What remains (future sessions)

The prototype is demo-ready. Things to build next, in rough priority order:

- [ ] **Wire Analysis page to real data** — replace `sample-data.ts` with a Supabase query; make `UtilitiesPage` an async server component that fetches and passes data down; add URL params for filter state persistence
- [ ] **Vercel preview env vars** — set the 6 env vars for the Preview environment (currently production-only; needed for PR preview deploys)
- [ ] **History-based anomaly checks** — variance vs baseline, consecutive estimated readings, materially-large reconciliations. Blocked until ≥3 bills per property are in the DB. (see DECISIONS.md Deferred section)
- [ ] **Audit log page** — read-only table at `/audit` showing all `audit_log` rows (entity, action, user, timestamp)
- [ ] **Settings page** — read/update the `settings` table rows (model name, confidence threshold, etc.)
- [ ] **Authentication** — replace the placeholder "JA" account button with real auth; fill in Supabase RLS policies
- [ ] **Extraction efficiency — grouped workstream** (all items below are related; tackle together)
  - **Hybrid extraction routing (markitdown pre-pass)** — Research completed 2026-05-29; see DECISIONS.md for full test data and results. Run a cheap pre-flight check on every PDF to decide which path to use:
    - Flow B (markitdown → text → Claude): use when PDF is confirmed digital, bill format has been seen before (same account), and the previous bill for that account was auto-approved. ~35% cheaper, ~4s faster per bill.
    - Flow A (PDF → Claude direct): use for scanned/image PDFs, first-time formats, or anything new. Current default; always reliable.
    - **Auto-escalation rule:** if a bill processed via Flow B does not reach `approved` status automatically (any failure, low confidence, or field error), automatically re-run with Flow A before presenting to the human reviewer — no accuracy regression possible.
    - Pre-flight logic: (1) try markitdown — empty output = scanned PDF → force Flow A; (2) check `billing_accounts` for prior approved bills from same account → if none → force Flow A; (3) run Flow B → if not auto-approved → re-run Flow A.
    - Script: `scripts/test-markitdown-comparison.ts` — runs both flows on any PDF and reports tokens, time, cost, JSON validity side by side.
  - **Prompt caching** — Claude supports cache-control headers on system prompts; the extraction prompt is long and repeated on every bill. Caching it reduces input token cost by ~90% on the cached portion after the first call per session.
  - **Batch API** — Anthropic's Batch API processes bills asynchronously at 50% cost. Viable for non-urgent bulk ingestion (e.g. end-of-month batch of all new bills). Not suitable for the live upload flow where the user waits for a result.
  - **Model tiering** — use Haiku for a quick pre-screen pass (is this a valid bill? what municipality?) before committing Sonnet tokens to full extraction. Could save ~60% on bills that fail pre-screen quickly.
  - **Async queue** — move extraction off the HTTP request/response cycle via Vercel Queues; user uploads PDF and gets a job ID immediately; extraction runs in background; webhook or polling shows result when ready. Needed for batch ingestion at scale.
- [ ] **Scanned PDF test** — manufacture a phone-photo PDF, run extraction, verify the `scanned` source path
- [ ] **Regression runner** — script that runs extraction on all test PDFs and reports pass/fail (useful when the prompt is changed)
- [ ] **Credential rotation** — after the demo, rotate any credentials that appeared in chat during early setup

---

## Test bill inventory

All 13 bills are saved and approved in the live DB. The first 6 were AI-extracted; the remaining 7 were manually inserted via CLI script.

| File (in `example_rates/`) | Account | Period | Method | What it exercises |
|---|---|---|---|---|
| `Twin Towers - October 2024.PDF` | 228414930 | Oct 2024 | AI | Multi-unit rates-only (3 units: 65, 117, 191 on Erf 1099); no VAT; old extraction format |
| `3B Vredefort Unit 24 - August 2025 Rates Account.pdf` | 235055327 | Aug 2025 | AI | Single unit (24), 63-day elec period, 4 tier lines, reversal of estimated 660 kWh, rates rebate |
| `Rockaways Rates January 2026.PDF` | 219850405 | Jan 2026 | AI | Multi-unit (3 units: 68, 34, 2 on Erf 1705), rates + sundries; old extraction format |
| `19 Atholl Road Rates - February 2026.pdf` | 239130147 | Feb 2026 | AI | Single property, full utility suite: rates + estimated elec + water + refuse + sewerage + improvement district + sundries |
| `19 Atholl Road Rates - April 2026.PDF` | 239130147 | Apr 2026 | AI | 91-day elec period (reversal of 1,033 kWh estimate), water/sewerage on prior-month reading dates |
| `Rockaways Rates May 2026.PDF` | 219850405 | May 2026 | AI | Multi-unit (same 3 units as Jan 2026), prepaid electricity fixed charge, sundries with rebates |
| `3B Vredefort Unit 24 - Sep 2025.pdf` | 235055327 | Sep 2025 | Manual | Meter 24171→25091, 920 kWh |
| `3B Vredefort Unit 24 - Oct 2025.pdf` | 235055327 | Oct 2025 | Manual | Meter 25091→25831, 740 kWh |
| `3B Vredefort Unit 24 - Nov 2025.pdf` | 235055327 | Nov 2025 | Manual | Meter 25831→26282, 451 kWh |
| `3B Vredefort Unit 24 - Dec 2025.pdf` | 235055327 | Dec 2025 | Manual | Meter 26282→26635, 353 kWh |
| `3B Vredefort Unit 24 - Jan 2026.pdf` | 235055327 | Jan 2026 | Manual | Meter 26635→26977, 342 kWh |
| `3B Vredefort Unit 24 - Feb 2026.pdf` | 235055327 | Feb 2026 | Manual | Meter 26977→27266, 289 kWh |
| `3B Vredefort Unit 24 - Mar 2026.pdf` | 235055327 | Mar 2026 | Manual | Meter 27266→27562, 296 kWh |

Raw extraction JSONs live in `tmp/` (gitignored) after running `npm run test:extraction`.

---

## Open questions / things to revisit

- After Step 7: add scanned-PDF testing (manufacture one via phone-photo, run extraction)
- After ~10 test bills: build a regression runner that runs extraction on every test PDF and reports pass/fail
- After production demo: rotate credentials that were shared in chat during setup
- Eventually: add user authentication and replace empty RLS policies with real ones

See [DECISIONS.md](DECISIONS.md) "Deferred" section for the full list.

---

## How to resume work from scratch

If picking this back up in a new session or new tool:

1. Read [`CLAUDE.md`](CLAUDE.md) — project rules and working style
2. Read [`README.md`](README.md) — setup instructions
3. Read [`DECISIONS.md`](DECISIONS.md) — the *why* of every choice
4. Read this file ([`PROGRESS.md`](PROGRESS.md)) — the *where* of the build
5. Read [`TROUBLESHOOTING.md`](TROUBLESHOOTING.md) — known gotchas
6. Skim [`CHANGELOG.md`](CHANGELOG.md) — recent commits
7. Run `npm run test:connections` to confirm credentials and DB are still reachable
8. Resume at the first unchecked Step above
