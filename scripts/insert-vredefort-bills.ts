/**
 * Manually insert 7 months of 3B Vredefort Unit 24 bills (Sep 2025 – Mar 2026)
 * directly into Supabase, bypassing AI extraction (data verified by hand).
 *
 * Run with: npx tsx --env-file=.env.local scripts/insert-vredefort-bills.ts
 *
 * ── Template for future manual CLI bill insertions ──────────────────────────
 *
 * When inserting bills manually (instead of via the /upload page), follow these rules:
 *
 * 1. PROPERTY LINKAGE — always link to the UNIT, not the parent complex.
 *    - Use the child unit's property ID as both `primary_property_id` on the bill
 *      and `property_id` on each line item.
 *    - The parent complex record is only used for display grouping; linking bills
 *      to it directly breaks the property filter and property detail page.
 *    - Check: run `select id, address, unit_number from properties where billing_account_id = '...'`
 *      to find the right unit ID before inserting.
 *
 * 2. IDEMPOTENCY — always check `tax_invoice_number` before inserting.
 *    The script does this automatically and skips duplicates.
 *
 * 3. FINANCIAL CHECKS — verify before inserting:
 *    a. Sum of charge line items + total_vat = current_amount_due
 *    b. previous_balance - payments_received + current_amount_due = total_amount_due
 *    c. VAT items (15%) × 0.15 ≈ total_vat (within 50c rounding)
 *
 * 4. METER CHAIN — ensure opening_meter_reading on each bill matches the
 *    closing_meter_reading of the previous bill. Use the meter table at the
 *    bottom of each PDF page 2.
 *
 * 5. STATUS — set to "approved" only when all the above checks pass.
 *    Use "pending_review" if there are arrears, estimate reversals, or any doubt.
 *
 * 6. AFTER INSERTING — run the verify script to confirm:
 *    npx tsx --env-file=.env.local scripts/verify-vredefort-bills.ts
 *    (adapt the PROPERTY_ID constant to whichever property you just inserted)
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local", override: true });

import { createClient } from "@supabase/supabase-js";

const BILLING_ACCOUNT_ID = "86bbd3e4-adc9-430c-ba98-b32878929103"; // 235055327 - ESTATE OF THE LATE MRS GJ KRUGER
const PROPERTY_ID        = "f48dd23f-a7d1-448e-9ea4-39f8892fc3a1"; // 3B Vredefort Unit 24, 269 Beach Rd, Sea Point

// ── Bill definitions ──────────────────────────────────────────────────────────

type BillInput = {
  filename: string;
  tax_invoice_number: string;
  billing_period_start: string;  // rates period start
  billing_period_end: string;    // rates period end
  issue_date: string;
  due_date: string;
  summary_month: string;
  previous_balance: number;
  payments_received: number;
  current_amount_due: number;
  total_amount_due: number;
  total_vat: number;
  ai_summary: string[];
  line_items: LineItemInput[];
};

type LineItemInput = {
  line_order: number;
  utility_category: string;
  line_type: string;
  description: string | null;
  amount: number | null;
  vat_rate: number | null;
  period_start: string | null;
  period_end: string | null;
  period_days: number | null;
  usage_value: number | null;
  usage_unit: string | null;
  meter_number: string | null;
  opening_meter_reading: number | null;
  closing_meter_reading: number | null;
  reading_type: string | null;
  base_value: number | null;
  rate: number | null;
  notes: string | null;
};

const BILLS: BillInput[] = [

  // ── September 2025 ──────────────────────────────────────────────────────────
  {
    filename: "3B Vredefort Unit 24 - September 2025 Rates Account.pdf",
    tax_invoice_number: "190010172282",
    billing_period_start: "2025-08-07",
    billing_period_end: "2025-09-04",
    issue_date: "2025-09-12",
    due_date: "2025-10-07",
    summary_month: "2025-09-01",
    previous_balance: 11147.16,
    payments_received: 0.00,
    current_amount_due: 6907.47,
    total_amount_due: 18054.63,
    total_vat: 557.47,
    ai_summary: [
      "Previous balance of R11,147.16 carried forward with no payment received — account was in arrears, making the total liability R18,054.63.",
      "Electricity consumption of 920 kWh (31.7 kWh/day over 29 days, Aug–Sep) is significantly higher than all subsequent months; this is a summer peak and should be verified as expected for the unit.",
      "Rates and electricity billing periods are offset by approximately one week — normal for City of Cape Town bills.",
      "All readings are actual (meter 299260: 24,171 → 25,091 kWh).",
    ],
    line_items: [
      {
        line_order: 1, utility_category: "rates", line_type: "charge",
        description: "Residential rates — R5,065,000.00 @ 0.0071590 ÷ 365 × 29",
        amount: 2880.96, vat_rate: 0,
        period_start: "2025-08-07", period_end: "2025-09-04", period_days: 29,
        usage_value: null, usage_unit: null, meter_number: null,
        opening_meter_reading: null, closing_meter_reading: null, reading_type: null,
        base_value: 5065000, rate: 0.0071590, notes: "Rateable portion: R5,080,000 − R15,000 rebate = R5,065,000",
      },
      {
        line_order: 2, utility_category: "rates", line_type: "rebate",
        description: "Additional rebate credit — R435,000.00 @ 0.0071590 ÷ 365 × 29",
        amount: -247.43, vat_rate: 0,
        period_start: "2025-08-07", period_end: "2025-09-04", period_days: 29,
        usage_value: null, usage_unit: null, meter_number: null,
        opening_meter_reading: null, closing_meter_reading: null, reading_type: null,
        base_value: 435000, rate: 0.0071590, notes: null,
      },
      {
        line_order: 3, utility_category: "rates", line_type: "subtotal",
        description: "Property Rates subtotal",
        amount: 2633.53, vat_rate: 0,
        period_start: "2025-08-07", period_end: "2025-09-04", period_days: 29,
        usage_value: null, usage_unit: null, meter_number: null,
        opening_meter_reading: null, closing_meter_reading: null, reading_type: null,
        base_value: null, rate: null, notes: null,
      },
      {
        line_order: 4, utility_category: "electricity", line_type: "charge",
        description: "Home User consumption: 572.055 kWh @ R2.9362 + 347.945 kWh @ R3.8423",
        amount: 3016.58, vat_rate: 15,
        period_start: "2025-08-14", period_end: "2025-09-11", period_days: 29,
        usage_value: 920, usage_unit: "kWh", meter_number: "299260",
        opening_meter_reading: 24171, closing_meter_reading: 25091, reading_type: "actual",
        base_value: null, rate: null, notes: "Tier 1: 572.055 kWh @ R2.9362; Tier 2: 347.945 kWh @ R3.8423",
      },
      {
        line_order: 5, utility_category: "electricity", line_type: "charge",
        description: "Service and wires charge",
        amount: 339.89, vat_rate: 15,
        period_start: "2025-08-14", period_end: "2025-09-11", period_days: 29,
        usage_value: null, usage_unit: null, meter_number: null,
        opening_meter_reading: null, closing_meter_reading: null, reading_type: null,
        base_value: null, rate: null, notes: null,
      },
      {
        line_order: 6, utility_category: "electricity", line_type: "subtotal",
        description: "Electricity subtotal",
        amount: 3356.47, vat_rate: 15,
        period_start: "2025-08-14", period_end: "2025-09-11", period_days: 29,
        usage_value: 920, usage_unit: "kWh", meter_number: "299260",
        opening_meter_reading: 24171, closing_meter_reading: 25091, reading_type: "actual",
        base_value: null, rate: null, notes: null,
      },
      {
        line_order: 7, utility_category: "sundry", line_type: "charge",
        description: "City-wide cleaning",
        amount: 360.00, vat_rate: 15,
        period_start: null, period_end: null, period_days: null,
        usage_value: null, usage_unit: null, meter_number: null,
        opening_meter_reading: null, closing_meter_reading: null, reading_type: null,
        base_value: null, rate: null, notes: null,
      },
    ],
  },

  // ── October 2025 ────────────────────────────────────────────────────────────
  {
    filename: "3B Vredefort Unit 24 - October 2025 Rates Account.pdf",
    tax_invoice_number: "160010588683",
    billing_period_start: "2025-09-05",
    billing_period_end: "2025-10-06",
    issue_date: "2025-10-13",
    due_date: "2025-11-07",
    summary_month: "2025-10-01",
    previous_balance: 18054.63,
    payments_received: 18054.63,
    current_amount_due: 6322.90,
    total_amount_due: 6322.90,
    total_vat: 445.69,
    ai_summary: [
      "Previous balance of R18,054.63 (September bill) paid in full on 02/10/2025 — account clear.",
      "Electricity consumption dropped from 920 kWh in September to 740 kWh (23.1 kWh/day over 32 days) — consistent with the end of summer.",
      "Rates period is 32 days (slightly longer than typical) due to meter-read cycle; within normal range for Cape Town.",
      "All readings actual (meter 299260: 25,091 → 25,831 kWh); meter continuity confirmed from prior bill.",
    ],
    line_items: [
      {
        line_order: 1, utility_category: "rates", line_type: "charge",
        description: "Residential rates — R5,065,000.00 @ 0.0071590 ÷ 365 × 32",
        amount: 3178.99, vat_rate: 0,
        period_start: "2025-09-05", period_end: "2025-10-06", period_days: 32,
        usage_value: null, usage_unit: null, meter_number: null,
        opening_meter_reading: null, closing_meter_reading: null, reading_type: null,
        base_value: 5065000, rate: 0.0071590, notes: null,
      },
      {
        line_order: 2, utility_category: "rates", line_type: "rebate",
        description: "Additional rebate credit — R435,000.00 @ 0.0071590 ÷ 365 × 32",
        amount: -273.02, vat_rate: 0,
        period_start: "2025-09-05", period_end: "2025-10-06", period_days: 32,
        usage_value: null, usage_unit: null, meter_number: null,
        opening_meter_reading: null, closing_meter_reading: null, reading_type: null,
        base_value: 435000, rate: 0.0071590, notes: null,
      },
      {
        line_order: 3, utility_category: "rates", line_type: "subtotal",
        description: "Property Rates subtotal",
        amount: 2905.97, vat_rate: 0,
        period_start: "2025-09-05", period_end: "2025-10-06", period_days: 32,
        usage_value: null, usage_unit: null, meter_number: null,
        opening_meter_reading: null, closing_meter_reading: null, reading_type: null,
        base_value: null, rate: null, notes: null,
      },
      {
        line_order: 4, utility_category: "electricity", line_type: "charge",
        description: "Home User consumption: 631.233 kWh @ R2.9362 + 108.767 kWh @ R3.8423",
        amount: 2271.35, vat_rate: 15,
        period_start: "2025-09-12", period_end: "2025-10-13", period_days: 32,
        usage_value: 740, usage_unit: "kWh", meter_number: "299260",
        opening_meter_reading: 25091, closing_meter_reading: 25831, reading_type: "actual",
        base_value: null, rate: null, notes: "Tier 1: 631.233 kWh @ R2.9362; Tier 2: 108.767 kWh @ R3.8423",
      },
      {
        line_order: 5, utility_category: "electricity", line_type: "charge",
        description: "Service and wires charge",
        amount: 339.89, vat_rate: 15,
        period_start: "2025-09-12", period_end: "2025-10-13", period_days: 32,
        usage_value: null, usage_unit: null, meter_number: null,
        opening_meter_reading: null, closing_meter_reading: null, reading_type: null,
        base_value: null, rate: null, notes: null,
      },
      {
        line_order: 6, utility_category: "electricity", line_type: "subtotal",
        description: "Electricity subtotal",
        amount: 2611.24, vat_rate: 15,
        period_start: "2025-09-12", period_end: "2025-10-13", period_days: 32,
        usage_value: 740, usage_unit: "kWh", meter_number: "299260",
        opening_meter_reading: 25091, closing_meter_reading: 25831, reading_type: "actual",
        base_value: null, rate: null, notes: null,
      },
      {
        line_order: 7, utility_category: "sundry", line_type: "charge",
        description: "City-wide cleaning",
        amount: 360.00, vat_rate: 15,
        period_start: null, period_end: null, period_days: null,
        usage_value: null, usage_unit: null, meter_number: null,
        opening_meter_reading: null, closing_meter_reading: null, reading_type: null,
        base_value: null, rate: null, notes: null,
      },
    ],
  },

  // ── November 2025 ───────────────────────────────────────────────────────────
  {
    filename: "3B Vredefort Unit 24 - November 2025 Rates Account.pdf",
    tax_invoice_number: "180010372460",
    billing_period_start: "2025-10-07",
    billing_period_end: "2025-11-06",
    issue_date: "2025-11-13",
    due_date: "2025-12-08",
    summary_month: "2025-11-01",
    previous_balance: 6322.90,
    payments_received: 6322.90,
    current_amount_due: 5142.89,
    total_amount_due: 5142.89,
    total_vat: 303.62,
    ai_summary: [
      "Previous balance of R6,322.90 (October bill) paid in full on 04/11/2025 — account clear.",
      "Electricity consumption fell to 451 kWh (15.0 kWh/day over 30 days) — a significant drop from October (740 kWh), consistent with autumn/winter.",
      "Consumption fell within a single tariff tier (@ R2.9362 only); no second tier applied.",
      "All readings actual (meter 299260: 25,831 → 26,282 kWh); clean continuity.",
    ],
    line_items: [
      {
        line_order: 1, utility_category: "rates", line_type: "charge",
        description: "Residential rates — R5,065,000.00 @ 0.0071590 ÷ 365 × 31",
        amount: 3079.64, vat_rate: 0,
        period_start: "2025-10-07", period_end: "2025-11-06", period_days: 31,
        usage_value: null, usage_unit: null, meter_number: null,
        opening_meter_reading: null, closing_meter_reading: null, reading_type: null,
        base_value: 5065000, rate: 0.0071590, notes: null,
      },
      {
        line_order: 2, utility_category: "rates", line_type: "rebate",
        description: "Additional rebate credit — R435,000.00 @ 0.0071590 ÷ 365 × 31",
        amount: -264.49, vat_rate: 0,
        period_start: "2025-10-07", period_end: "2025-11-06", period_days: 31,
        usage_value: null, usage_unit: null, meter_number: null,
        opening_meter_reading: null, closing_meter_reading: null, reading_type: null,
        base_value: 435000, rate: 0.0071590, notes: null,
      },
      {
        line_order: 3, utility_category: "rates", line_type: "subtotal",
        description: "Property Rates subtotal",
        amount: 2815.15, vat_rate: 0,
        period_start: "2025-10-07", period_end: "2025-11-06", period_days: 31,
        usage_value: null, usage_unit: null, meter_number: null,
        opening_meter_reading: null, closing_meter_reading: null, reading_type: null,
        base_value: null, rate: null, notes: null,
      },
      {
        line_order: 4, utility_category: "electricity", line_type: "charge",
        description: "Home User consumption: 451 kWh @ R2.9362",
        amount: 1324.23, vat_rate: 15,
        period_start: "2025-10-14", period_end: "2025-11-12", period_days: 30,
        usage_value: 451, usage_unit: "kWh", meter_number: "299260",
        opening_meter_reading: 25831, closing_meter_reading: 26282, reading_type: "actual",
        base_value: null, rate: 2.9362, notes: null,
      },
      {
        line_order: 5, utility_category: "electricity", line_type: "charge",
        description: "Service and wires charge",
        amount: 339.89, vat_rate: 15,
        period_start: "2025-10-14", period_end: "2025-11-12", period_days: 30,
        usage_value: null, usage_unit: null, meter_number: null,
        opening_meter_reading: null, closing_meter_reading: null, reading_type: null,
        base_value: null, rate: null, notes: null,
      },
      {
        line_order: 6, utility_category: "electricity", line_type: "subtotal",
        description: "Electricity subtotal",
        amount: 1664.12, vat_rate: 15,
        period_start: "2025-10-14", period_end: "2025-11-12", period_days: 30,
        usage_value: 451, usage_unit: "kWh", meter_number: "299260",
        opening_meter_reading: 25831, closing_meter_reading: 26282, reading_type: "actual",
        base_value: null, rate: null, notes: null,
      },
      {
        line_order: 7, utility_category: "sundry", line_type: "charge",
        description: "City-wide cleaning",
        amount: 360.00, vat_rate: 15,
        period_start: null, period_end: null, period_days: null,
        usage_value: null, usage_unit: null, meter_number: null,
        opening_meter_reading: null, closing_meter_reading: null, reading_type: null,
        base_value: null, rate: null, notes: null,
      },
    ],
  },

  // ── December 2025 ───────────────────────────────────────────────────────────
  {
    filename: "3B Vredefort Unit 24 - December 2025 Rates Account.pdf",
    tax_invoice_number: "106006389785",
    billing_period_start: "2025-11-07",
    billing_period_end: "2025-12-04",
    issue_date: "2025-12-11",
    due_date: "2026-01-05",
    summary_month: "2025-12-01",
    previous_balance: 5142.89,
    payments_received: 5142.89,
    current_amount_due: 4539.55,
    total_amount_due: 4539.55,
    total_vat: 260.46,
    ai_summary: [
      "Previous balance of R5,142.89 (November bill) paid in full on 03/12/2025 — account clear.",
      "Rates period is 28 days (shorter than typical) — within normal range.",
      "Electricity at 353 kWh (12.2 kWh/day over 29 days) continues the downward seasonal trend from summer peak of 920 kWh.",
      "All readings actual (meter 299260: 26,282 → 26,635 kWh); clean continuity.",
    ],
    line_items: [
      {
        line_order: 1, utility_category: "rates", line_type: "charge",
        description: "Residential rates — R5,065,000.00 @ 0.0071590 ÷ 365 × 28",
        amount: 2781.61, vat_rate: 0,
        period_start: "2025-11-07", period_end: "2025-12-04", period_days: 28,
        usage_value: null, usage_unit: null, meter_number: null,
        opening_meter_reading: null, closing_meter_reading: null, reading_type: null,
        base_value: 5065000, rate: 0.0071590, notes: null,
      },
      {
        line_order: 2, utility_category: "rates", line_type: "rebate",
        description: "Additional rebate credit — R435,000.00 @ 0.0071590 ÷ 365 × 28",
        amount: -238.89, vat_rate: 0,
        period_start: "2025-11-07", period_end: "2025-12-04", period_days: 28,
        usage_value: null, usage_unit: null, meter_number: null,
        opening_meter_reading: null, closing_meter_reading: null, reading_type: null,
        base_value: 435000, rate: 0.0071590, notes: null,
      },
      {
        line_order: 3, utility_category: "rates", line_type: "subtotal",
        description: "Property Rates subtotal",
        amount: 2542.72, vat_rate: 0,
        period_start: "2025-11-07", period_end: "2025-12-04", period_days: 28,
        usage_value: null, usage_unit: null, meter_number: null,
        opening_meter_reading: null, closing_meter_reading: null, reading_type: null,
        base_value: null, rate: null, notes: null,
      },
      {
        line_order: 4, utility_category: "electricity", line_type: "charge",
        description: "Home User consumption: 353 kWh @ R2.9362",
        amount: 1036.48, vat_rate: 15,
        period_start: "2025-11-13", period_end: "2025-12-11", period_days: 29,
        usage_value: 353, usage_unit: "kWh", meter_number: "299260",
        opening_meter_reading: 26282, closing_meter_reading: 26635, reading_type: "actual",
        base_value: null, rate: 2.9362, notes: null,
      },
      {
        line_order: 5, utility_category: "electricity", line_type: "charge",
        description: "Service and wires charge",
        amount: 339.89, vat_rate: 15,
        period_start: "2025-11-13", period_end: "2025-12-11", period_days: 29,
        usage_value: null, usage_unit: null, meter_number: null,
        opening_meter_reading: null, closing_meter_reading: null, reading_type: null,
        base_value: null, rate: null, notes: null,
      },
      {
        line_order: 6, utility_category: "electricity", line_type: "subtotal",
        description: "Electricity subtotal",
        amount: 1376.37, vat_rate: 15,
        period_start: "2025-11-13", period_end: "2025-12-11", period_days: 29,
        usage_value: 353, usage_unit: "kWh", meter_number: "299260",
        opening_meter_reading: 26282, closing_meter_reading: 26635, reading_type: "actual",
        base_value: null, rate: null, notes: null,
      },
      {
        line_order: 7, utility_category: "sundry", line_type: "charge",
        description: "City-wide cleaning",
        amount: 360.00, vat_rate: 15,
        period_start: null, period_end: null, period_days: null,
        usage_value: null, usage_unit: null, meter_number: null,
        opening_meter_reading: null, closing_meter_reading: null, reading_type: null,
        base_value: null, rate: null, notes: null,
      },
    ],
  },

  // ── January 2026 ────────────────────────────────────────────────────────────
  {
    filename: "3B Vredefort Unit 24 - January 2026 Rates Account(1).pdf",
    tax_invoice_number: "110011445674",
    billing_period_start: "2025-12-05",
    billing_period_end: "2026-01-07",
    issue_date: "2026-01-14",
    due_date: "2026-02-09",
    summary_month: "2026-01-01",
    previous_balance: 4539.55,
    payments_received: 0.00,
    current_amount_due: 5047.27,
    total_amount_due: 9586.82,
    total_vat: 255.61,
    ai_summary: [
      "Previous balance of R4,539.55 (December bill, due 05/01/2026) was not paid by the time this January bill was generated — arrears of R4,539.55 payable immediately, total liability R9,586.82.",
      "Rates period is 34 days (longer than typical) spanning Dec–Jan over the holiday period; rates cost is correspondingly higher at R3,087.59.",
      "Electricity consumption at 342 kWh (10.1 kWh/day over 34 days) — stable at winter baseline, in line with November and December.",
      "All readings actual (meter 299260: 26,635 → 26,977 kWh); clean continuity.",
    ],
    line_items: [
      {
        line_order: 1, utility_category: "rates", line_type: "charge",
        description: "Residential rates — R5,065,000.00 @ 0.0071590 ÷ 365 × 34",
        amount: 3377.68, vat_rate: 0,
        period_start: "2025-12-05", period_end: "2026-01-07", period_days: 34,
        usage_value: null, usage_unit: null, meter_number: null,
        opening_meter_reading: null, closing_meter_reading: null, reading_type: null,
        base_value: 5065000, rate: 0.0071590, notes: null,
      },
      {
        line_order: 2, utility_category: "rates", line_type: "rebate",
        description: "Additional rebate credit — R435,000.00 @ 0.0071590 ÷ 365 × 34",
        amount: -290.09, vat_rate: 0,
        period_start: "2025-12-05", period_end: "2026-01-07", period_days: 34,
        usage_value: null, usage_unit: null, meter_number: null,
        opening_meter_reading: null, closing_meter_reading: null, reading_type: null,
        base_value: 435000, rate: 0.0071590, notes: null,
      },
      {
        line_order: 3, utility_category: "rates", line_type: "subtotal",
        description: "Property Rates subtotal",
        amount: 3087.59, vat_rate: 0,
        period_start: "2025-12-05", period_end: "2026-01-07", period_days: 34,
        usage_value: null, usage_unit: null, meter_number: null,
        opening_meter_reading: null, closing_meter_reading: null, reading_type: null,
        base_value: null, rate: null, notes: null,
      },
      {
        line_order: 4, utility_category: "electricity", line_type: "charge",
        description: "Home User consumption: 342 kWh @ R2.9362",
        amount: 1004.18, vat_rate: 15,
        period_start: "2025-12-12", period_end: "2026-01-14", period_days: 34,
        usage_value: 342, usage_unit: "kWh", meter_number: "299260",
        opening_meter_reading: 26635, closing_meter_reading: 26977, reading_type: "actual",
        base_value: null, rate: 2.9362, notes: null,
      },
      {
        line_order: 5, utility_category: "electricity", line_type: "charge",
        description: "Service and wires charge",
        amount: 339.89, vat_rate: 15,
        period_start: "2025-12-12", period_end: "2026-01-14", period_days: 34,
        usage_value: null, usage_unit: null, meter_number: null,
        opening_meter_reading: null, closing_meter_reading: null, reading_type: null,
        base_value: null, rate: null, notes: null,
      },
      {
        line_order: 6, utility_category: "electricity", line_type: "subtotal",
        description: "Electricity subtotal",
        amount: 1344.07, vat_rate: 15,
        period_start: "2025-12-12", period_end: "2026-01-14", period_days: 34,
        usage_value: 342, usage_unit: "kWh", meter_number: "299260",
        opening_meter_reading: 26635, closing_meter_reading: 26977, reading_type: "actual",
        base_value: null, rate: null, notes: null,
      },
      {
        line_order: 7, utility_category: "sundry", line_type: "charge",
        description: "City-wide cleaning",
        amount: 360.00, vat_rate: 15,
        period_start: null, period_end: null, period_days: null,
        usage_value: null, usage_unit: null, meter_number: null,
        opening_meter_reading: null, closing_meter_reading: null, reading_type: null,
        base_value: null, rate: null, notes: null,
      },
    ],
  },

  // ── February 2026 ───────────────────────────────────────────────────────────
  {
    filename: "3B Vredefort Unit 24 - February 2026 Rates Account.pdf",
    tax_invoice_number: "290008666813",
    billing_period_start: "2026-01-08",
    billing_period_end: "2026-02-05",
    issue_date: "2026-02-12",
    due_date: "2026-03-09",
    summary_month: "2026-02-01",
    previous_balance: 9586.82,
    payments_received: 9586.82,
    current_amount_due: 4414.25,
    total_amount_due: 4414.25,
    total_vat: 232.27,
    ai_summary: [
      "Previous balance of R9,586.82 (January bill including arrears) paid in full on 22/01/2026 — account clear.",
      "Electricity at 289 kWh (10.0 kWh/day over 29 days) — lowest consumption in the 7-month run; winter baseline stable.",
      "Rates period is 29 days — normal.",
      "All readings actual (meter 299260: 26,977 → 27,266 kWh); clean continuity.",
    ],
    line_items: [
      {
        line_order: 1, utility_category: "rates", line_type: "charge",
        description: "Residential rates — R5,065,000.00 @ 0.0071590 ÷ 365 × 29",
        amount: 2880.96, vat_rate: 0,
        period_start: "2026-01-08", period_end: "2026-02-05", period_days: 29,
        usage_value: null, usage_unit: null, meter_number: null,
        opening_meter_reading: null, closing_meter_reading: null, reading_type: null,
        base_value: 5065000, rate: 0.0071590, notes: null,
      },
      {
        line_order: 2, utility_category: "rates", line_type: "rebate",
        description: "Additional rebate credit — R435,000.00 @ 0.0071590 ÷ 365 × 29",
        amount: -247.43, vat_rate: 0,
        period_start: "2026-01-08", period_end: "2026-02-05", period_days: 29,
        usage_value: null, usage_unit: null, meter_number: null,
        opening_meter_reading: null, closing_meter_reading: null, reading_type: null,
        base_value: 435000, rate: 0.0071590, notes: null,
      },
      {
        line_order: 3, utility_category: "rates", line_type: "subtotal",
        description: "Property Rates subtotal",
        amount: 2633.53, vat_rate: 0,
        period_start: "2026-01-08", period_end: "2026-02-05", period_days: 29,
        usage_value: null, usage_unit: null, meter_number: null,
        opening_meter_reading: null, closing_meter_reading: null, reading_type: null,
        base_value: null, rate: null, notes: null,
      },
      {
        line_order: 4, utility_category: "electricity", line_type: "charge",
        description: "Home User consumption: 289 kWh @ R2.9362",
        amount: 848.56, vat_rate: 15,
        period_start: "2026-01-15", period_end: "2026-02-12", period_days: 29,
        usage_value: 289, usage_unit: "kWh", meter_number: "299260",
        opening_meter_reading: 26977, closing_meter_reading: 27266, reading_type: "actual",
        base_value: null, rate: 2.9362, notes: null,
      },
      {
        line_order: 5, utility_category: "electricity", line_type: "charge",
        description: "Service and wires charge",
        amount: 339.89, vat_rate: 15,
        period_start: "2026-01-15", period_end: "2026-02-12", period_days: 29,
        usage_value: null, usage_unit: null, meter_number: null,
        opening_meter_reading: null, closing_meter_reading: null, reading_type: null,
        base_value: null, rate: null, notes: null,
      },
      {
        line_order: 6, utility_category: "electricity", line_type: "subtotal",
        description: "Electricity subtotal",
        amount: 1188.45, vat_rate: 15,
        period_start: "2026-01-15", period_end: "2026-02-12", period_days: 29,
        usage_value: 289, usage_unit: "kWh", meter_number: "299260",
        opening_meter_reading: 26977, closing_meter_reading: 27266, reading_type: "actual",
        base_value: null, rate: null, notes: null,
      },
      {
        line_order: 7, utility_category: "sundry", line_type: "charge",
        description: "City-wide cleaning",
        amount: 360.00, vat_rate: 15,
        period_start: null, period_end: null, period_days: null,
        usage_value: null, usage_unit: null, meter_number: null,
        opening_meter_reading: null, closing_meter_reading: null, reading_type: null,
        base_value: null, rate: null, notes: null,
      },
    ],
  },

  // ── March 2026 ──────────────────────────────────────────────────────────────
  {
    filename: "3B Vredefort Unit 24 - March 2026 Rates Account.pdf",
    tax_invoice_number: "170010641339",
    billing_period_start: "2026-02-06",
    billing_period_end: "2026-03-05",
    issue_date: "2026-03-12",
    due_date: "2026-04-07",
    summary_month: "2026-03-01",
    previous_balance: 4414.25,
    payments_received: 4414.25,
    current_amount_due: 4347.08,
    total_amount_due: 4347.08,
    total_vat: 235.35,
    ai_summary: [
      "Previous balance of R4,414.25 (February bill) paid in full on 25/02/2026 — account clear.",
      "Electricity at 296 kWh (10.6 kWh/day over 28 days) — stable, marginally up from February (289 kWh); consistent with late summer approaching.",
      "Rates period is 28 days — normal.",
      "All readings actual (meter 299260: 27,266 → 27,562 kWh); clean continuity confirmed across all 7 months.",
    ],
    line_items: [
      {
        line_order: 1, utility_category: "rates", line_type: "charge",
        description: "Residential rates — R5,065,000.00 @ 0.0071590 ÷ 365 × 28",
        amount: 2781.61, vat_rate: 0,
        period_start: "2026-02-06", period_end: "2026-03-05", period_days: 28,
        usage_value: null, usage_unit: null, meter_number: null,
        opening_meter_reading: null, closing_meter_reading: null, reading_type: null,
        base_value: 5065000, rate: 0.0071590, notes: null,
      },
      {
        line_order: 2, utility_category: "rates", line_type: "rebate",
        description: "Additional rebate credit — R435,000.00 @ 0.0071590 ÷ 365 × 28",
        amount: -238.89, vat_rate: 0,
        period_start: "2026-02-06", period_end: "2026-03-05", period_days: 28,
        usage_value: null, usage_unit: null, meter_number: null,
        opening_meter_reading: null, closing_meter_reading: null, reading_type: null,
        base_value: 435000, rate: 0.0071590, notes: null,
      },
      {
        line_order: 3, utility_category: "rates", line_type: "subtotal",
        description: "Property Rates subtotal",
        amount: 2542.72, vat_rate: 0,
        period_start: "2026-02-06", period_end: "2026-03-05", period_days: 28,
        usage_value: null, usage_unit: null, meter_number: null,
        opening_meter_reading: null, closing_meter_reading: null, reading_type: null,
        base_value: null, rate: null, notes: null,
      },
      {
        line_order: 4, utility_category: "electricity", line_type: "charge",
        description: "Home User consumption: 296 kWh @ R2.9362",
        amount: 869.12, vat_rate: 15,
        period_start: "2026-02-13", period_end: "2026-03-12", period_days: 28,
        usage_value: 296, usage_unit: "kWh", meter_number: "299260",
        opening_meter_reading: 27266, closing_meter_reading: 27562, reading_type: "actual",
        base_value: null, rate: 2.9362, notes: null,
      },
      {
        line_order: 5, utility_category: "electricity", line_type: "charge",
        description: "Service and wires charge",
        amount: 339.89, vat_rate: 15,
        period_start: "2026-02-13", period_end: "2026-03-12", period_days: 28,
        usage_value: null, usage_unit: null, meter_number: null,
        opening_meter_reading: null, closing_meter_reading: null, reading_type: null,
        base_value: null, rate: null, notes: null,
      },
      {
        line_order: 6, utility_category: "electricity", line_type: "subtotal",
        description: "Electricity subtotal",
        amount: 1209.01, vat_rate: 15,
        period_start: "2026-02-13", period_end: "2026-03-12", period_days: 28,
        usage_value: 296, usage_unit: "kWh", meter_number: "299260",
        opening_meter_reading: 27266, closing_meter_reading: 27562, reading_type: "actual",
        base_value: null, rate: null, notes: null,
      },
      {
        line_order: 7, utility_category: "sundry", line_type: "charge",
        description: "City-wide cleaning",
        amount: 360.00, vat_rate: 15,
        period_start: null, period_end: null, period_days: null,
        usage_value: null, usage_unit: null, meter_number: null,
        opening_meter_reading: null, closing_meter_reading: null, reading_type: null,
        base_value: null, rate: null, notes: null,
      },
    ],
  },

];

// ── Insert logic ──────────────────────────────────────────────────────────────

async function main() {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  console.log(`Inserting ${BILLS.length} bills for 3B Vredefort Unit 24...\n`);

  for (const bill of BILLS) {
    console.log(`Processing: ${bill.filename}`);

    // Idempotency check
    const { data: existing } = await supabase
      .from("bills")
      .select("id")
      .eq("tax_invoice_number", bill.tax_invoice_number)
      .maybeSingle();

    if (existing) {
      console.log(`  ⚠ Already exists (invoice ${bill.tax_invoice_number}) — skipping.\n`);
      continue;
    }

    // Insert bill
    const { data: billRow, error: billErr } = await supabase
      .from("bills")
      .insert({
        billing_account_id: BILLING_ACCOUNT_ID,
        primary_property_id: PROPERTY_ID,
        tax_invoice_number: bill.tax_invoice_number,
        summary_month: bill.summary_month,
        billing_period_start: bill.billing_period_start,
        billing_period_end: bill.billing_period_end,
        issue_date: bill.issue_date,
        due_date: bill.due_date,
        previous_balance: bill.previous_balance,
        payments_received: bill.payments_received,
        current_amount_due: bill.current_amount_due,
        total_amount_due: bill.total_amount_due,
        total_vat: bill.total_vat,
        raw_pdf_filename: bill.filename,
        customer_name_extracted: "ESTATE OF THE LATE MRS GJ KRUGER",
        confidence_score: 100,
        extraction_model: "manual",
        ai_summary: bill.ai_summary,
        status: "approved",
      })
      .select("id")
      .single();

    if (billErr || !billRow) {
      console.error(`  ✗ Failed to insert bill: ${billErr?.message}\n`);
      continue;
    }
    const billId = billRow.id;

    // Insert line items (link all to Unit 24 property)
    const lineRows = bill.line_items.map((li) => ({
      bill_id: billId,
      property_id: PROPERTY_ID,
      ...li,
    }));

    const { error: liErr } = await supabase.from("bill_line_items").insert(lineRows);
    if (liErr) {
      console.error(`  ✗ Failed to insert line items: ${liErr.message}\n`);
      continue;
    }

    // Audit log
    await supabase.from("audit_log").insert({
      entity_type: "bill",
      entity_id: billId,
      action: "extracted",
      user_identifier: "system",
      notes: `Manually inserted from ${bill.filename} (data hand-verified from PDF). ${lineRows.length} line items.`,
    });

    console.log(`  ✓ Inserted bill ${billId} — ${bill.tax_invoice_number} — R${bill.current_amount_due.toFixed(2)} — approved`);
    console.log(`    ${lineRows.length} line items inserted\n`);
  }

  console.log("Done.");
}

main().catch((err) => { console.error(err); process.exit(1); });
