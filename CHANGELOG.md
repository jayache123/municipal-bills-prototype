# Changelog

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
