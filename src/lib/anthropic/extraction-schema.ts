/**
 * Tool input schema (JSON Schema) and matching TypeScript types for the
 * bill extraction tool. Claude is forced to call this tool, so its tool input
 * is guaranteed to satisfy this schema.
 *
 * Line items are section-level (one row per utility category), not sub-line
 * granular. The detailed breakdown (fixed/variable split, tier rates, reversal
 * context) goes into the line item's `notes` field as human-readable text.
 */

import type Anthropic from "@anthropic-ai/sdk";

export const UTILITY_CATEGORIES = [
  "rates",
  "electricity",
  "water",
  "refuse",
  "sewerage",
  "improvement_district",
  "sundry",
  "other",
] as const;

// With section-level extraction, line_type is almost always "charge".
// Keep the enum for edge cases (e.g. a credit/rebate-only section).
export const LINE_TYPES = [
  "charge",
  "rebate",
  "fixed_charge",
  "consumption_charge",
  "service_charge",
  "reversal",
  "subtotal",
  "informational",
] as const;

export const READING_TYPES = ["actual", "estimated", "not_applicable"] as const;
export const DOCUMENT_TYPES = ["municipal_bill", "not_a_bill"] as const;
export const SOURCE_TYPES = ["digital", "scanned", "unknown"] as const;

export type UtilityCategory = (typeof UTILITY_CATEGORIES)[number];
export type LineType = (typeof LINE_TYPES)[number];
export type ReadingType = (typeof READING_TYPES)[number];
export type DocumentType = (typeof DOCUMENT_TYPES)[number];
export type SourceType = (typeof SOURCE_TYPES)[number];

export type ExtractedProperty = {
  address: string | null;
  complex_name: string | null;
  unit_number: string | null;
  erf_number: string | null;
  suburb: string | null;
  postal_code: string | null;
};

/**
 * One row per utility section (rates, electricity, water, etc.).
 * `notes` carries the rich breakdown: fixed/variable split, tier rates,
 * reversal context, reading type, tariff details — everything the reviewer
 * needs to understand the charge without looking at sub-lines.
 */
export type ExtractedLineItem = {
  line_order: number;
  section_label: string | null;
  property: ExtractedProperty | null;
  utility_category: UtilityCategory;
  line_type: LineType;
  description: string | null;
  /** Net amount for this section after reversals. Negative for credit sections. */
  amount: number | null;
  vat_rate: number | null;
  /** Start date of the reading/billing period for this section (YYYY-MM-DD). */
  period_start: string | null;
  /** End date of the reading/billing period for this section (YYYY-MM-DD). */
  period_end: string | null;
  /** Number of days this section covers. */
  period_days: number | null;
  /** Net consumption for this section (after reversals). */
  usage_value: number | null;
  usage_unit: string | null;
  rate: number | null;
  rate_unit: string | null;
  /** For rates/CID: the municipal rateable valuation used in the calculation. */
  base_value: number | null;
  meter_number: string | null;
  opening_meter_reading: number | null;
  closing_meter_reading: number | null;
  reading_type: ReadingType | null;
  prior_estimate_value: number | null;
  reconciliation_delta: number | null;
  confidence: number;
  /**
   * Rich human-readable breakdown for this section. Include:
   * - Fixed vs variable split (e.g. "Fixed: R415.57 basic charge; Variable: 3 kL × R21.15")
   * - Tier breakdown for electricity (e.g. "Tier 1: 1,795 kWh @ R2.9362; Tier 2: 202 kWh @ R3.8423")
   * - Reversal context (e.g. "Includes reversal of prior estimate: −1,033 kWh / −R3,033.09")
   * - Rate basis for value-based charges (e.g. "R18,185,000 × 0.00716 ÷ 365 × 30 days")
   * - Reading type (Actual / Estimated)
   */
  notes: string | null;
};

