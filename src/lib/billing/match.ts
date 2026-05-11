import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ExtractedProperty,
  ExtractionResult,
} from "../anthropic/extraction-schema";

export type DbProperty = {
  id: string;
  billing_account_id: string;
  address: string;
  complex_name: string | null;
  unit_number: string | null;
  erf_number: string | null;
  suburb: string | null;
  postal_code: string | null;
};

export type MunicipalityDecision = {
  matched: boolean;
  id: string | null;
  name: string;
};

export type BillingAccountDecision = {
  matched: boolean;
  id: string | null;
  account_number: string;
  business_partner_number: string | null;
  customer_name: string | null;
};

export type PropertyDecision = {
  matched: boolean;
  id: string | null;
  matched_db_property: DbProperty | null;
  extracted: ExtractedProperty;
  warnings: string[];
};

export type LineItemPropertyDecision = {
  line_order: number;
  decision: PropertyDecision;
};

export type MatchResult = {
  municipality: MunicipalityDecision;
  billing_account: BillingAccountDecision;
  primary_property: PropertyDecision | null;
  line_item_properties: LineItemPropertyDecision[];
};

function norm(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Identity key for matching. Account-number-first is enforced by scoping the
 * lookup to a billing account; within that account, identity is erf + unit
 * (the strong municipal IDs). Fall back to normalised address when neither
 * is present.
 */
function propertyIdentityKey(p: ExtractedProperty | DbProperty): string {
  const hasErf = !!p.erf_number && p.erf_number.trim() !== "";
  const hasUnit = !!p.unit_number && p.unit_number.trim() !== "";
  if (hasErf || hasUnit) {
    return `erf:${norm(p.erf_number)}|unit:${norm(p.unit_number)}`;
  }
  return `addr:${norm(p.address)}`;
}

function comparePropertyAttributes(extracted: ExtractedProperty, db: DbProperty): string[] {
  const warnings: string[] = [];
  if (norm(extracted.address) !== norm(db.address)) {
    warnings.push(
      `address on bill ("${extracted.address ?? ""}") differs from DB ("${db.address}")`,
    );
  }
  if (
    extracted.suburb &&
    db.suburb &&
    norm(extracted.suburb) !== norm(db.suburb)
  ) {
    warnings.push(
      `suburb on bill ("${extracted.suburb}") differs from DB ("${db.suburb}")`,
    );
  }
  if (
    extracted.complex_name &&
    db.complex_name &&
    norm(extracted.complex_name) !== norm(db.complex_name)
  ) {
    warnings.push(
      `complex name on bill ("${extracted.complex_name}") differs from DB ("${db.complex_name}")`,
    );
  }
  return warnings;
}

/**
 * Match an extracted bill against existing DB records.
 *
 * Pure read — no DB writes. Returns a decision object that downstream code
 * (Step 4) uses to insert or look up the right rows.
 *
 * Matching strategy (account-number-first):
 *  1. Municipality matched by exact name (case-insensitive).
 *  2. Billing account matched by (municipality_id, account_number).
 *  3. Properties matched within the billing account by erf+unit identity.
 *  4. Address/suburb/complex differences surface as warnings — they do NOT
 *     cause a no-match and do NOT create duplicates.
 */
export async function matchExtractedBill(
  supabase: SupabaseClient,
  extraction: ExtractionResult,
): Promise<MatchResult> {
  if (extraction.document_type !== "municipal_bill" || !extraction.bill) {
    throw new Error("matchExtractedBill called on a non-bill document.");
  }
  const bill = extraction.bill;

  // 1. Municipality
  let municipalityId: string | null = null;
  let municipalityMatched = false;
  if (bill.municipality_name) {
    const { data, error } = await supabase
      .from("municipalities")
      .select("id, name")
      .ilike("name", bill.municipality_name.trim())
      .maybeSingle();
    if (error) throw new Error(`Failed to look up municipality: ${error.message}`);
    if (data) {
      municipalityId = data.id;
      municipalityMatched = true;
    }
  }

  // 2. Billing account (scoped to municipality)
  let billingAccountId: string | null = null;
  let billingAccountMatched = false;
  if (municipalityId && bill.account_number) {
    const { data, error } = await supabase
      .from("billing_accounts")
      .select("id, account_number")
      .eq("municipality_id", municipalityId)
      .eq("account_number", bill.account_number.trim())
      .maybeSingle();
    if (error) throw new Error(`Failed to look up billing account: ${error.message}`);
    if (data) {
      billingAccountId = data.id;
      billingAccountMatched = true;
    }
  }

  // 3. Load existing properties under this billing account
  let dbProperties: DbProperty[] = [];
  if (billingAccountId) {
    const { data, error } = await supabase
      .from("properties")
      .select(
        "id, billing_account_id, address, complex_name, unit_number, erf_number, suburb, postal_code",
      )
      .eq("billing_account_id", billingAccountId);
    if (error) throw new Error(`Failed to look up properties: ${error.message}`);
    dbProperties = (data ?? []) as DbProperty[];
  }

  const matchProperty = (extracted: ExtractedProperty | null): PropertyDecision | null => {
    if (!extracted) return null;
    const key = propertyIdentityKey(extracted);
    const match = dbProperties.find((p) => propertyIdentityKey(p) === key);
    if (match) {
      return {
        matched: true,
        id: match.id,
        matched_db_property: match,
        extracted,
        warnings: comparePropertyAttributes(extracted, match),
      };
    }
    return {
      matched: false,
      id: null,
      matched_db_property: null,
      extracted,
      warnings: [],
    };
  };

  const primaryPropertyDecision = matchProperty(bill.primary_property);

  const lineItemDecisions: LineItemPropertyDecision[] = [];
  for (const item of bill.line_items) {
    if (item.property) {
      const decision = matchProperty(item.property);
      if (decision) {
        lineItemDecisions.push({ line_order: item.line_order, decision });
      }
    }
  }

  return {
    municipality: {
      matched: municipalityMatched,
      id: municipalityId,
      name: bill.municipality_name ?? "(unknown)",
    },
    billing_account: {
      matched: billingAccountMatched,
      id: billingAccountId,
      account_number: bill.account_number ?? "(unknown)",
      business_partner_number: bill.business_partner_number,
      customer_name: bill.customer_name,
    },
    primary_property: primaryPropertyDecision,
    line_item_properties: lineItemDecisions,
  };
}
