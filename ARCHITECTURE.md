# Architecture

A bird's-eye view of how the system fits together. This is a placeholder — flesh it out as the architecture solidifies.

---

## System diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         Browser (React/Next.js)                 │
│   /upload    /bills    /bills/:id    /properties    /dashboard  │
│   /sync      /settings /audit                                   │
└─────────────────────────────────┬───────────────────────────────┘
                                  │ HTTPS
┌─────────────────────────────────┴───────────────────────────────┐
│                  Next.js API Routes (Vercel)                    │
│                                                                 │
│  POST /api/bills/upload                                         │
│  POST /api/bills/extract                                        │
│  POST /api/sync/drive                                           │
│  GET  /api/bills, /api/properties, ...                          │
└──────┬──────────────┬───────────────┬──────────────┬────────────┘
       │              │               │              │
   ┌───▼──────┐  ┌────▼─────┐  ┌──────▼─────┐ ┌──────▼──────┐
   │ Anthropic│  │ Supabase │  │  Supabase  │ │   Google    │
   │   API    │  │   DB     │  │   Storage  │ │   Drive     │
   │          │  │          │  │            │ │     API     │
   │ (extract │  │ (bills,  │  │  (raw PDF  │ │  (folder    │
   │   bills) │  │  lines,  │  │   files)   │ │   sync)     │
   │          │  │  audit)  │  │            │ │             │
   └──────────┘  └──────────┘  └────────────┘ └─────────────┘
```

---

## Component responsibilities

### Frontend (React, in `src/app/`)
- Pages and UI components
- Calls API routes for everything (no direct DB or Anthropic access)
- Shows status, errors, and review screens to the user
- Shell: `AppShell` client component manages mobile menu state; sidebar is `hidden md:flex` (desktop) or a slide-out drawer (mobile); hamburger button in top bar opens drawer. Top bar shows breadcrumb on all viewports. Sidebar auto-closes on nav link tap.
- `/` — dashboard: summary stat cards, review queue, recent bills, quick links (Step 10)
- `/upload` — drag-drop bill upload with live progress and colour-coded result cards (Step 7)
- `/bills` — server-rendered bills list table with status badges and summary columns (Step 8)
- `/bills/:id` — bill detail review panel: status bar + Approve action; four sections: Bill Information, Financial Summary (category-level amounts + VAT + total), Bill Summary (AI reviewer bullets + field errors), Detailed Breakdown (per-line-item table with category badge, item label, month, amount, days, reading type, units used, start/end dates, notes)
- `/properties` — server-rendered properties list with status, address, complex/unit, account, municipality columns (Step 9)
- `/properties/:id` — property detail: info grid + bills history table filtered to that property (Step 9)
- `/utilities` (sidebar label: "Analysis") — client-rendered analytics view: stat cards, spend stacked bar, usage line charts, monthly breakdown matrix, spend donut, property comparison bar. Currently uses sample data (`src/app/utilities/sample-data.ts`); to be wired to Supabase. Recharts with custom `ChartArea` (ResizeObserver, no ResponsiveContainer). Shared category metadata in `src/lib/categories.ts`.

### API routes (Next.js, in `src/app/api/`)
- Accept uploads, trigger extractions, serve data to the frontend
- Use the service role Supabase client (server-side only)
- Coordinate the extraction → match → save → validate pipeline

### `src/lib/anthropic/`
- `extraction-prompt.ts` — the system prompt that drives extraction
- `extraction-schema.ts` — JSON Schema + TypeScript types for the tool's structured output
- `extract.ts` — the API call wrapper

### `src/lib/billing/`
- `match.ts` — pure function that decides how an extraction maps to existing DB records
- `save.ts` — writes the extraction into Supabase; creates missing entities, batch-inserts line items, records match warnings, writes audit log; idempotent via `tax_invoice_number`
- `validate.ts` — runs 9 hard checks (critical + info), persists failures as `bill_field_errors`, computes final bill status (`approved` / `pending_review` / `hard_rejected`)

### `src/lib/supabase/`
- `server.ts` — service-role client factory (singleton per process)
- `storage.ts` — upload PDFs to bucket, generate signed URLs

### Standalone scripts (`scripts/`)
- One-off setup and test scripts (`setup:storage`, `test:connections`, `test:extraction`, etc.)
- `backfill-ai-summary.ts` — generates AI reviewer bullets for any bill missing `ai_summary`; reads structured DB data (no re-extraction from PDF); safe to re-run
- Use the same library code as the API routes — single source of truth

### Database (Supabase, schema in `supabase/schema.sql`)
- 8 tables: `municipalities`, `billing_accounts`, `properties`, `bills`, `bill_line_items`, `bill_field_errors`, `audit_log`, `settings`
- RLS enabled with no policies (server-only access via service role)
- Seeded with City of Cape Town, 4 example accounts, 8 properties, 11 settings

### Storage (Supabase, bucket `bills`)
- Private bucket (no public access)
- Path layout: `{year}/{month}/{uuid}.pdf`
- 10 MB file size limit, `application/pdf` mime type only

---

## Data flow: ingesting one PDF

```
User drops PDF into /upload
         │
         ▼
POST /api/bills/upload
   1. File saved to Supabase Storage → storage path
   2. extractBill() → ExtractionResult (granular line items + confidence)
   3. matchExtractedBill() → match decisions (existing or needs-create)
   4. saveExtractedBill() → DB rows: bill, properties, line_items
   5. validateBill() → hard checks → bill_field_errors → status set
   6. Audit log entry written
   7. Return bill_id + status to client
         │
         ▼
Browser shows status:
   approved        → green checkmark
   pending_review  → link to /bills/:id
   hard_rejected   → reason + link
```

---

## External dependencies

| Service | Used for | Critical? |
|---|---|---|
| Anthropic API | PDF extraction (the core value) | Yes |
| Supabase (PostgreSQL) | All structured data | Yes |
| Supabase Storage | Raw PDF files | Yes |
| Google Drive API | Manual folder sync (future) | No (deferred) |
| Vercel | Hosting (production) | Yes (for deploy) |
| GitHub | Source control | Standard |

---

## What's not in scope (yet)

- User authentication
- Multi-tenant data isolation
- Real-time updates / streaming responses
- Email notifications for review queue
- Mobile-optimised UI
- Bulk re-extraction (e.g. when the prompt is improved)

---

This file should grow as the architecture takes more shape. When making non-trivial structural changes (e.g. adding a new external service, changing the table topology, introducing a queue), update this file in the same commit.
