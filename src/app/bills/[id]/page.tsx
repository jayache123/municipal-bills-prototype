import { notFound } from "next/navigation";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { ApproveButton } from "./approve-button";

// ── Types ─────────────────────────────────────────────────────────────────────

type Bill = {
  id: string;
  status: string;
  billing_account_id: string;
  primary_property_id: string | null;
  tax_invoice_number: string | null;
  billing_period_start: string | null;
  billing_period_end: string | null;
  issue_date: string | null;
  due_date: string | null;
  previous_balance: number;
  payments_received: number;
  current_amount_due: number | null;
  total_amount_due: number | null;
  amount_payable_after_credits: number | null;
  total_vat: number;
  raw_pdf_filename: string | null;
  customer_name_extracted: string | null;
  confidence_score: number | null;
  extraction_model: string | null;
  notes: string | null;
  ai_summary: string[] | null;
  summary_month: string | null;
  created_at: string;
  billing_accounts: {
    account_number: string;
    customer_name: string | null;
    municipalities: { name: string } | null;
  } | null;
  primary_property: {
    address: string;
    complex_name: string | null;
    unit_number: string | null;
    suburb: string | null;
    erf_number: string | null;
  } | null;
};

type LineItem = {
  id: string;
  line_order: number;
  section_label: string | null;
  utility_category: string;
  line_type: string;
  description: string | null;
  amount: number | null;
  vat_rate: number | null;
  period_start: string | null;
  period_end: string | null;
  usage_value: number | null;
  usage_unit: string | null;
  rate: number | null;
  rate_unit: string | null;
  opening_meter_reading: number | null;
  closing_meter_reading: number | null;
  reading_type: string | null;
  notes: string | null;
  property_id: string | null;
  property: { unit_number: string | null } | null;
};

type FieldError = {
  id: string;
  field_name: string;
  rule_name: string;
  severity: string;
  extracted_value: string | null;
  message: string | null;
  resolved: boolean;
};

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  approved:       { label: "Approved",     className: "bg-green-50   text-green-700  ring-green-600/20"  },
  pending_review: { label: "Needs Review", className: "bg-amber-50   text-amber-700  ring-amber-600/20"  },
  hard_rejected:  { label: "Rejected",     className: "bg-red-50     text-red-700    ring-red-600/20"    },
  received:       { label: "Received",     className: "bg-zinc-100   text-zinc-600   ring-zinc-500/20"   },
  queried:        { label: "Queried",      className: "bg-orange-50  text-orange-700 ring-orange-600/20" },
  reviewed:       { label: "Reviewed",     className: "bg-indigo-50  text-indigo-700 ring-indigo-600/20" },
  paid:           { label: "Paid",         className: "bg-emerald-50 text-emerald-700 ring-emerald-600/20"},
  overdue:        { label: "Overdue",      className: "bg-red-50     text-red-800    ring-red-700/20"    },
};

const SEVERITY_CONFIG: Record<string, { label: string; className: string }> = {
  critical: { label: "Critical", className: "bg-red-50   text-red-700   ring-red-600/20"   },
  warning:  { label: "Warning",  className: "bg-amber-50 text-amber-700 ring-amber-600/20" },
  info:     { label: "Info",     className: "bg-blue-50  text-blue-700  ring-blue-600/20"  },
};

const CATEGORY_COLORS: Record<string, string> = {
  rates:                "bg-blue-50   text-blue-700",
  electricity:          "bg-yellow-50 text-yellow-700",
  water:                "bg-cyan-50   text-cyan-700",
  refuse:               "bg-green-50  text-green-700",
  sewerage:             "bg-orange-50 text-orange-700",
  improvement_district: "bg-purple-50 text-purple-700",
  sundry:               "bg-zinc-100  text-zinc-600",
  other:                "bg-zinc-100  text-zinc-500",
};

const CATEGORY_LABELS: Record<string, string> = {
  rates:                "Property Rates",
  electricity:          "Electricity",
  water:                "Water",
  refuse:               "Refuse",
  sewerage:             "Sewerage",
  improvement_district: "Improvement District (CID)",
  sundry:               "Sundries",
  other:                "Other",
};

