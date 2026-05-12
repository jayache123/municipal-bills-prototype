import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExtractedBill, ExtractedLineItem } from "../anthropic/extraction-schema";

export type CheckSeverity = "critical" | "warning" | "info";
export type BillStatus =
  | "expected"
  | "received"
  | "pending_review"
  | "reviewed"
  | "approved"
  | "queried"
  | "paid"
  | "overdue"
  | "not_applicable"
  | "hard_rejected";

export type CheckResult = {
  rule_name: string;
  field_name: string;
  severity: CheckSeverity;
  passed: boolean;
  extracted_value: string | null;
  message: string;
  /** Line order this result pertains to (mapped to a line_item_id at persist time). */
  line_order?: number;
};

export type ValidateBillResult = {
  bill_id: string;
  status: BillStatus;
  results: CheckResult[];
  errors_inserted: number;
  failed_critical: number;
  failed_warning: number;
  failed_info: number;
};

const FLOAT_EPSILON = 0.1; // 10 cents tolerance for sum/balance reconciliations.
const FIELD_CONFIDENCE_THRESHOLD = 80;

/**
 * Run all hard checks against an extracted bill (in memory), persist any
 * failures as bill_field_errors, and update the bill's status based on the
 * results combined with the configured thresholds.
 *
 * Variance- and history-based checks are deferred until we have more bill
 * history per property; this validator covers everything that can be assessed
 * from a single bill plus the settings table.
 */
export async function validateBill(
  supabase: SupabaseClient,
  args: {
    bill_id: string;
    bill: ExtractedBill;
    source_type: "digital" | "scanned" | "unknown";
  },
): Promise<ValidateBillResult> {
  const settings = await loadValidationSettings(supabase);
  const lineIdByOrder = await loadLineItemIdMap(supabase, args.bill_id);
  const existingErrors = await loadExistingErrors(supabase, args.bill_id);

  const results = runAllChecks(args.bill, args.source_type);

  // Persist failed checks as bill_field_errors. Passing checks are not stored
  // — only deviations are interesting downstream.
  const failed = results.filter((r) => !r.passed);
  const rows = failed.map((r) => ({
    bill_id: args.bill_id,
    line_item_id: r.line_order !== undefined ? (lineIdByOrder.get(r.line_order) ?? null) : null,
    field_name: r.field_name,
    rule_name: r.rule_name,
    severity: r.severity,
    extracted_value: r.extracted_value,
    message: r.message,
  }));
  if (rows.length > 0) {
    const { error } = await supabase.from("bill_field_errors").insert(rows);
    if (error) throw new Error(`Failed to insert validation errors: ${error.message}`);
  }

  // Status routing must consider BOTH the checks just run AND any errors that
  // already existed on the bill (e.g. property-match warnings inserted by save).
  const newStatus = decideStatus(args.bill.overall_confidence, results, existingErrors, settings);
  const { error: updateError } = await supabase
    .from("bills")
    .update({ status: newStatus })
    .eq("id", args.bill_id);
  if (updateError) throw new Error(`Failed to update bill status: ${updateError.message}`);

  const failed_critical = failed.filter((r) => r.severity === "critical").length;
  const failed_warning = failed.filter((r) => r.severity === "warning").length;
  const failed_info = failed.filter((r) => r.severity === "info").length;

  return {
    bill_id: args.bill_id,
    status: newStatus,
    results,
    errors_inserted: rows.length,
    failed_critical,
    failed_warning,
    failed_info,
  };
}

type ValidationSettings = {
  autoApproveThreshold: number;
  warningsBlockAutoApprove: boolean;
};

async function loadValidationSettings(supabase: SupabaseClient): Promise<ValidationSettings> {
  const { data, error } = await supabase
    .from("settings")
    .select("key, value")
    .in("key", ["confidence_threshold_auto_approve", "warnings_block_auto_approve"]);
  if (error) throw new Error(`Failed to load settings: ${error.message}`);
  const map = new Map((data ?? []).map((s) => [s.key, s.value] as const));
  return {
    autoApproveThreshold: Number(map.get("confidence_threshold_auto_approve") ?? 90),
    warningsBlockAutoApprove: (map.get("warnings_block_auto_approve") ?? "true") === "true",
  };
}