export type ExtractedBill = {
  municipality_name: string | null;
  account_number: string | null;
  business_partner_number: string | null;
  customer_name: string | null;
  tax_invoice_number: string | null;
  primary_property: ExtractedProperty | null;
  /**
   * The canonical billing period month for this bill (YYYY-MM-DD, always the
   * 1st of the month). For City of Cape Town, this is the "Account Summary Month"
   * field printed on the bill. For other municipalities, derive from billing_period_end.
   */
  summary_month: string | null;
  billing_period_start: string | null;
  billing_period_end: string | null;
  issue_date: string | null;
  due_date: string | null;
  previous_balance: number | null;
  payments_received: number | null;
  current_amount_due: number | null;
  total_amount_due: number | null;
  amount_payable_after_credits: number | null;
  total_vat: number | null;
  line_items: ExtractedLineItem[];
  field_confidence: Record<string, number>;
  overall_confidence: number;
  /**
   * 2–5 analytical bullet points about this bill. Each string is one bullet.
   * Cover: unusual billing periods, estimate reversals and their impact,
   * meter reading period offsets, notable changes vs what is expected.
   * These are displayed to the reviewer as a "Bill Summary" section.
   */
  ai_summary: string[] | null;
  notes: string | null;
};

export type ExtractionResult = {
  document_type: DocumentType;
  source_type: SourceType;
  rejection_reason: string | null;
  bill: ExtractedBill | null;
};

const propertySchema = {
  type: "object",
  properties: {
    address: { type: ["string", "null"] },
    complex_name: { type: ["string", "null"] },
    unit_number: { type: ["string", "null"] },
    erf_number: { type: ["string", "null"] },
    suburb: { type: ["string", "null"] },
    postal_code: { type: ["string", "null"] },
  },
  required: ["address", "complex_name", "unit_number", "erf_number", "suburb", "postal_code"],
  additionalProperties: false,
} as const;

const lineItemSchema = {
  type: "object",
  properties: {
    line_order: { type: "integer", description: "Display order of this section, starting at 1." },
    section_label: { type: ["string", "null"], description: "The bill section heading verbatim (e.g. 'PROPERTY RATES', 'ELECTRICITY', 'SUNDRIES')." },
    property: { ...propertySchema, nullable: true },
    utility_category: { type: "string", enum: UTILITY_CATEGORIES, description: "Map to the closest known category. Use 'other' if nothing fits and put the exact charge name in description." },
    line_type: { type: "string", enum: LINE_TYPES, description: "Use 'charge' for normal sections. Use 'rebate' only if the entire section is a credit." },
    description: { type: ["string", "null"], description: "Section heading verbatim from the bill, or exact charge name for 'other' categories." },
    amount: { type: ["number", "null"], description: "Net rand amount for this section after reversals. Negative for credits." },
    vat_rate: { type: ["number", "null"], description: "0, 15, or null. Cape Town: '&' = 15, '#' = 0." },
    period_start: { type: ["string", "null"], description: "YYYY-MM-DD; start of reading/billing period for this section." },
    period_end: { type: ["string", "null"], description: "YYYY-MM-DD; end of reading/billing period for this section." },
    period_days: { type: ["integer", "null"], description: "Number of days this section covers." },
    usage_value: { type: ["number", "null"], description: "Net consumption for this section (after reversals). E.g. net kL, net kWh." },
    usage_unit: { type: ["string", "null"], description: "Unit string (e.g. 'kl', 'kWh')." },
    rate: { type: ["number", "null"], description: "Primary per-unit rate (for single-tier or the first tier). Null for fixed or value-based charges." },
    rate_unit: { type: ["string", "null"], description: "Rate denomination (e.g. 'per kWh', 'per kl')." },
    base_value: { type: ["number", "null"], description: "For rates/CID lines: the municipal rateable valuation (property value) used in the calculation." },
    meter_number: { type: ["string", "null"] },
    opening_meter_reading: { type: ["number", "null"] },
    closing_meter_reading: { type: ["number", "null"] },
    reading_type: { type: ["string", "null"], enum: [...READING_TYPES, null] },
    prior_estimate_value: { type: ["number", "null"], description: "If a reversal is included: the prior estimated consumption that was reversed." },
    reconciliation_delta: { type: ["number", "null"], description: "If a reversal is included: the rand value of the reversal (negative)." },
    confidence: { type: "integer", minimum: 0, maximum: 100 },
    notes: {
      type: ["string", "null"],
      description: "Rich breakdown: fixed/variable split, tier rates, reversal context, rate basis for value-based charges, reading type.",
    },
  },
  required: [
    "line_order", "section_label", "property", "utility_category", "line_type",
    "description", "amount", "vat_rate", "period_start", "period_end", "period_days",
    "usage_value", "usage_unit", "rate", "rate_unit", "base_value",
    "meter_number", "opening_meter_reading", "closing_meter_reading", "reading_type",
    "prior_estimate_value", "reconciliation_delta", "confidence", "notes",
  ],
  additionalProperties: false,
} as const;

