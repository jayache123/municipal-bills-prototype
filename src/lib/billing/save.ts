import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ExtractedProperty,
  ExtractionResult,
} from "../anthropic/extraction-schema";
import type { MatchResult, PropertyDecision } from "./match";
import { propertyIdentityKey } from "./match";

export type SaveBillArgs = {
  extraction: ExtractionResult;
  match: MatchResult;
  /** Storage path returned by uploadBillPdf(). Stored verbatim on bills.raw_pdf_url. */
  rawPdfUrl: string | null;
  rawPdfFilename: string | null;
  /** Anthropic model used for extraction (recorded on the bill). */
  extractionModel: string;
  /**
   * If true and a bill with the same tax_invoice_number already exists,
   * delete the existing bill (and its cascading line items / errors / audit
   * entries) before re-inserting. Useful for iteration.
   */
  force?: boolean;
};

export type SaveBillResult = {
  bill_id: string;
  was_already_saved: boolean;
  entities_created: {
    municipality: boolean;
    billing_account: boolean;
    properties: number;
  };
  line_items_inserted: number;
  warnings_inserted: number;
};

/**
 * Persist an extracted bill into Supabase.
 *
 *  - Creates missing entities (municipality / billing account / properties)
 *    where the match step said "needs create".
 *  - Inserts the bill row with status = "pending_review" (real status
 *    routing happens in Step 5 after hard checks).
 *  - Inserts all line items with the correct property linkage.
 *  - Records matching warnings as bill_field_errors (severity = warning).
 *  - Writes one audit_log entry summarising the extraction action.
 *
 * Idempotency: if a bill with the same tax_invoice_number exists and
 * `force` is false, returns the existing bill's id without re-inserting.
 *
 * Failure mode: throws on any DB error. Partial state may exist after a
 * failure (no transaction is used). Use the cleanup script to reset.
 */
