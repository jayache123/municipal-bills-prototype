# Build prompt: Municipal Bill Processing and Variance Detection Prototype

## Project context

I am building a working prototype of a system that automates the processing of municipal property bills for a property management company. The end client is a property management business that currently receives thousands of municipal PDF bills each month, prints them, and manually captures each line item. There is no current system for flagging unexpected usage spikes, missing bills, or extraction errors.

This is a high-stakes financial system. Bills are used to make payments. Any incorrect extracted value has direct financial consequence. The system must be conservative: it should flag uncertainty for human review rather than silently approve questionable data.

The prototype must be functional end to end. I will be testing it with real PDF bills and demonstrating it to the client.

## Build scope

A web application with seven logical layers:

1. PDF upload (manual drag and drop, plus a Google Drive sync triggered manually)
2. Extraction via the Anthropic API
3. Self-validation through hard checks and an optional two-pass extraction
4. Confidence-based routing: auto-approve, admin review, or hard reject
5. Storage: Supabase database, Supabase Storage for raw PDFs, audit trail table
6. Logic: variance detection per utility, missing invoice detection, filtered CSV export
7. Dashboard: three summary views (billing health, usage overview, processing status), editable review queue, settings page

The system handles both digital (text-embedded) PDFs and scanned image PDFs. The Anthropic API reads both natively.

## Tech stack

- **Frontend**: React with Tailwind CSS
- **Hosting**: Vercel (frontend and serverless backend functions in the same project)
- **Backend**: Node.js or Python serverless functions on Vercel -- use whichever you judge most appropriate
- **Database**: Supabase (PostgreSQL)
- **File storage**: Supabase Storage
- **PDF extraction**: Anthropic API (claude-sonnet-4 or latest available)
- **Google Drive integration**: Google Drive API v3 via a service account
- **No authentication for this version** -- the app is open to anyone with the URL

## Environment variables needed

```
ANTHROPIC_API_KEY=
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GOOGLE_SERVICE_ACCOUNT_JSON=
```

## Data model

### properties
- id (uuid, primary key)
- address (text)
- unit_number (text, nullable)
- section_number (text, nullable)
- account_number (text)
- municipality_id (uuid, foreign key to municipalities)
- status (enum: active, inactive, sold)
- billing_frequency (enum: monthly -- only monthly for now)
- notes (text, nullable)
- created_at (timestamp)
- updated_at (timestamp)

### municipalities
- id (uuid, primary key)
- name (text) -- e.g. "City of Cape Town", "Stellenbosch Municipality"
- created_at (timestamp)

### bills
- id (uuid, primary key)
- property_id (uuid, foreign key to properties)
- municipality_id (uuid, foreign key to municipalities)
- billing_period_start (date)
- billing_period_end (date)
- issue_date (date)
- due_date (date)
- account_number_on_bill (text)
- total_amount_due (numeric)
- amount_payable_after_credits (numeric) -- can be zero or negative
- credit_balance (numeric, default 0)
- raw_pdf_url (text) -- path in Supabase Storage
- confidence_score (numeric, 0-100)
- extraction_pass_count (integer, default 1) -- 2 if two-pass was triggered
- status (enum: expected, received, pending_review, reviewed, approved, queried, paid, overdue, not_applicable, hard_rejected)
- notes (text, nullable)
- created_at (timestamp)
- updated_at (timestamp)

### bill_line_items
- id (uuid, primary key)
- bill_id (uuid, foreign key to bills)
- utility_type (enum: water, electricity, refuse, sewerage, rates, other)
- description (text)
- amount (numeric)
- usage_value (numeric, nullable) -- e.g. kL for water, kWh for electricity
- usage_unit (text, nullable)
- reading_type (enum: actual, estimated, not_applicable)
- prior_estimate_value (numeric, nullable) -- if this is a reconciliation
- reconciliation_delta (numeric, nullable)
- opening_meter_reading (numeric, nullable)
- closing_meter_reading (numeric, nullable)
- created_at (timestamp)

### bill_field_errors
- id (uuid, primary key)
- bill_id (uuid, foreign key to bills)
- field_name (text) -- e.g. "total_amount_due", "billing_period_end"
- rule_name (text) -- e.g. "amount_reconciliation", "meter_direction"
- severity (enum: critical, warning, info)
- extracted_value (text)
- message (text)
- resolved (boolean, default false)
- resolved_at (timestamp, nullable)
- created_at (timestamp)

### audit_log
- id (uuid, primary key)
- entity_type (text) -- "bill", "property", "settings", etc.
- entity_id (uuid)
- action (text) -- "field_edited", "status_changed", "extracted", "approved", "rejected"
- field_name (text, nullable)
- original_value (text, nullable)
- new_value (text, nullable)
- user_identifier (text) -- since there is no auth yet, use "admin" or similar placeholder
- created_at (timestamp)

