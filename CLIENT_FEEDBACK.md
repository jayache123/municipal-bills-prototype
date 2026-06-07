# Client Feedback

A running record of feedback gathered from clients and stakeholders about the Municipal Bills tool, grouped by meeting.

## How to use this file

**What this file is for:** capturing raw client and stakeholder feedback about the Municipal Bills tool so it is never lost and is always available to inform planning.

**What this file is NOT:** a plan. Feedback here does NOT translate directly into the roadmap, backlog, or any commitment. It is raw signal to keep in mind during the planning process. Planning decisions live elsewhere (DECISIONS.md, PROGRESS.md). When a piece of feedback does influence a decision, record that in those files, not here.

**How it is organised (two levels of categorisation):**

1. By client/company first (for example "Client: Daleglen"). All feedback from anyone at that organisation lives under its section.
2. By person and meeting within the client (for example "Xavier Badenhorst - 2026-06-04"). Newest meeting at the top within each client.

**Person versus company:** always record both the person and the company they represent, because they are usually different (an individual contact at an organisation). In some cases they may be the same (for example a sole trader who is the client). Do not assume. Check and confirm the person-to-company mapping (email domain, introduction, or how they describe themselves) and note it under the client's "Person vs company" line.

**Reading the feedback:** most of it comes from informal conversations with non-expert users. Treat each point as evidence of a real pain point, then decide separately (in planning) what, if anything, to act on.

**To add a new meeting:**

- If the client already has a section, add a new dated meeting entry under it (newest at top). If not, create a new "Client: <name>" section first, with a short client profile and the "Person vs company" line.
- Copy the entry structure below: meeting metadata, a short context summary, then itemised feedback. Reuse item IDs (A, B, C ...) only within a single meeting.

Per-item legend used below:

- **Signal:** what the person actually said (paraphrased, with key quotes).
- **Why it matters:** the underlying pain point or motivation.
- **Tool implication:** what it could mean for the product, if pursued.
- **Data + backend notes:** data-structure or backend considerations to keep in mind.
- **Current state:** what the prototype already does relative to this, where known.
- **Open questions:** what we would need to clarify before acting.

---

# Client: Daleglen

**Company:** Daleglen, a property management company (email domain daleglen.co.za). Note: the company name is also written "Dale Glen" / "Dale Glenn" in places; the registered domain is daleglen.co.za.
**Known contacts:** Xavier Badenhorst (xbadenhorst@daleglen.co.za). Other people referenced in conversations, to be confirmed: Mona (also heard as Monet/Mornay), Johnny, Tammy, Lynn (handles capturing and payments), Colin (releases payments).
**Person vs company:** Xavier is an individual contact at Daleglen, not a sole trader, so person and company are distinct. Confirmed via his daleglen.co.za email address.

---

## Xavier Badenhorst - 2026-06-04 - Demo of Municipal Bills Tool

**Source:** Granola note "Jon / Xavier - Demo of Municipal Bills Tool", 4 Jun 2026.
**Attendees:** Jonathan Ayache; Xavier Badenhorst (xbadenhorst@daleglen.co.za, Daleglen).
**Format:** Informal live demo of the working prototype. Single non-expert user reacting in the moment. Not a structured requirements session.

### Meeting context and sentiment

- Reaction was strongly positive ("this is exactly what I need", "this is something we must implement"). Xavier wants to proceed and to involve others.
- The demo showed the existing prototype: ingestion, extraction, per-bill review, properties, and the analysis view.
- Xavier repeatedly framed his own philosophy as: automate the routine, spend human time only on the outliers. He is comfortable with high automation because the payee is the municipality, so the worst case of overpayment is a credit, not a lost amount.

### Scope confirmations (useful boundaries)

- Geography: Western Cape only. City of Cape Town plus Paarl, Stellenbosch (and at least one more). Nothing outside the Western Cape.
- They are not looking to replace MRI (their property management system). The tool should add value around MRI and feed into it, not duplicate it.
- Bills are increasingly emailed (Cape Town is forcing email), but some are still posted.

### Next steps Xavier raised

- Wants Jonathan to come back and present to Mona and to Johnny (Johnny currently away) before deciding how to implement.
- Wants to discuss the commercial arrangement once others have seen it.
- Offered to provide real example bills, in particular multi-account buildings, to build and test against.

### Feedback items

#### A. Multi-account building grouping