const billSchema = {
  type: "object",
  properties: {
    municipality_name: { type: ["string", "null"] },
    account_number: { type: ["string", "null"], description: "9-digit municipal account number (Cape Town)." },
    business_partner_number: { type: ["string", "null"] },
    customer_name: { type: ["string", "null"] },
    tax_invoice_number: { type: ["string", "null"] },
    primary_property: { ...propertySchema, nullable: true },
    summary_month: {
      type: ["string", "null"],
      description: "YYYY-MM-DD (always the 1st of the month). For City of Cape Town: the 'Account Summary Month' field on the bill. For other municipalities: derive from billing_period_end. This is the canonical period used for filtering and deduplication.",
    },
    billing_period_start: { type: ["string", "null"], description: "YYYY-MM-DD. The PROPERTY RATES period start." },
    billing_period_end: { type: ["string", "null"], description: "YYYY-MM-DD. The PROPERTY RATES period end." },
    issue_date: { type: ["string", "null"], description: "The 'Account summary as at' date." },
    due_date: { type: ["string", "null"], description: "The 'Due date' or 'Payable by' date." },
    previous_balance: { type: ["number", "null"] },
    payments_received: { type: ["number", "null"], description: "Positive number even though bill shows it as a deduction." },
    current_amount_due: { type: ["number", "null"], description: "Latest period charges before applying previous balance." },
    total_amount_due: { type: ["number", "null"], description: "Grand total liability." },
    amount_payable_after_credits: { type: ["number", "null"] },
    total_vat: { type: ["number", "null"] },
    line_items: { type: "array", items: lineItemSchema },
    field_confidence: {
      type: "object",
      description: "Per-field confidence map (0-100).",
      additionalProperties: { type: "integer", minimum: 0, maximum: 100 },
    },
    overall_confidence: { type: "integer", minimum: 0, maximum: 100 },
    ai_summary: {
      type: ["array", "null"],
      items: { type: "string" },
      description: "2–5 analytical bullet strings for the reviewer. Cover: unusual billing periods, estimate reversals and rand impact, meter reading period offsets, notable changes.",
    },
    notes: { type: ["string", "null"] },
  },
  required: [
    "municipality_name", "account_number", "business_partner_number", "customer_name",
    "tax_invoice_number", "primary_property", "summary_month",
    "billing_period_start", "billing_period_end",
    "issue_date", "due_date", "previous_balance", "payments_received", "current_amount_due",
    "total_amount_due", "amount_payable_after_credits", "total_vat", "line_items",
    "field_confidence", "overall_confidence", "ai_summary", "notes",
  ],
  additionalProperties: false,
} as const;

export const extractionToolSchema: Anthropic.Tool.InputSchema = {
  type: "object",
  properties: {
    document_type: {
      type: "string",
      enum: DOCUMENT_TYPES,
      description: "Whether this PDF is actually a municipal bill or something else.",
    },
    source_type: {
      type: "string",
      enum: SOURCE_TYPES,
      description: "Whether the PDF is digital (text-embedded), scanned (image-based), or undetermined.",
    },
    rejection_reason: {
      type: ["string", "null"],
      description: "If document_type is 'not_a_bill', a short human-readable reason. Otherwise null.",
    },
    bill: {
      ...billSchema,
      nullable: true,
      description: "The extracted bill. Null only if document_type is 'not_a_bill'.",
    },
  },
  required: ["document_type", "source_type", "rejection_reason", "bill"],
  additionalProperties: false,
};

export const EXTRACTION_TOOL_NAME = "extract_municipal_bill";