async function loadLineItemIdMap(
  supabase: SupabaseClient,
  bill_id: string,
): Promise<Map<number, string>> {
  const { data, error } = await supabase
    .from("bill_line_items")
    .select("id, line_order")
    .eq("bill_id", bill_id);
  if (error) throw new Error(`Failed to load line item ids: ${error.message}`);
  return new Map((data ?? []).map((r) => [r.line_order, r.id] as const));
}

type ExistingError = { severity: CheckSeverity; resolved: boolean };

async function loadExistingErrors(
  supabase: SupabaseClient,
  bill_id: string,
): Promise<ExistingError[]> {
  const { data, error } = await supabase
    .from("bill_field_errors")
    .select("severity, resolved")
    .eq("bill_id", bill_id);
  if (error) throw new Error(`Failed to load existing errors: ${error.message}`);
  return (data ?? []) as ExistingError[];
}

function decideStatus(
  overallConfidence: number,
  results: CheckResult[],
  existingErrors: ExistingError[],
  settings: ValidationSettings,
): BillStatus {
  const hasUnresolved = (sev: CheckSeverity): boolean =>
    results.some((r) => !r.passed && r.severity === sev) ||
    existingErrors.some((e) => e.severity === sev && !e.resolved);

  if (hasUnresolved("critical")) return "pending_review";
  if (settings.warningsBlockAutoApprove && hasUnresolved("warning")) return "pending_review";
  if (overallConfidence < settings.autoApproveThreshold) return "pending_review";
  return "approved";
}

// ---------- Check implementations ----------

function runAllChecks(bill: ExtractedBill, sourceType: string): CheckResult[] {
  return [
    ...checkLineItemSum(bill),
    ...checkVatSelfConsistency(bill),
    ...checkBalanceArithmetic(bill),
    ...checkPeriodOrdering(bill),
    ...checkDueDateOrdering(bill),
    ...checkMeterDirections(bill),
    ...checkLowConfidenceFields(bill),
    ...checkLowConfidenceLines(bill),
    ...checkScannedSource(sourceType),
  ];
}

function sumOfChargeAmounts(line_items: ExtractedLineItem[]): number {
  return line_items
    .filter((i) => i.line_type !== "informational" && i.line_type !== "subtotal" && i.amount !== null)
    .reduce((acc, i) => acc + (i.amount ?? 0), 0);
}

function checkLineItemSum(bill: ExtractedBill): CheckResult[] {
  if (bill.current_amount_due === null) return [];
  const sum = sumOfChargeAmounts(bill.line_items);
  const expected = sum + (bill.total_vat ?? 0);
  const diff = Math.abs(expected - bill.current_amount_due);
  const passed = diff < FLOAT_EPSILON;
  return [
    {
      rule_name: "line_item_sum",
      field_name: "current_amount_due",
      severity: "critical",
      passed,
      extracted_value: String(bill.current_amount_due),
      message: passed
        ? "Line items + VAT match current_amount_due."
        : `Sum of line items (R${sum.toFixed(2)}) + VAT (R${(bill.total_vat ?? 0).toFixed(2)}) = R${expected.toFixed(2)}, but current_amount_due = R${bill.current_amount_due.toFixed(2)}. Diff R${diff.toFixed(2)}.`,
    },
  ];
}

function checkVatSelfConsistency(bill: ExtractedBill): CheckResult[] {
  if (bill.total_vat === null) return [];
  const computed = bill.line_items
    .filter(
      (i) =>
        i.line_type !== "informational" &&
        i.line_type !== "subtotal" &&
        i.amount !== null &&
        i.vat_rate !== null &&
        i.vat_rate > 0,
    )
    .reduce((acc, i) => acc + (i.amount ?? 0) * ((i.vat_rate ?? 0) / 100), 0);
  const diff = Math.abs(computed - bill.total_vat);
  // Allow slightly larger tolerance for VAT due to rounding of each per-line VAT
  // contribution at the municipality's side.
  const passed = diff < 0.5;
  return [
    {
      rule_name: "vat_self_consistency",
      field_name: "total_vat",
      severity: "critical",
      passed,
      extracted_value: String(bill.total_vat),
      message: passed
        ? `Total VAT matches sum of per-line VAT (computed R${computed.toFixed(2)}, reported R${bill.total_vat.toFixed(2)}).`
        : `Computed VAT from line items = R${computed.toFixed(2)}, but total_vat = R${bill.total_vat.toFixed(2)}. Diff R${diff.toFixed(2)}.`,
    },
  ];
}

