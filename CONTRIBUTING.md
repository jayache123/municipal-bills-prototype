# Contributing

How to work on this codebase — for future-you, future-AI sessions, or any human collaborator.

This is a solo prototype today, but conventions matter from day one. They make every later step cheaper.

---

## Session start: required reading

Before making changes (or asking an AI to make changes), make sure these files are fresh in mind:

1. [`CLAUDE.md`](CLAUDE.md) — project rules, working style with the developer
2. [`README.md`](README.md) — setup, environment, configuration
3. [`DECISIONS.md`](DECISIONS.md) — *why* the code looks the way it does
4. [`PROGRESS.md`](PROGRESS.md) — *where* we are in the build
5. [`TROUBLESHOOTING.md`](TROUBLESHOOTING.md) — *what bites you* and how to fix
6. [`ARCHITECTURE.md`](ARCHITECTURE.md) — the system shape
7. [`CHANGELOG.md`](CHANGELOG.md) — recent activity

If you're a fresh AI session: read these in order, then look at recent `git log` for the last 3–5 commits, then ask the user what they want to do next.

---

## Commit workflow

Every commit:

1. **Update [`PROGRESS.md`](PROGRESS.md)** — mark completed steps, note new in-progress items, update the "Last commit" line.
2. **Update [`CHANGELOG.md`](CHANGELOG.md)** — add a one-line bullet to the current session entry (or start a new one if it's a new day/session).
3. **Update [`DECISIONS.md`](DECISIONS.md)** — only if a decision was made or changed in this commit.
4. **Update [`TROUBLESHOOTING.md`](TROUBLESHOOTING.md)** — only if a new gotcha was discovered.
5. **Update [`ARCHITECTURE.md`](ARCHITECTURE.md)** — only if the system shape changed (new component, new external service, schema restructure).
6. **Stage specific files** (`git add <file>...`) — don't use `git add .` (risks accidentally including secrets or build artifacts).
7. **Write a clear commit message** — start with a one-line summary, then a blank line, then a wrapped paragraph or bullet list of what changed and why.
8. **Confirm `.env.local` isn't being added** — it's gitignored, but `git status` first to be sure.

### Commit message style

```
<short, imperative one-line summary, under 70 chars>

<longer explanation if needed>
- bullet about what changed
- another bullet
- why this change matters
```

Examples that fit the style:
- `Scaffold prototype: Next.js project, Supabase schema, extraction pipeline`
- `Add CLAUDE.md project context file`

Avoid: `WIP`, `update`, `fix stuff`, `more changes`. Future-you will not thank past-you.

---

## File organisation

| Where | What goes here |
|---|---|
| `src/app/` | Next.js pages and API routes — UI and HTTP-facing code |
| `src/lib/anthropic/` | Anthropic API integration: prompts, schemas, call wrappers |
| `src/lib/billing/` | Business logic: matching, saving, validation. Pure functions where possible. |
| `src/lib/supabase/` | Supabase clients and storage helpers |
| `src/components/` | (Future) Reusable React components |
| `scripts/` | Standalone CLI scripts (setup, tests). Each one self-loads `.env.local`. |
| `supabase/` | SQL schema and migrations |
| `public/` | Static assets |
| `tmp/` | Local scratch files (gitignored) |
| `example_rates/`, `Daleglen-municipal-bills-uploads/` | Sample bills (gitignored) |

---

## Coding conventions

- **TypeScript everywhere.** No `.js` files in `src/`. Strictness as configured in `tsconfig.json`.
- **No comments stating the obvious.** If the code says what; only comment why.
- **Don't add error handling for impossible cases.** Trust internal code; validate only at system boundaries (user input, external APIs).
- **Prefer specific named imports** over namespace imports.
- **Configurable thresholds belong in the `settings` table**, not in code constants.

---

## Testing approach (current)

- CLI scripts in `scripts/` serve as integration tests
- Run `npm run test:connections` before any DB work, after env changes
- Run `npm run test:extraction -- <pdf>` after any prompt change, against **every** bill in the test corpus (see [`PROGRESS.md`](PROGRESS.md) → "Test bill inventory")
- Hard checks in `scripts/test-extraction.ts` catch most regressions automatically

No unit test framework yet — keep it lightweight until needed.

---

## When working with Claude Code

This project follows the rules in [`CLAUDE.md`](CLAUDE.md). Highlights:

- Step-by-step approach — confirm before proceeding to the next discrete task
- Never create or change files without telling the developer first
- The developer is a beginner — explain plainly, warn about risks, surface alternatives
- Conservative by default — flag uncertainty rather than guessing

---

## What NOT to commit

- `.env.local` (gitignored — contains secrets)
- `node_modules/` (gitignored — regeneratable)
- `tmp/` (gitignored — local extraction outputs)
- `example_rates/`, `Daleglen-municipal-bills-uploads/` (gitignored — sample bills with potentially private data)
- `.DS_Store` and other OS noise

If `git status` shows any of these as untracked, that's expected — leave them alone.
