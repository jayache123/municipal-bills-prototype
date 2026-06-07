# Municipal Bills Prototype

End-to-end prototype for ingesting municipal property bills (PDFs), extracting line items with the Anthropic API, flagging anomalies (variance, missing invoices, extraction errors), and routing to human review before any value is approved for payment.

**Stakes:** bills are used to make payments. The system is conservative by design — uncertainty is flagged for review, not silently approved.

## Tech stack

- **Frontend + serverless backend:** Next.js (App Router) + TypeScript + Tailwind CSS
- **Database + file storage:** Supabase (PostgreSQL + Storage)
- **PDF extraction:** Anthropic API (model configurable via the `settings` table)
- **Google Drive sync:** Google Drive API v3 via a service account
- **Hosting:** Vercel
- **No authentication** in this prototype — protect the deployment URL accordingly

## Prerequisites

- **Node.js 20.6 or newer** (24+ recommended). Check with `node --version`.
- A **Supabase** project ([supabase.com](https://supabase.com)). Free tier is fine.
- An **Anthropic API key** ([console.anthropic.com](https://console.anthropic.com/settings/keys)).
- A **Google Cloud service account** with Drive API access (only needed for the Drive sync feature — can be deferred).
- **macOS users only:** if `npm install` fails with `EACCES` permission errors on `~/.npm/_cacache`, run `sudo chown -R $(whoami) ~/.npm` once to fix npm cache ownership.

## Setup

### 1. Clone and install dependencies

```bash
git clone <your-repo-url>
cd municipal-bills-prototype
npm install
```

### 2. Set up the database

1. Create a new Supabase project (or use an existing one).
2. Open the **SQL Editor** in your Supabase project.
3. Paste the entire contents of [`supabase/schema.sql`](supabase/schema.sql) and click **Run**.
4. The schema is idempotent — safe to re-run.

The schema creates 8 tables, all enums, indexes, and seeds:
- 1 municipality (City of Cape Town)
- 4 example billing accounts with 8 properties
- 11 configuration settings

### 3. Set up environment variables

```bash
cp .env.local.example .env.local
```

Then edit `.env.local` and fill in the values. The file is gitignored — never commit it.

**Where to find each value:**

| Variable | Location |
|---|---|
| `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL` | Supabase: Settings → API → Project URL |
| `SUPABASE_ANON_KEY` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase: Settings → API → `anon` `public` key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase: Settings → API → `service_role` `secret` key (click Reveal) |
| `ANTHROPIC_API_KEY` | Anthropic console: Settings → API Keys → Create Key |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Defer until you build the Drive sync feature |

The `SUPABASE_URL` and `SUPABASE_ANON_KEY` appear twice (once without and once with the `NEXT_PUBLIC_` prefix). The `NEXT_PUBLIC_` versions are exposed to the browser; Row-Level Security protects the data.

The `SUPABASE_SERVICE_ROLE_KEY` bypasses Row-Level Security — treat it like a password. Server-side only.

### 4. Verify the setup

```bash
npm run test:connections
```

This script:
- Reads the 11 settings from your Supabase database
- Sends a tiny "say ok" prompt to Anthropic using the model configured in `settings.anthropic_model`

If both succeed, you're wired up correctly.

### 5. Run the dev server

```bash
npm run dev
```

Opens at `http://localhost:3000`.

## Configuration

All tunable thresholds live in the Supabase `settings` table, editable later via the Settings page in the UI. No code changes needed to tweak them.

| Key | Default | Purpose |
|---|---|---|
| `anthropic_model` | `claude-sonnet-4-6` | Anthropic model used for extraction |
| `confidence_threshold_auto_approve` | `90` | Min confidence for auto-approve |
| `confidence_threshold_review` | `60` | Below this, trigger two-pass extraction |
| `warnings_block_auto_approve` | `true` | Strict mode: any warning blocks auto-approve |
| `variance_threshold_percent` | `30` | Variance threshold for spike detection |
| `variance_baseline_months` | `3` | Months used to compute rolling baseline |
| `two_pass_number_absolute_tolerance` | `0.01` | Abs tolerance when comparing two extractions |
| `two_pass_number_percent_tolerance` | `0.1` | % tolerance when comparing two extractions |
| `billing_cycle_day` | `1` | Day of month for generating expected bills |
| `expected_bill_grace_days` | `7` | Days before missing-invoice flag fires |
| `google_drive_folder_url` | (empty) | Folder synced by the Drive sync feature |

## Project structure

```
.
├── src/app/             Next.js App Router pages and API routes
├── scripts/             Standalone scripts (e.g. test-connections.ts)
├── supabase/
│   └── schema.sql       Full database schema, seed data, RLS, settings
├── public/              Static assets
├── CLAUDE.md            Project rules and context for Claude Code
├── README.md            This file
├── CLIENT_FEEDBACK.md   Client/stakeholder feedback log (reference, not a plan)
└── .env.local.example   Env var template
```

## Project context for future Claude Code sessions

If you (or a future Claude Code session) need to pick this work back up:

1. **Read [`CLAUDE.md`](CLAUDE.md)** — project rules, developer style, system constraints.
2. **Read [`municipal-bills-prototype-prompts/municipal-bills-prototype-claude_code_prompt.md`](municipal-bills-prototype-prompts/municipal-bills-prototype-claude_code_prompt.md)** — the original full build brief.
3. **Read this README** — setup, configuration, and structure.
4. Inspect the live Supabase schema and the `settings` table for current configuration values.

## Notes on key design decisions

- **Conservative by default.** Extraction is treated as untrusted input until validated by hard checks and (where confidence is low) confirmed by a second extraction pass.
- **Account-number-first property matching.** Bills are matched to properties via the 9-digit municipal account number. Address mismatches surface as warnings, never as duplicates.
- **Granular line items.** Every visible sub-charge on a bill is stored as its own row in `bill_line_items`, with full metadata (period, rate, usage, meter readings, VAT, tariff tier). This lets the system mathematically verify each line and reconstruct the original bill exactly. Simpler views can always be derived; granularity cannot be recovered later.
- **Multi-unit bills.** One municipal account can cover multiple property units (e.g. multiple units on a single Erf). The data model handles this via a `billing_accounts` table that owns both bills and properties.
- **No hardcoded municipality format.** The extraction prompt is designed to handle any South African municipal bill, not just City of Cape Town. Bill layouts vary; the prompt must generalise.

## Client feedback log

Client and stakeholder feedback about the tool is recorded in [`CLIENT_FEEDBACK.md`](CLIENT_FEEDBACK.md), grouped by client, then by person and meeting. It is reference context only and does not translate directly into the roadmap or build plan. Consult it during planning; record actual decisions in [`DECISIONS.md`](DECISIONS.md) and [`PROGRESS.md`](PROGRESS.md).

## License

Private prototype — not for redistribution.