const CATEGORY_ORDER = [
  "rates", "electricity", "water", "refuse", "sewerage",
  "improvement_district", "sundry", "other",
];

// ── Formatters ────────────────────────────────────────────────────────────────

function formatDate(date: string | null): string {
  if (!date) return "—";
  const [y, m, d] = date.split("-");
  return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatShortDate(date: string | null): string {
  if (!date) return "—";
  const [y, m, d] = date.split("-");
  return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString("en-ZA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatMonth(date: string | null): string {
  if (!date) return "—";
  const [y, m] = date.split("-").map(Number);
  const month = new Date(y, m - 1, 1).toLocaleDateString("en-ZA", { month: "short" });
  return `${month}-${String(y).slice(-2)}`;
}

function formatPeriod(start: string | null, end: string | null): string {
  if (!start) return "—";
  const fmt = (s: string) => {
    const [y, m] = s.split("-");
    return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-ZA", {
      month: "short",
      year: "numeric",
    });
  };
  return end ? `${fmt(start)} – ${fmt(end)}` : fmt(start);
}

function formatZAR(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return "—";
  const val = Number(amount);
  return `R ${Math.abs(val).toLocaleString("en-ZA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatTimestamp(ts: string | null): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function computeDays(start: string | null, end: string | null): string {
  if (!start || !end) return "—";
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  const d = Math.round((e - s) / 86_400_000);
  return d > 0 ? String(d) : "—";
}

// ── Small UI helpers ──────────────────────────────────────────────────────────

function InfoGrid({ items }: { items: { label: string; value: React.ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
      {items.map(({ label, value }) => (
        <div key={label}>
          <dt className="text-xs font-medium text-zinc-500 uppercase tracking-wide">{label}</dt>
          <dd className="mt-1 text-sm text-zinc-800">{value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
      <div className="border-b border-zinc-100 px-5 py-3">
        <h2 className="text-sm font-semibold text-zinc-700">{title}</h2>
      </div>
      <div className="px-5 py-5">{children}</div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function BillDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = getSupabaseServiceClient();

  // Fetch bill, line items and errors in parallel.
  const [billRes, lineItemsRes, errorsRes] = await Promise.all([
    supabase
      .from("bills")
      .select(`
        *,
        billing_accounts ( account_number, customer_name, municipalities ( name ) ),
        primary_property:properties!primary_property_id (
          address, complex_name, unit_number, suburb, erf_number
        )
      `)
      .eq("id", id)
      .single(),

    supabase
      .from("bill_line_items")
      .select("*, property:properties(unit_number)")
      .eq("bill_id", id)
      .order("line_order", { ascending: true }),

    supabase
      .from("bill_field_errors")
      .select("*")
      .eq("bill_id", id)
      .eq("resolved", false)
      .order("severity", { ascending: true }),
  ]);

  if (billRes.error || !billRes.data) notFound();

  const bill      = billRes.data as unknown as Bill;
  const lineItems = (lineItemsRes.data ?? []) as unknown as LineItem[];
  const errors    = (errorsRes.data    ?? []) as unknown as FieldError[];

  const statusCfg = STATUS_CONFIG[bill.status] ?? {
    label: bill.status,
    className: "bg-zinc-100 text-zinc-500 ring-zinc-400/20",
  };
  const canApprove = bill.status === "pending_review";
  const acct = bill.billing_accounts;
  const prop = bill.primary_property;

  // ── Financial summary: sum amounts per utility_category ───────────────────

  const categoryAmounts = new Map<string, number>();
  for (const item of lineItems) {
    if (item.line_type === "informational") continue;
    if (item.amount === null) continue;
    const cat = item.utility_category;
    categoryAmounts.set(cat, (categoryAmounts.get(cat) ?? 0) + Number(item.amount));
  }
  const summaryRows = CATEGORY_ORDER
    .filter((cat) => categoryAmounts.has(cat))
    .map((cat) => ({
      cat,
      label: CATEGORY_LABELS[cat] ?? cat,
      amount: categoryAmounts.get(cat)!,
    }));

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-6">

        {/* ── Page heading ── */}
        <h1 className="text-lg font-semibold text-zinc-900 truncate">
          {bill.raw_pdf_filename ?? id}
        </h1>

        {/* ── Status bar ── */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-zinc-200 bg-white px-5 py-4">
          <div className="flex items-center gap-3">
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${statusCfg.className}`}>
              {statusCfg.label}
            </span>
            <span className="text-sm text-zinc-500">
              Processed {formatTimestamp(bill.created_at)}
            </span>
            {bill.confidence_score !== null && (
              <span className="text-xs text-zinc-400">
                Confidence: {Math.round(Number(bill.confidence_score))}%
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            {canApprove && (
              <>
                {errors.length > 0 && (
                  <p className="text-xs text-amber-600">
                    {errors.length} unresolved issue{errors.length !== 1 ? "s" : ""} — review before approving
                  </p>
                )}
                <ApproveButton billId={bill.id} />
              </>
            )}
            {bill.status === "approved" && (
              <p className="text-sm text-green-600 font-medium">✓ Approved</p>
            )}
            {bill.status === "hard_rejected" && (
              <p className="text-sm text-red-600 font-medium">⚠ Validation failed — cannot approve</p>
            )}
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════════
            SECTION 1 — Bill Information
        ══════════════════════════════════════════════════════════════════════ */}
        <SectionCard title="Bill Information">
          <InfoGrid
            items={[
              {
                label: "Municipality",
                value: acct?.municipalities?.name ?? "—",
              },
              {
                label: "Account Number",
                value: <span className="font-mono">{acct?.account_number ?? "—"}</span>,
              },
              {
                label: "Customer",
                value: acct?.customer_name ?? bill.customer_name_extracted ?? "—",
              },
              {
                label: "Property",
                value: prop
                  ? [prop.complex_name, prop.address, prop.suburb].filter(Boolean).join(", ")
                  : "—",
              },
              {
                label: "Erf / Unit",
                value: prop
                  ? [
                      prop.erf_number  && `Erf ${prop.erf_number}`,
                      prop.unit_number && `Unit ${prop.unit_number}`,
                    ].filter(Boolean).join(" · ") || "—"
                  : "—",
              },
              {
                label: "Invoice Number",
                value: <span className="font-mono">{bill.tax_invoice_number ?? "—"}</span>,
              },
              {
                label: "Billing Period",
                value: formatPeriod(bill.billing_period_start, bill.billing_period_end),
              },
              { label: "Issue Date", value: formatDate(bill.issue_date) },
              { label: "Due Date",   value: formatDate(bill.due_date) },
            ]}
          />
        </SectionCard>

        {/* ══════════════════════════════════════════════════════════════════════
            SECTION 2 — Financial Summary (item → amount only)
        ══════════════════════════════════════════════════════════════════════ */}
        <SectionCard title="Financial Summary">
          <div className="w-full max-w-sm space-y-1 text-sm">
            {summaryRows.map(({ cat, label, amount }) => (
              <div key={cat} className="flex items-center justify-between gap-4 py-1">
                <span className="text-zinc-600">{label}</span>
                <span className={`font-mono tabular-nums ${amount < 0 ? "text-green-600" : "text-zinc-800"}`}>
                  {amount < 0
                    ? `−R ${Math.abs(amount).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}`
                    : formatZAR(amount)}
                </span>
              </div>
            ))}

            {/* VAT row */}
            {bill.total_vat > 0 && (
              <div className="flex items-center justify-between gap-4 py-1">
                <span className="text-zinc-500 italic">VAT @ 15%</span>
                <span className="font-mono tabular-nums text-zinc-500">
                  {formatZAR(bill.total_vat)}
                </span>
              </div>
            )}

            {/* Total */}
            <div className="flex items-center justify-between gap-4 border-t border-zinc-200 pt-2 mt-1">
              <span className="font-semibold text-zinc-900">Total Amount Due</span>
              <span className="font-mono font-bold text-zinc-900">
                {formatZAR(bill.total_amount_due)}
              </span>
            </div>
          </div>
        </SectionCard>

        {/* ══════════════════════════════════════════════════════════════════════
            SECTION 3 — Bill Summary (AI bullets + issues)
        ══════════════════════════════════════════════════════════════════════ */}
        {((bill.ai_summary && bill.ai_summary.length > 0) || errors.length > 0) && (
          <SectionCard title={`Bill Summary${errors.length > 0 ? ` · ${errors.length} Issue${errors.length !== 1 ? "s" : ""}` : ""}`}>
            <div className="space-y-5">

              {/* AI summary bullets */}
              {bill.ai_summary && bill.ai_summary.length > 0 && (
                <ul className="space-y-2">
                  {bill.ai_summary.map((bullet, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm text-zinc-700">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-400" />
                      {bullet}
                    </li>
                  ))}
                </ul>
              )}

              {/* Divider between AI bullets and errors (only if both present) */}
              {bill.ai_summary && bill.ai_summary.length > 0 && errors.length > 0 && (
                <hr className="border-zinc-100" />
              )}

              {/* Issues / field errors */}
              {errors.length > 0 && (
                <div className="space-y-3">
                  {errors.map((err) => {
                    const sev = SEVERITY_CONFIG[err.severity] ?? {
                      label: err.severity,
                      className: "bg-zinc-100 text-zinc-500 ring-zinc-400/20",
                    };
                    return (
                      <div key={err.id} className="flex items-start gap-3">
                        <span className={`mt-0.5 shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${sev.className}`}>
                          {sev.label}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm text-zinc-800">{err.message ?? err.rule_name}</p>
                          {err.extracted_value && (
                            <p className="mt-0.5 font-mono text-xs text-zinc-400">
                              Extracted value: {err.extracted_value}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

            </div>
          </SectionCard>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            SECTION 4 — Detailed Line Breakdown
        ══════════════════════════════════════════════════════════════════════ */}
        <SectionCard title="Detailed Breakdown">
          {lineItems.length === 0 ? (
            <p className="text-sm text-zinc-400">No line items found.</p>
          ) : (
            <div className="overflow-x-auto -mx-5">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50">
                    <th className="px-5 py-2.5 text-left font-medium text-zinc-500 uppercase tracking-wide whitespace-nowrap">Category</th>
                    <th className="px-4 py-2.5 text-left font-medium text-zinc-500 uppercase tracking-wide whitespace-nowrap">Item</th>
                    <th className="px-4 py-2.5 text-left font-medium text-zinc-500 uppercase tracking-wide whitespace-nowrap">Month</th>
                    <th className="px-4 py-2.5 text-right font-medium text-zinc-500 uppercase tracking-wide whitespace-nowrap">Amount (R)</th>
                    <th className="px-4 py-2.5 text-right font-medium text-zinc-500 uppercase tracking-wide whitespace-nowrap">Days</th>
                    <th className="px-4 py-2.5 text-left font-medium text-zinc-500 uppercase tracking-wide whitespace-nowrap">Reading</th>
                    <th className="px-4 py-2.5 text-right font-medium text-zinc-500 uppercase tracking-wide whitespace-nowrap">Units Used</th>
                    <th className="px-4 py-2.5 text-left font-medium text-zinc-500 uppercase tracking-wide whitespace-nowrap">Start Date</th>
                    <th className="px-4 py-2.5 text-left font-medium text-zinc-500 uppercase tracking-wide whitespace-nowrap">End Date</th>
                    <th className="px-4 py-2.5 text-left font-medium text-zinc-500 uppercase tracking-wide min-w-[420px]">Notes (Tariffs &amp; Basis)</th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((item, idx) => {
                    const prevCat     = idx > 0 ? lineItems[idx - 1].utility_category : null;
                    const catChanged  = prevCat !== null && prevCat !== item.utility_category;
                    const isCredit    = item.line_type === "rebate" || item.line_type === "reversal";
                    const isSubtotal  = item.line_type === "subtotal";
                    const catColor    = CATEGORY_COLORS[item.utility_category] ?? "bg-zinc-100 text-zinc-500";
                    const catLabel    = CATEGORY_LABELS[item.utility_category]
                                        ?? item.utility_category.replace(/_/g, " ");

                    const amountVal   = item.amount !== null ? Number(item.amount) : null;
                    const isNegative  = amountVal !== null && amountVal < 0;

                    // Build item label: base description + unit suffix if applicable.
                    const baseLabel   = item.section_label ?? item.description ?? catLabel;
                    const unitSuffix  = item.property?.unit_number
                                        ? ` — Unit ${item.property.unit_number}`
                                        : "";
                    const itemLabel   = baseLabel + unitSuffix;

                    // Notes: split on "; " to render each clause on its own line.
                    const noteParts   = item.notes
                                        ? item.notes.split(/;\s*/).map(p => p.trim()).filter(Boolean)
                                        : [];

                    return (
                      <tr
                        key={item.id}
                        className={[
                          catChanged ? "border-t-2 border-zinc-200" : "border-t border-zinc-50",
                          isSubtotal ? "bg-zinc-50" : "",
                        ].join(" ")}
                      >
                        {/* Category badge — shown on every row */}
                        <td className="px-5 py-3 align-top whitespace-nowrap">
                          <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium ${catColor}`}>
                            {catLabel}
                          </span>
                        </td>

                        {/* Item description + optional unit */}
                        <td className="px-4 py-3 align-top text-zinc-700 whitespace-nowrap">
                          <span className={isSubtotal ? "font-semibold" : ""}>
                            {itemLabel}
                          </span>
                          {isCredit && (
                            <span className="ml-1.5 inline-flex items-center rounded-full bg-green-50 px-1.5 py-0.5 text-xs font-medium text-green-700 ring-1 ring-green-600/20">
                              {item.line_type}
                            </span>
                          )}
                        </td>

                        {/* Month */}
                        <td className="px-4 py-3 align-top text-zinc-500 whitespace-nowrap">
                          {item.period_start
                            ? formatMonth(item.period_start)
                            : formatMonth(bill.summary_month)}
                        </td>

                        {/* Amount */}
                        <td className={`px-4 py-3 align-top text-right tabular-nums font-mono ${
                          isCredit || isNegative
                            ? "text-green-600"
                            : isSubtotal
                              ? "font-semibold text-zinc-900"
                              : "text-zinc-700"
                        }`}>
                          {amountVal !== null
                            ? `${isNegative ? "−" : ""}R ${Math.abs(amountVal).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}`
                            : "—"}
                        </td>

                        {/* Days */}
                        <td className="px-4 py-3 align-top text-right text-zinc-400 tabular-nums">
                          {computeDays(item.period_start, item.period_end)}
                        </td>

                        {/* Reading type */}
                        <td className="px-4 py-3 align-top text-zinc-500 whitespace-nowrap capitalize">
                          {item.reading_type ?? "—"}
                        </td>

                        {/* Units used */}
                        <td className="px-4 py-3 align-top text-right text-zinc-500 tabular-nums whitespace-nowrap">
                          {item.usage_value !== null
                            ? `${Number(item.usage_value).toLocaleString("en-ZA", { maximumFractionDigits: 3 })}${item.usage_unit ? ` ${item.usage_unit}` : ""}`
                            : "—"}
                        </td>

                        {/* Start date */}
                        <td className="px-4 py-3 align-top text-zinc-400 whitespace-nowrap">
                          {formatShortDate(item.period_start)}
                        </td>

                        {/* End date */}
                        <td className="px-4 py-3 align-top text-zinc-400 whitespace-nowrap">
                          {formatShortDate(item.period_end)}
                        </td>

                        {/* Notes — wide column, each clause on its own line */}
                        <td className="px-4 py-3 align-top">
                          {noteParts.length === 0 ? (
                            <span className="text-zinc-300">—</span>
                          ) : (
                            <ul className="space-y-1">
                              {noteParts.map((part, i) => (
                                <li key={i} className="flex items-baseline gap-1.5 text-xs text-zinc-400 leading-relaxed">
                                  <span className="shrink-0 text-zinc-300">›</span>
                                  {part}
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        {/* ── Footer meta ── */}
        <p className="text-xs text-zinc-400 text-center pb-4">
          Extracted by {bill.extraction_model ?? "unknown model"} · Bill ID: {bill.id}
        </p>

      </div>
    </div>
  );
}
