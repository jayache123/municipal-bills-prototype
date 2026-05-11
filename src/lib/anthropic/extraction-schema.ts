/**
 * Tool input schema (JSON Schema) and matching TypeScript types for the
 * bill extraction tool. Claude is forced to call this tool, so its tool input
 * is guaranteed to satisfy this schema.
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

export type ExtractedLineItem = {
  line_order: number;
  section_label: string | null;
  property: ExtractedProperty | null;
  utility_category: UtilityCategory;
  line_type: LineType;
  description: string | null;
  amount: number | null;
  vat_rate: number | null;
  period_start: string | null;
  period_end: string | null;
  period_days: number | null;
  usage_value: number | null;
  usage_unit: string | null;
  rate: number | null;
  rate_unit: string | null;
  tariff_tier: number | null;
  base_value: number | null;
  meter_number: string | null;
  opening_meter_reading: number | null;
  closing_meter_reading: number | null;
  reading_type: ReadingType | null;
  prior_estimate_value: number | null;
  reconciliation_delta: number | null;
  confidence: number;
  notes: string | null;
};

export type ExtractedBill = {
  municipality_name: string | null;
  account_number: string | null;
  business_partner_number: string | null;
  customer_name: string | null;
  tax_invoice_number: string | null;
  primary_property: ExtractedProperty | null;
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
    line_order: { type: "integer", description: "Display order of this line on the bill, starting at 1." },
    section_label: { type: ["string", "null"], description: "The bill section heading verbatim (e.g. 'PROPERTY RATES', 'ELECTRICITY', 'SUNDRIES')." },
    property: { ...propertySchema, nullable: true },
    utility_category: { type: "string", enum: UTILITY_CATEGORIES },
    line_type: { type: "string", enum: LINE_TYPES },
    description: { type: ["string", "null"], description: "Verbatim description text from the bill." },
    amount: { type: ["number", "null"], description: "Rand amount. Negative for rebates, reversals, payments." },
    vat_rate: { type: ["number", "null"], description: "0, 15, or null. Cape Town: '&' = 15, '#' = 0." },
    period_start: { type: ["string", "null"], description: "YYYY-MM-DD; the period this charge covers." },
    period_end: { type: ["string", "null"] },
    period_days: { type: ["integer", "null"] },
    usage_value: { type: ["number", "null"], description: "Consumption volume for this line (e.g. 5.0 kl, 570 kWh)." },
    usage_unit: { type: ["string", "null"], description: "Unit string verbatim (e.g. 'kl', 'kWh')." },
    rate: { type: ["number", "null"], description: "Per-unit rate for this line." },
    rate_unit: { type: ["string", "null"], description: "Rate denomination (e.g. 'per kWh', 'per kl', 'per R of valuation')." },
    tariff_tier: { type: ["integer", "null"], description: "1 or 2 for stepped tariffs. Null otherwise." },
    base_value: { type: ["number", "null"], description: "For rates lines: the rateable valuation used in the calc." },
    meter_number: { type: ["string", "null"] },
    opening_meter_reading: { type: ["number", "null"] },
    closing_meter_reading: { type: ["number", "null"] },
    reading_type: { type: ["string", "null"], enum: [...READING_TYPES, null] },
    prior_estimate_value: { type: ["number", "null"] },
    reconciliation_delta: { type: ["number", "null"] },
    confidence: { type: "integer", minimum: 0, maximum: 100, description: "0-100 confidence in this line's correctness." },
    notes: { type: ["string", "null"] },
  },
  required: [
    "line_order", "section_label", "property", "utility_category", "line_type",
    "description", "amount", "vat_rate", "period_start", "period_end", "period_days",
    "usage_value", "usage_unit", "rate", "rate_unit", "tariff_tier", "base_value",
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
    billing_period_start: { type: ["string", "null"], description: "YYYY-MM-DD. The PROPERTY RATES period start (NOT the statement-to-due-date range)." },
    billing_period_end: { type: ["string", "null"], description: "YYYY-MM-DD. The PROPERTY RATES period end." },
    issue_date: { type: ["string", "null"] },
    due_date: { type: ["string", "null"] },
    previous_balance: { type: ["number", "null"] },
    payments_received: { type: ["number", "null"], description: "Total payments received during the period. Positive number (the bill shows it as 'Less payments' with a minus, but we store it positive)." },
    current_amount_due: { type: ["number", "null"], description: "Latest period charges before applying previous balance." },
    total_amount_due: { type: ["number", "null"], description: "The grand total liability the customer owes." },
    amount_payable_after_credits: { type: ["number", "null"] },
    total_vat: { type: ["number", "null"] },
    line_items: { type: "array", items: lineItemSchema },
    field_confidence: {
      type: "object",
      description: "Per-bill-field confidence map. Keys are field names (e.g. 'total_amount_due'), values are 0-100.",
      additionalProperties: { type: "integer", minimum: 0, maximum: 100 },
    },
    overall_confidence: { type: "integer", minimum: 0, maximum: 100 },
    notes: { type: ["string", "null"] },
  },
  required: [
    "municipality_name", "account_number", "business_partner_number", "customer_name",
    "tax_invoice_number", "primary_property", "billing_period_start", "billing_period_end",
    "issue_date", "due_date", "previous_balance", "payments_received", "current_amount_due",
    "total_amount_due", "amount_payable_after_credits", "total_vat", "line_items",
    "field_confidence", "overall_confidence", "notes",
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