- **Signal:** "We've got a building with 100 sections, so you get a hundred bills. It's one building. You can group them together because I just want to look at the total for the building." Most of their properties have 5 to 100 accounts.
- **Why it matters:** Their core unit of management is the building, not the individual account. The demo showed one bill per property, which does not match how they operate.
- **Tool implication:** A "building" grouping above accounts. Building owns many accounts; show a combined total; allow drill-down into any single account.
- **Data + backend notes:** Need a parent entity above the current account/property level, with a one-to-many to accounts. Check against the existing parent-child property hierarchy (parent_property_id already exists); may extend rather than create new.
- **Current state:** Schema already has parent-child property hierarchy and multi-unit handling; UI shows units under a parent. Gap is the building-as-primary-view and roll-up totals.
- **Open questions:** What defines a "building" for them (erf, physical building, their own grouping)? Can one account belong to more than one grouping? Should grouping be auto-derived from bills or set manually?

#### B. Building-level summary view and report

- **Signal:** "I'm unlikely to look at an invoice level. I'd look on a building level." Wants a sheet: building down one column, number of accounts, how many received, how many outstanding, when due, have they been paid.
- **Why it matters:** This is the view he would actually use day to day.
- **Tool implication:** A buildings list plus a per-building summary table with those columns.
- **Data + backend notes:** Requires aggregation across accounts per building, plus a payment/received status per bill to populate "received / outstanding / paid" (see K and L).
- **Current state:** Dashboard and bills list exist but are account/bill oriented, not building oriented.
- **Open questions:** Exact columns and grouping order. Confirm definitions: does "received" mean bill ingested, "outstanding" mean unpaid?

#### C. Exception and outlier reporting

- **Signal:** "As long as I can pull the exception reports." "I'd rather spend the time focusing on the outliers." Wants to spot a leak or someone tampering with a meter inside a building.
- **Why it matters:** Matches his automate-the-routine philosophy and the system's conservative, flag-for-review design.
- **Tool implication:** An exceptions-first view listing only flagged items across buildings/accounts.
- **Data + backend notes:** Depends on anomaly checks (variance vs baseline, missing bills, etc.).
- **Current state:** Hard checks and status routing exist. History-based checks (variance vs baseline) are deferred until 3+ bills per account exist (see PROGRESS.md).
- **Open questions:** Which exceptions matter most (spikes, arrears, estimates, missing bills)? What thresholds?

#### D. Estimates handling, consecutive estimates

- **Signal:** "You've only received estimates for the last six months." Caused by no meter access or a faulty meter.
- **Why it matters:** A run of estimates hides a true-up that can become a large surprise bill.
- **Tool implication:** Flag accounts with several consecutive estimated readings, not just a single estimate.
- **Data + backend notes:** Needs reading_type history per account and a rule for "N consecutive estimates."
- **Current state:** Analysis tab already distinguishes actual vs estimated (solid vs hollow markers) on sample data. Single-bill estimate warnings exist. Consecutive-estimate detection is not built.
- **Open questions:** How many consecutive estimates triggers a flag? Surface in the exceptions view, per-building, or both?

#### E. Prepaid account flag

- **Signal:** "I think the bottom of the account, it says whether it's a prepaid account."
- **Why it matters:** Prepaid accounts behave differently and may warrant different handling or checks.
- **Tool implication:** Capture and display a prepaid indicator on the account.
- **Data + backend notes:** New field on account/bill; extraction needs to read the prepaid marker.
- **Current state:** Not currently captured.
- **Open questions:** Does prepaid change which checks apply or how a bill routes? Where on the bill does the marker appear consistently?

#### F. Rates increase tracking and valuations

- **Signal:** "We recover a portion of rate increases every year. On the first of July, that's it." Was pleased the tool already pulls the property valuation from the rates bill.
- **Why it matters:** They bill tenants for a share of annual rates increases, so tracking the increase has direct financial value.
- **Tool implication:** Track rates/valuation changes over time per property and surface the annual increase.
- **Data + backend notes:** Need valuation and rates amounts captured per period and a year-over-year comparison.
- **Current state:** municipal_valuation is already captured from rates line items. Trend/increase tracking is not built.
- **Open questions:** Is the recovery based on the rand increase, the valuation change, or a tariff change? What output do they need (a report each July)?

#### G. Configurable views and metrics

- **Signal:** "Mona wants to look at the kilolitres. I want to look at the amount." "The visuals, what it looks like, is of minor importance" once the data exists.
- **Why it matters:** Different people in the business need different lenses on the same data.
- **Tool implication:** Toggle between rand value and usage (kL, kWh); potentially role-specific dashboards.
- **Data + backend notes:** Usage values per category are already needed for analysis; this is largely a front-end concern once the data exists.
- **Current state:** Analysis tab already charts both spend and usage (electricity/water/sewerage) on sample data.
- **Open questions:** Which metrics for which roles? Saved views per user?

#### H. Multiple municipalities (Western Cape)