export async function saveExtractedBill(
  supabase: SupabaseClient,
  args: SaveBillArgs,
): Promise<SaveBillResult> {
  if (args.extraction.document_type !== "municipal_bill" || !args.extraction.bill) {
    throw new Error("saveExtractedBill called on a non-bill document.");
  }
  const bill = args.extraction.bill;

  // Required-fields guard. The schema enforces NOT NULL on these.
  if (!bill.municipality_name) throw new Error("Cannot save: bill.municipality_name is null.");
  if (!bill.account_number) throw new Error("Cannot save: bill.account_number is null.");

  // 1. Idempotency check on tax_invoice_number.
  if (bill.tax_invoice_number) {
    const { data: existing, error } = await supabase
      .from("bills")
      .select("id")
      .eq("tax_invoice_number", bill.tax_invoice_number)
      .maybeSingle();
    if (error) throw new Error(`Idempotency check failed: ${error.message}`);
    if (existing) {
      if (!args.force) {
        return {
          bill_id: existing.id,
          was_already_saved: true,
          entities_created: { municipality: false, billing_account: false, properties: 0 },
          line_items_inserted: 0,
          warnings_inserted: 0,
        };
      }
      const { error: delError } = await supabase.from("bills").delete().eq("id", existing.id);
      if (delError) throw new Error(`Failed to delete existing bill for force-replace: ${delError.message}`);
    }
  }

  // 2. Resolve municipality.
  let municipalityId = args.match.municipality.id;
  let municipalityCreated = false;
  if (!municipalityId) {
    const { data, error } = await supabase
      .from("municipalities")
      .insert({ name: bill.municipality_name })
      .select("id")
      .single();
    if (error || !data) throw new Error(`Failed to create municipality: ${error?.message}`);
    municipalityId = data.id;
    municipalityCreated = true;
  }

  // 3. Resolve billing account.
  let billingAccountId = args.match.billing_account.id;
  let billingAccountCreated = false;
  if (!billingAccountId) {
    const { data, error } = await supabase
      .from("billing_accounts")
      .insert({
        municipality_id: municipalityId,
        account_number: bill.account_number,
        business_partner_number: bill.business_partner_number,
        customer_name: bill.customer_name,
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(`Failed to create billing account: ${error?.message}`);
    billingAccountId = data.id;
    billingAccountCreated = true;
  }

  // 4. Collect unique properties needing creation (from primary + per-line decisions).
  const propertiesToCreate = new Map<string, ExtractedProperty>();
  const considerProperty = (decision: PropertyDecision | null) => {
    if (!decision || decision.matched) return;
    const key = propertyIdentityKey(decision.extracted);
    if (!propertiesToCreate.has(key)) propertiesToCreate.set(key, decision.extracted);
  };
  considerProperty(args.match.primary_property);
  for (const lip of args.match.line_item_properties) considerProperty(lip.decision);

  // Batch-insert new properties.
  const createdIdByKey = new Map<string, string>();
  if (propertiesToCreate.size > 0) {
    const rows = Array.from(propertiesToCreate.values()).map((p) => ({
      billing_account_id: billingAccountId,
      address: p.address ?? "(unknown)",
      complex_name: p.complex_name,
      unit_number: p.unit_number,
      erf_number: p.erf_number,
      suburb: p.suburb,
      postal_code: p.postal_code,
    }));
    const { data: created, error } = await supabase
      .from("properties")
      .insert(rows)
      .select("id, address, complex_name, unit_number, erf_number, suburb, postal_code");
    if (error || !created) throw new Error(`Failed to create properties: ${error?.message}`);
    for (const np of created) {
      const key = propertyIdentityKey(np as ExtractedProperty);
      createdIdByKey.set(key, np.id);
    }
  }

  // Helper to resolve any property decision to a final property_id (or null).
  const resolvePropertyId = (decision: PropertyDecision | null): string | null => {
    if (!decision) return null;
    if (decision.matched) return decision.id;
    const key = propertyIdentityKey(decision.extracted);
    return createdIdByKey.get(key) ?? null;
  };

  const primaryPropertyId = resolvePropertyId(args.match.primary_property);

  // Build the line-order → property-decision map early (used in 4b, 4c, and 6).
  const lipByLineOrder = new Map<number, PropertyDecision>();
  for (const lip of args.match.line_item_properties) lipByLineOrder.set(lip.line_order, lip.decision);

  // 4b. For multi-unit bills: ensure a parent property exists for the complex and
  //     link each unit's parent_property_id to it. A multi-unit bill is detected
  //     when the same billing account has multiple properties with unit numbers
  //     under the same complex_name + address.
  if (billingAccountId) {
    await ensureParentProperties(supabase, billingAccountId, bill.line_items
      .filter((li) => li.property?.unit_number)
      .map((li) => li.property!)
    );
  }

  // 4c. Update municipal_valuation on property records from rates line items.
  //     The base_value on a rates line is the rateable valuation for that property.
  for (const item of bill.line_items) {
    if (item.utility_category !== "rates" && item.utility_category !== "improvement_district") continue;
    if (!item.base_value) continue;
    const propertyId = resolvePropertyId(
      lipByLineOrder.get(item.line_order) ?? args.match.primary_property
    );
    if (!propertyId) continue;
    await supabase
      .from("properties")
      .update({ municipal_valuation: item.base_value })
      .eq("id", propertyId);
  }

  // 5. Insert the bill row.
  const { data: billRow, error: billError } = await supabase
    .from("bills")
    .insert({
      billing_account_id: billingAccountId,
      primary_property_id: primaryPropertyId,
      tax_invoice_number: bill.tax_invoice_number,
      summary_month: bill.summary_month,
      billing_period_start: bill.billing_period_start,
      billing_period_end: bill.billing_period_end,
      issue_date: bill.issue_date,
      due_date: bill.due_date,
      previous_balance: bill.previous_balance ?? 0,
      payments_received: bill.payments_received ?? 0,
      current_amount_due: bill.current_amount_due,
      total_amount_due: bill.total_amount_due,
      amount_payable_after_credits: bill.amount_payable_after_credits,
      total_vat: bill.total_vat ?? 0,
      raw_pdf_url: args.rawPdfUrl,
      raw_pdf_filename: args.rawPdfFilename,
      customer_name_extracted: bill.customer_name,
      confidence_score: bill.overall_confidence,
      extraction_pass_count: 1,
      extraction_model: args.extractionModel,
      ai_summary: bill.ai_summary ?? null,
      status: "pending_review",
    })
    .select("id")
    .single();
  if (billError || !billRow) throw new Error(`Failed to insert bill: ${billError?.message}`);
  const billId = billRow.id;

  // 6. Batch-insert line items.
  const lineItemRows = bill.line_items.map((item) => ({
    bill_id: billId,
    property_id: resolvePropertyId(lipByLineOrder.get(item.line_order) ?? null),
    parent_line_item_id: null,
    line_order: item.line_order,
    section_label: item.section_label,
    utility_category: item.utility_category,
    line_type: item.line_type,
    description: item.description,
    amount: item.amount,
    vat_rate: item.vat_rate,
    period_start: item.period_start,
    period_end: item.period_end,
    period_days: item.period_days,
    usage_value: item.usage_value,
    usage_unit: item.usage_unit,
    rate: item.rate,
    rate_unit: item.rate_unit,
    base_value: item.base_value,
    meter_number: item.meter_number,
    opening_meter_reading: item.opening_meter_reading,
    closing_meter_reading: item.closing_meter_reading,
    reading_type: item.reading_type,
    prior_estimate_value: item.prior_estimate_value,
    reconciliation_delta: item.reconciliation_delta,
    notes: item.notes,
  }));

  if (lineItemRows.length > 0) {
    const { error } = await supabase.from("bill_line_items").insert(lineItemRows);
    if (error) throw new Error(`Failed to insert line items: ${error.message}`);
  }

  // 7. Collect warnings from the match step and write as bill_field_errors.
  const warningRows = collectMatchWarnings(billId, args.match);
  if (warningRows.length > 0) {
    const { error } = await supabase.from("bill_field_errors").insert(warningRows);
    if (error) throw new Error(`Failed to insert warnings: ${error.message}`);
  }

  // 8. Audit log entry.
  const auditNotes =
    `Extracted from ${args.rawPdfFilename ?? "(unknown file)"} using ${args.extractionModel}. ` +
    `Created ${propertiesToCreate.size} property/properties. ` +
    `Inserted ${lineItemRows.length} line items, ${warningRows.length} warnings.`;
  const { error: auditError } = await supabase.from("audit_log").insert({
    entity_type: "bill",
    entity_id: billId,
    action: "extracted",
    user_identifier: "system",
    notes: auditNotes,
  });
  if (auditError) throw new Error(`Failed to insert audit log: ${auditError.message}`);

  return {
    bill_id: billId,
    was_already_saved: false,
    entities_created: {
      municipality: municipalityCreated,
      billing_account: billingAccountCreated,
      properties: propertiesToCreate.size,
    },
    line_items_inserted: lineItemRows.length,
    warnings_inserted: warningRows.length,
  };
}

type WarningRow = {
  bill_id: string;
  line_item_id: null;
  field_name: string;
  rule_name: string;
  severity: "warning";
  extracted_value: string | null;
  message: string;
};

/**
 * For multi-unit bills: ensure a parent property record exists for each complex
 * and that all units have their parent_property_id set.
 *
 * A "parent" property is a record with unit_number = null for the same
 * billing_account. Units are linked to it so the UI can group them under a
 * single property card.
 *
 * Strategy: look up the actual DB unit records by billing_account + unit_number
 * (reliable identifiers). If they already have a parent_property_id set (e.g.
 * from the backfill script), skip them — no action needed. Only create a new
 * parent and link units when units genuinely have no parent yet. Parent lookup
 * uses case-insensitive matching to handle PDF extraction case differences.
 */
async function ensureParentProperties(
  supabase: SupabaseClient,
  billingAccountId: string,
  unitProperties: ExtractedProperty[],
): Promise<void> {
  if (unitProperties.length === 0) return;

  const unitNumbers = unitProperties
    .filter((p) => p.unit_number)
    .map((p) => p.unit_number!);

  if (unitNumbers.length === 0) return;

  // Fetch the actual DB records for the extracted unit numbers.
  const { data: dbUnits } = await supabase
    .from("properties")
    .select("id, unit_number, parent_property_id, complex_name, address, erf_number, suburb, postal_code")
    .eq("billing_account_id", billingAccountId)
    .in("unit_number", unitNumbers);

  if (!dbUnits || dbUnits.length === 0) return;

  // Units that already have a parent don't need any action.
  const unitsNeedingParent = dbUnits.filter((u) => !u.parent_property_id);
  if (unitsNeedingParent.length === 0) return;

  // Group the parentless units by complex_name + address.
  const groups = new Map<string, typeof dbUnits>();
  for (const unit of unitsNeedingParent) {
    const key = `${(unit.complex_name ?? "").toLowerCase().trim()}||${(unit.address ?? "").toLowerCase().trim()}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(unit);
  }

  for (const [, units] of groups) {
    const rep = units[0];

    // Check for an existing parent using case-insensitive match to tolerate
    // PDF extraction capitalisation differences (e.g. "TWIN TOWERS" vs "Twin Towers").
    const { data: existingParent } = await supabase
      .from("properties")
      .select("id")
      .eq("billing_account_id", billingAccountId)
      .ilike("complex_name", rep.complex_name ?? "")
      .ilike("address", rep.address ?? "")
      .is("unit_number", null)
      .maybeSingle();

    let parentId: string;
    if (existingParent) {
      parentId = existingParent.id;
    } else {
      const { data: created, error } = await supabase
        .from("properties")
        .insert({
          billing_account_id: billingAccountId,
          address: rep.address,
          complex_name: rep.complex_name,
          unit_number: null,
          erf_number: rep.erf_number ?? null,
          suburb: rep.suburb ?? null,
          postal_code: rep.postal_code ?? null,
          status: "active",
          billing_frequency: "monthly",
        })
        .select("id")
        .single();
      if (error || !created) return; // Non-fatal — parent creation failure doesn't block the bill.
      parentId = created.id;
    }

    // Link the parentless units to this parent.
    await supabase
      .from("properties")
      .update({ parent_property_id: parentId })
      .in("id", units.map((u) => u.id));
  }
}

function collectMatchWarnings(billId: string, match: MatchResult): WarningRow[] {
  // Warnings repeat across primary + per-line decisions when those lines all
  // reference the same property (the common case). Dedupe by message so a
  // single underlying anomaly produces a single row.
  const seen = new Set<string>();
  const rows: WarningRow[] = [];

  const consider = (decision: PropertyDecision | null) => {
    if (!decision) return;
    for (const message of decision.warnings) {
      const key = `property_match|${message}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        bill_id: billId,
        line_item_id: null,
        field_name: "property",
        rule_name: "property_match",
        severity: "warning",
        extracted_value: null,
        message,
      });
    }
  };

  consider(match.primary_property);
  for (const lip of match.line_item_properties) consider(lip.decision);
  return rows;
}
