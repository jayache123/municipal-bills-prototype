# Build Progress

Where we are right now and what's next. Updated on every commit.

**Last updated:** 2026-05-12
**Last commit:** `038eeb6` — Step 11: navigation shell (sidebar + top bar)
**Live URL:** https://municipal-bills-prototype.vercel.app
**Branch:** `main`

---

## Current phase: "Wire extraction into the app"

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

- [x] **Step 8** — Bills list + bill detail (review panel)
  - [`src/app/bills/page.tsx`](src/app/bills/page.tsx) — server component at `/bills`; table with Status, Property, Account, Period, Amount Due, Due Date columns; `StatusBadge` with full status config; empty state with Upload Bill CTA
  - [`src/app/bills/[id]/page.tsx`](src/app/bills/[id]/page.tsx) — server component at `/bills/:id`; parallel Supabase fetches (bill + line items + errors); four sections: status bar (with Approve button if `pending_review`), bill info grid, financial summary, issues list, line items table with category badges + tier labels + rebate/reversal markers
  - [`src/app/bills/[id]/actions.ts`](src/app/bills/[id]/actions.ts) — `approveBill()` server action: sets `status = "approved"`, writes audit log, calls `revalidatePath`
  - [`src/app/bills/[id]/approve-button.tsx`](src/app/bills/[id]/approve-button.tsx) — `'use client'` button using `useTransition` for pending state
  - Fix: `formatTimestamp()` helper for ISO timestamps (`created_at`) — `formatDate()` only handles `YYYY-MM-DD` strings
  - Smoke-tested: 5 bills render correctly; "Needs Review" detail shows all 15 line items, 5 issues, correct Approve button; approve action working

---

## What's next

Per [brief](municipal-bills-prototype-prompts/municipal-bills-prototype-claude_code_prompt.md) frontend pages, in priority order:

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

## Test bill inventory

Bills we've extracted and validated. Use this as the regression set when changing the extraction prompt.

| File (in `example_rates/`) | Account | What it exercises |
|---|---|---|
| `19 Atholl Road Rates - February 2026.pdf` | 239130147 | Single property, full utility suite (rates + elec estimated + water + refuse + sewerage + improvement district + sundries) |
| `3B Vredefort Unit 24 - August 2025 Rates Account.pdf` | 235055327 | Single unit, stepped electricity tariffs (4 tier lines), reversal of estimated consumption, rate rebate |
| `Rockaways Rates May 2026.PDF` | 219850405 | Multi-unit (3 units on Erf 1705), sundries with rebates, no meter readings |
| `Rockaways Rates January 2026.PDF` | 219850405 | (Available; not yet test-extracted) Same account as above, different month — useful for time-series testing later |
| `Twin Towers - September 2024.PDF` | 228414930 | (Available; not yet test-extracted) Multi-unit rates-only bill |

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