function checkBalanceArithmetic(bill: ExtractedBill): CheckResult[] {
  if (
    bill.previous_balance === null ||
    bill.payments_received === null ||
    bill.current_amount_due === null ||
    bill.total_amount_due === null
  ) {
    return [];
  }
  const expected = bill.previous_balance - bill.payments_received + bill.current_amount_due;
  const diff = Math.abs(expected - bill.total_amount_due);
  const passed = diff < FLOAT_EPSILON;
  return [
    {
      rule_name: "balance_arithmetic",
      field_name: "total_amount_due",
      severity: "critical",
      passed,
      extracted_value: String(bill.total_amount_due),
      message: passed
        ? "Previous balance minus payments plus current equals total."
        : `R${bill.previous_balance.toFixed(2)} − R${bill.payments_received.toFixed(2)} + R${bill.current_amount_due.toFixed(2)} = R${expected.toFixed(2)}, but total_amount_due = R${bill.total_amount_due.toFixed(2)}. Diff R${diff.toFixed(2)}.`,
    },
  ];
}

function checkPeriodOrdering(bill: ExtractedBill): CheckResult[] {
  if (!bill.billing_period_start || !bill.billing_period_end) return [];
  const passed = bill.billing_period_start < bill.billing_period_end;
  return [
    {
      rule_name: "period_ordering",
      field_name: "billing_period_end",
      severity: "critical",
      passed,
      extracted_value: bill.billing_period_end,
      message: passed
        ? "Billing period start precedes end."
        : `billing_period_start (${bill.billing_period_start}) is not before billing_period_end (${bill.billing_period_end}).`,
    },
  ];
}

function checkDueDateOrdering(bill: ExtractedBill): CheckResult[] {
  if (!bill.due_date || !bill.billing_period_end) return [];
  const passed = bill.due_date >= bill.billing_period_end;
  return [
    {
      rule_name: "due_date_after_period",
      field_name: "due_date",
      severity: "critical",
      passed,
      extracted_value: bill.due_date,
      message: passed
        ? "Due date is on or after the billing period end."
        : `due_date (${bill.due_date}) is before billing_period_end (${bill.billing_period_end}).`,
    },
  ];
}

function checkMeterDirections(bill: ExtractedBill): CheckResult[] {
  const results: CheckResult[] = [];
  for (const item of bill.line_items) {
    if (item.opening_meter_reading === null || item.closing_meter_reading === null) continue;
    const passed = item.closing_meter_reading >= item.opening_meter_reading;
    if (passed) continue;
    results.push({
      rule_name: "meter_direction",
      field_name: "closing_meter_reading",
      severity: "critical",
      passed: false,
      extracted_value: String(item.closing_meter_reading),
      message: `Closing reading (${item.closing_meter_reading}) is less than opening reading (${item.opening_meter_reading}) on line ${item.line_order}.`,
      line_order: item.line_order,
    });
  }
  return results;
}

function checkLowConfidenceFields(bill: ExtractedBill): CheckResult[] {
  const results: CheckResult[] = [];
  for (const [field, conf] of Object.entries(bill.field_confidence)) {
    if (conf >= FIELD_CONFIDENCE_THRESHOLD) continue;
    results.push({
      rule_name: "low_field_confidence",
      field_name: field,
      severity: "info",
      passed: false,
      extracted_value: String(conf),
      message: `Field confidence ${conf} is below threshold ${FIELD_CONFIDENCE_THRESHOLD}.`,
    });
  }
  return results;
}

function checkLowConfidenceLines(bill: ExtractedBill): CheckResult[] {
  const results: CheckResult[] = [];
  for (const item of bill.line_items) {
    if (item.confidence >= FIELD_CONFIDENCE_THRESHOLD) continue;
    results.push({
      rule_name: "low_line_confidence",
      field_name: `line_item[${item.line_order}]`,
      severity: "info",
      passed: false,
      extracted_value: String(item.confidence),
      message: `Line item ${item.line_order} confidence ${item.confidence} is below threshold ${FIELD_CONFIDENCE_THRESHOLD}.`,
      line_order: item.line_order,
    });
  }
  return results;
}

function checkScannedSource(sourceType: string): CheckResult[] {
  const passed = sourceType !== "scanned";
  return [
    {
      rule_name: "source_type_scanned",
      field_name: "source_type",
      severity: "info",
      passed,
      extracted_value: sourceType,
      message: passed
        ? "PDF is digital (text-embedded)."
        : "PDF appears to be a scan rather than digital text. Extraction is still possible but confidence may be lower.",
    },
  ];
}