### settings
- key (text, primary key)
- value (text)
- description (text)
- updated_at (timestamp)

Pre-populate with:
- `confidence_threshold_auto_approve` = 90
- `confidence_threshold_review` = 60
- `variance_threshold_percent` = 30
- `variance_baseline_months` = 3
- `google_drive_folder_url` = empty string
- `billing_cycle_day` = 1

## Core processing pipeline

When a PDF arrives (either manual upload or Drive sync), run this pipeline:

### Step 1: Store the raw PDF
Upload to Supabase Storage under a path like `bills/{year}/{month}/{uuid}.pdf`. Save the URL on the bill record.

### Step 2: Initial extraction (Anthropic API)
Send the PDF to claude-sonnet-4 with a structured extraction prompt. The prompt should request:
- All billing fields (account number, billing period, issue date, due date, total amount, amount payable after credits, credit balance)
- Property identifiers (address, unit/section number, account number)
- Each utility line item with utility type, description, amount, usage value, usage unit, reading type (actual or estimated), opening and closing meter readings if available, and any reconciliation indicators
- A self-reported confidence score per field (0-100)
- An overall extraction confidence score

The response should be structured JSON. Use Claude's native PDF support -- do not run OCR separately.

### Step 3: Hard validation checks
Run all of the following checks. Each failure creates a `bill_field_errors` record with appropriate severity:

**Critical (always block auto-approve):**
- Line item amounts must sum to total amount due (allow small rounding tolerance)
- Total amount minus credit balance must equal amount payable after credits
- Billing period start must precede billing period end
- Due date must be after billing period end
- For each utility line item with meter readings, closing reading must be greater than or equal to opening reading
- If property already exists in DB, the account number on this bill must match what is on file
- Each numeric field must parse as a valid number
- Each date field must parse as a valid date

**Warning (route to review unless score is very high):**
- Total amount is more than the configured variance threshold above or below the rolling baseline for this property
- Usage on any utility is more than the variance threshold above or below the rolling baseline for that property and utility
- Municipality name extracted does not match any record in the municipality registry
- A reading marked as "estimated" follows another estimate from the prior month (multiple consecutive estimates)
- A reconciliation delta is present and is materially large (more than the configured variance threshold)

**Info (logged but does not block):**
- Per-field extraction confidence below 80
- PDF appears to be a scan rather than digital text (still extracted successfully)

### Step 4: Two-pass extraction (conditional)
If the overall confidence is below the configured review threshold OR if any critical error was raised, run a second extraction pass with a slightly different prompt phrasing. Compare the two extractions field by field. For any field where the two passes disagree, raise a critical error on that field. The reviewer will see both extracted values in the review panel.

### Step 5: Routing decision
- If overall confidence is at or above `confidence_threshold_auto_approve` AND there are no critical errors AND there are no unresolved warnings → set status to `approved`
- If the PDF is genuinely unreadable or fundamentally not a municipal bill → set status to `hard_rejected`
- Otherwise → set status to `pending_review`

### Step 6: Match or create property
Based on the extracted property identifiers (address, unit/section number, account number), try to match an existing property. If no match, create a new property with status `active`. Log this action in the audit_log.

### Step 7: Generate Expected records
On a scheduled basis (the prototype can expose this as a manually triggerable function for now, callable from the dashboard), generate an `expected` bill record for each `active` property at the start of each billing cycle. If no bill is received within a configurable number of days after the expected date, the missing invoice flag surfaces it on the dashboard.

## Frontend pages and components

### 1. Dashboard home (`/`)
A summary view with three tabs or sections:

**Billing health**
- Total amount payable this month across active properties
- Total in dispute (sum of bills with status `queried`)
- Total credit balance held (sum of credit_balance across approved bills with credit)
- Month-on-month spend variance (current vs prior month, percentage and rand value)
- Number of properties with overdue bills, with total rand value
- Spend breakdown by municipality (table with totals)

**Usage overview**
- Portfolio-wide water consumption this month vs prior month (with percentage delta)
- Portfolio-wide electricity consumption this month vs prior month
- Count of properties on estimated readings this month
- Count of properties with reconciliation deltas above threshold this month
- Top 5 properties by water usage (this month)
- Top 5 properties by electricity usage (this month)
- Count of properties flagged for anomalous usage this month

**Processing status**
- Bills received this month vs expected (with percentage complete)
- Number pending review
- Number hard rejected
- Average time from receipt to approval
- Number of properties with no bill received and days since expected
- Extraction accuracy rate (percentage of bills that passed all hard checks without manual intervention)

Each summary metric should be clickable and deep-link into the relevant filtered list view.