- **Signal:** "Not outside the Western Cape. We've got Paarl, Stellenbosch." All Western Cape.
- **Why it matters:** Confirms scope and that the extractor must handle more than the Cape Town format.
- **Tool implication:** Sample data and extraction should reflect several Western Cape municipalities.
- **Data + backend notes:** The extraction prompt is already designed to generalise across SA municipal formats.
- **Current state:** Seed data is City of Cape Town only; extractor is format-agnostic by design.
- **Open questions:** Which municipalities to include in demo sample data? Any known format quirks per municipality?

#### I. Ingestion channels

- **Signal:** Bills increasingly emailed (Cape Town forcing email), but some still posted. Liked the idea of photographing posted bills and sending them via WhatsApp.
- **Why it matters:** Real intake is mixed: email plus paper.
- **Tool implication:** Auto-ingest from an email inbox; a WhatsApp/photo intake path with a quality check.
- **Data + backend notes:** Email inbox ingestion pipeline; WhatsApp intake; image-quality validation on scanned or photographed bills.
- **Current state:** Upload UI exists. Email auto-ingest and WhatsApp/photo are roadmap, not built. Scanned-PDF path is noted as untested in PROGRESS.md.
- **Open questions:** Is email auto-ingest in demo scope or roadmap only? How important is WhatsApp to the decision makers versus to Xavier personally?

#### J. Automation dial, auto-approve rules

- **Signal:** "We can dial up and down the automation." "If it was within 30% of last month, approve it." Favours more automation because "the risk is you end up with a credit."
- **Why it matters:** Their appetite is high automation with human attention reserved for outliers.
- **Tool implication:** Configurable auto-approve rules and thresholds, with a clear manual-review override.
- **Data + backend notes:** Rule engine reading thresholds; possible per-building or per-account overrides.
- **Current state:** Settings already include confidence thresholds, a 30% variance threshold, strict-mode warning blocking, and related options.
- **Open questions:** Which rules to expose in the UI versus keep fixed? Global, per municipality, or per building?

#### K. Payments: split CC/EFT, bank grouping, due dates

- **Signal:** Bills over R7,000 are split: first R7,000 by credit card via Easy Pay, balance by EFT. They pay from multiple bank accounts. Accounts are due on staggered dates (4th, 10th, 17th). They currently produce MRI and Easy Pay import files manually.
- **Why it matters:** This is a heavy manual process and a daily source of effort and error.
- **Tool implication:** Generate the required import files automatically (MRI format and Easy Pay format); group properties by paying bank; respect due-date batching.
- **Data + backend notes:** Need exact MRI and Easy Pay CSV formats; bank-account mapping per property; a configurable split rule (R7,000 threshold); payment-run grouping.
- **Current state:** Not built. Payments are deliberately out of the current prototype.
- **Open questions:** Obtain sample MRI and Easy Pay import file formats. Confirm the R7,000 rule and whether it varies. How are properties assigned to banks?

#### L. Payment confirmation loop and paid status

- **Signal:** Batches get loaded to the bank and sometimes sit unreleased (insufficient funds), then get forgotten or paid late, leaving opening balances that staff (Lynn) cannot reconcile. Wants a "paid" mark with a date and sign-off, and a payments tab.
- **Why it matters:** Closes the loop so the team knows what was actually paid, by whom, and when, without waiting for next month's invoice.
- **Tool implication:** A payments tab listing runs; mark-as-paid with date and signer; reflect paid status back into the building summary (B).
- **Data + backend notes:** Payment records linked to bills; status (loaded, released, paid); audit of who/when (audit_log already exists). Optionally import a bank payment-confirmation file.
- **Current state:** Not built.
- **Open questions:** Manual "mark paid + date" versus importing a payment-confirmation file? Who are the sign-off roles?

#### M. Proactive reporting and notifications

- **Signal:** "We can trigger an email, trigger a report. Send me a report before these are paid with this information."
- **Why it matters:** He wants to be pushed the exceptions, not have to go looking for them.
- **Tool implication:** Scheduled or triggered reports/emails, for example an exceptions report before each payment run.
- **Data + backend notes:** A reporting layer plus scheduling and email delivery.
- **Current state:** Not built.
- **Open questions:** What triggers (pre-payment-run, weekly, on anomaly)? Who receives what?

### Parked: adjacent opportunities (out of scope for this tool)

Captured only so they are not lost. Explicitly outside the bill tool itself.

- Own utility-recoveries / sub-metering business: reconcile sub-meter readings against the bulk municipal bill to catch under-recovery (the Sable Square undercharging example).
- Tenant interaction agents over WhatsApp for maintenance, new applications, and arrears collections.
- Bulk WhatsApp messaging for arrears (MRI only sends SMS, which tenants ignore).
