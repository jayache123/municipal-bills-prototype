# Troubleshooting

Known gotchas and their fixes. Add new entries when something surprising bites you.

Each entry: **Symptom → Cause → Fix**.

---

## `npm install` fails with `EACCES` errors on `~/.npm/_cacache`

**Symptom:**
```
npm error errno EEXIST
npm error Invalid response body while trying to fetch ...: EACCES: permission denied, mkdir '/Users/.../.npm/_cacache/content-v2/sha512/...'
```

**Cause:** Some files in your global npm cache are owned by `root` instead of your user, usually from accidentally running `npm` with `sudo` at some point. npm can't write into those root-owned subdirectories as a regular user.

**Fix (one-time):**
```bash
sudo chown -R $(whoami) ~/.npm
```
Enter your Mac password when prompted. Affects only your home directory.

**Avoid recurrence:** Never run `npm` with `sudo`. If a tutorial tells you to, find another tutorial.

---

## `process.env.ANTHROPIC_API_KEY` is empty even though `.env.local` has it

**Symptom:** A standalone script (`npm run test:*`) reports an env var is missing, even though it's clearly set in `.env.local`.

**Cause:** Node's built-in `--env-file` flag does NOT override existing environment variables. Claude Code (and some shells) export certain vars empty by default (e.g. `ANTHROPIC_API_KEY=`), and `--env-file` respects that.

**Fix:** All our scripts use the `dotenv` package with `{ override: true }` at the top:
```ts
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local", override: true });
```
This always wins over shell env vars.

**Avoid recurrence:** When adding new scripts, copy the env-loading boilerplate from an existing one in `scripts/`.

---

## Supabase SQL Editor warns "Query has destructive operations" on `supabase/schema.sql`

**Symptom:** Pasting the schema into the SQL Editor pops up a "destructive operations detected" confirmation.

**Cause:** The schema contains `DROP TRIGGER IF EXISTS` statements (for idempotency — so the script can be re-run). Supabase's SQL Editor flags any `DROP` keyword conservatively.

**Fix:** Click "Run this query". The drops are safe — they remove triggers immediately before re-creating identical ones. Never touches tables or data.

**Avoid recurrence:** This is the cost of idempotency. Live with it.

---

## A PDF gets `source_type: "scanned"` despite being a digital, text-embedded PDF

**Symptom:** Extraction output shows `source_type: "scanned"` for what you know is a digital PDF (e.g. 3B Vredefort sometimes).

**Cause:** The model's source-type detection is not perfectly reliable for some Cape Town bills — they have image-rendered headers/logos that can trigger the "scanned" label even though the body text is selectable.

**Fix:** Cosmetic only — does not affect extracted data quality. The hard checks still pass. Ignore for now.

**Long-term:** If source_type becomes a real routing signal (e.g. "scanned → require manual review"), revisit the prompt or compute source_type ourselves based on the byte stream rather than asking the model.

---

## Extracted `complex_name` is missing a prefix (e.g. "VREDEFORT" instead of "3B VREDEFORT")

**Symptom:** A property's `complex_name` field comes back stripped of a leading qualifier like "3B" or "Block A".

**Cause:** The extraction prompt doesn't strongly disambiguate prefix qualifiers from building/unit identifiers. The model interprets "3B" as a unit/building identifier and drops it from the complex name.

**Fix:** Match still succeeds via `(erf_number, unit_number)` identity — the matcher surfaces a warning ("complex name on bill differs from DB"). Not a blocker.

**Long-term:** If matching consistently fails because of this, refine the prompt with examples of complex-name prefixes.

---

## "Add 15% VAT on amounts marked with & above" appears as a line item

**Symptom:** Older runs would capture the VAT total line as a charge → broke `sum + total_vat = total` check.

**Cause:** Aggregate calculation lines on Cape Town bills looked like normal charges to the prompt.

**Fix:** Already addressed in [`src/lib/anthropic/extraction-prompt.ts`](src/lib/anthropic/extraction-prompt.ts) Rule 1a — these lines are explicitly listed as "do not capture."

**Avoid recurrence:** When adding a new municipality, watch for similar aggregate-style lines and extend Rule 1a.

---

## A non-bill PDF (e.g. a Proof of Payment) is in the example_rates folder

**Symptom:** A PDF that's clearly not a municipal bill (FNB notification, remittance advice) is included in the test corpus.

**Cause:** The user's source folder may mix bill documents with payment confirmations and other correspondence.

**Fix:** The extraction prompt's `document_type` detection handles this — non-bills get `document_type: "not_a_bill"` with a `rejection_reason`, and no extraction is attempted. The pipeline can hard-reject these cleanly.

**Avoid recurrence:** The detection is automatic; no action needed. If a future non-bill format slips through as "municipal_bill", add an example to the prompt's "not_a_bill" definition.

---

## Fast-forward to local `main` fails: "branch is currently checked out"

**Symptom:**
```
remote: error: refusing to update checked out branch: refs/heads/main
```

**Cause:** Trying to update local `main` from a worktree where `main` is checked out in the *parent* directory. Git protects against this because it would leave the parent's working tree inconsistent.

**Fix:** Run the merge from the parent worktree, not from inside `.claude/worktrees/...`:
```bash
git -C /path/to/main/worktree merge --ff-only <feature-branch>
git -C /path/to/main/worktree push origin main
```

**Avoid recurrence:** Standard worktree workflow. Always operate on `main` from the directory where it's checked out.

---

## My existing extraction JSON in `tmp/` is out of sync with the latest prompt

**Symptom:** You changed the extraction prompt and want to re-run matching, but `tmp/extraction-*.json` is from an older prompt version.

**Cause:** Extraction JSONs are cached on disk after every `npm run test:extraction`. They don't auto-refresh.

**Fix:** Re-run extraction explicitly:
```bash
npm run test:extraction -- "example_rates/<bill>.pdf"
```
This overwrites the JSON in `tmp/`.

**Avoid recurrence:** When iterating on the prompt, regenerate the relevant JSONs before running downstream tests (matching, save).