### 2. Bills list (`/bills`)
A filterable, sortable table showing all bills. Filters at the top:
- Status (multi-select including all status values)
- Property
- Municipality
- Billing period (date range)
- Has critical errors (yes/no)
- Has warnings (yes/no)
- Reading type (actual, estimated, mixed)
- Has credit balance (yes/no)

Columns: property, municipality, billing period, total amount, status, error count, last updated.

A button on the page: "Export current view as CSV". The exported file should contain exactly the filtered rows visible at that moment.

### 3. Bill detail / Review panel (`/bills/:id`)
This is the editable review screen. Two-column layout:

**Left side: the PDF**
- Embedded PDF viewer showing the original document
- The user can zoom and scroll

**Right side: editable fields**
- Every extracted field shown as an input with:
  - The original extracted value visible and locked (display only)
  - An editable input next to it for the corrected value
  - A small badge showing the field's error severity if any (red for critical, amber for warning, blue for info)
  - The validation rule message if applicable
- All bill-level fields editable: billing period dates, issue date, due date, total amount, amount payable, credit balance, account number
- Line items shown in a table with each cell editable: utility type, description, amount, usage value, reading type, meter readings
- Historical trend chart for this property's utility usage, showing this bill's values in context
- A notes field for free-text comments
- Two action buttons at the bottom: "Save and Approve" (writes corrected values, sets status to approved, logs to audit trail) and "Save without Approving" (saves edits, keeps status as pending_review)
- A separate "Mark as Queried" button for disputed bills
- A separate "Hard Reject" button for unsalvageable bills

Every field edit must write an entry to `audit_log` with the original value, the new value, the field name, and a placeholder user identifier ("admin" for now).

### 4. Properties list (`/properties`)
A filterable list of all properties with: address, unit, account number, municipality, status, bill count, last bill received, next expected bill, outstanding amount.

A "New property" button to manually create properties.

### 5. Property detail (`/properties/:id`)
- Property info at the top, editable
- Timeline of all bills for this property, sortable
- Usage charts: water and electricity over time, with actual vs estimated readings visually distinguished
- Status history
- Notes field
- A "Mark as inactive" / "Mark as sold" action

### 6. Settings (`/settings`)
A simple form with the following editable fields:
- Google Drive folder URL (with a "Test connection" button that verifies the service account can access the folder)
- Confidence threshold for auto-approval
- Confidence threshold for review
- Variance threshold percentage
- Variance baseline months
- Billing cycle day (which day of the month Expected records are generated)

Saving any setting writes to the `settings` table and logs to `audit_log`.

### 7. Upload page (`/upload`)
A drag-and-drop interface for manual PDF upload. Multiple files at once is allowed. Each file shows its processing status as it goes through the pipeline.

### 8. Drive sync page (`/sync`)
A "Sync now" button that triggers the Google Drive scan. Below the button, a list of all PDFs found in the folder, with status: new (will be processed), already processed (skipped), or processing failed.

### 9. Audit log (`/audit`)
A simple chronological list of every action logged. Filters by entity type, action type, and date range.

## Critical design principles

1. **Hard checks are binary gates, not score inputs.** A bill that fails any critical check goes to review regardless of confidence score.
2. **Original extracted values are never overwritten.** When an admin edits a field, the original is preserved in the audit log.
3. **Every manual action is auditable.** Every status change, field edit, and configuration change writes to `audit_log`.
4. **The dashboard makes problems obvious.** Critical errors, missing invoices, and overdue bills are surfaced at the top, not buried in detail screens.
5. **Configurability over hardcoding.** Thresholds, the Drive folder URL, and the billing cycle day are all editable in the Settings page, never hardcoded.

## Sample bills

I will provide a set of example municipal bills (PDFs) for testing. These will include digital PDFs and scanned images from at least the City of Cape Town and possibly other municipalities. Build the system to handle variable layouts -- do not hardcode for any specific municipality's format. The extraction prompt should be designed to handle any South African municipal bill.

## Deliverables

1. A working Vercel-deployed application
2. A Supabase project with all tables created and seeded with default settings
3. A README explaining setup, environment variables, and how to run locally
4. The full source code in a GitHub-ready structure
5. A simple script or SQL file to initialize the database schema

## What to build first

Start by creating the database schema and the core extraction + validation pipeline. Once that works end to end for a single manually uploaded PDF, build out the dashboard views. The pipeline must work reliably before the UI is polished -- the dashboard is only useful if the data underneath it is trustworthy.

## Final notes

- Ask me clarifying questions before starting if anything in this brief is ambiguous.
- If you encounter a decision that materially changes the system architecture, flag it before implementing.
- Build with the assumption that this will be sold to multiple property management clients in the future -- avoid hardcoding anything client-specific.
- The Anthropic API is the core extraction engine. Spend extra effort on the extraction prompt and the two-pass comparison logic -- this is where quality matters most.
