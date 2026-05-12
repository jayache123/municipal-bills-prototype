# Changelog

Human-readable summary of changes by session. Each entry covers one or more commits.

Format: `## YYYY-MM-DD — <session theme>` then bullet points of what changed and why.

For full per-commit detail, see `git log`.

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
