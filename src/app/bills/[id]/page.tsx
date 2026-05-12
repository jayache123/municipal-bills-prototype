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
  tariff_tier: number | null;
  opening_meter_reading: number | null;
  closing_meter_reading: number | null;
  reading_type: string | null;
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

function formatZAR(amount: number | null | undefined, opts?: { signed?: boolean }): string {
  if (amount === null || amount === undefined) return "—";
  const val = Number(amount);
  const formatted = `R ${Math.abs(val).toLocaleString("en-ZA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
  if (opts?.signed && val < 0) return `−${formatted}`;
  return formatted;
}

function formatTimestamp(ts: string | null): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatUsage(value: number | null, unit: string | null): string {
  if (value === null) return "—";
  return `${Number(value).toLocaleString("en-ZA", { maximumFractionDigits: 4 })}${unit ? ` ${unit}` : ""}`;
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
      .select("*")
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

  const bill = billRes.data as unknown as Bill;
  const lineItems = (lineItemsRes.data ?? []) as unknown as LineItem[];
  const errors = (errorsRes.data ?? []) as unknown as FieldError[];

  const statusCfg = STATUS_CONFIG[bill.status] ?? {
    label: bill.status,
    className: "bg-zinc-100 text-zinc-500 ring-zinc-400/20",
  };
  const canApprove = bill.status === "pending_review";
  const acct = bill.billing_accounts;
  const prop = bill.primary_property;

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

          {/* Actions */}
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

        {/* ── Bill info ── */}
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
                  ? [prop.erf_number && `Erf ${prop.erf_number}`, prop.unit_number && `Unit ${prop.unit_number}`]
                      .filter(Boolean)
                      .join(" · ") || "—"
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

        {/* ── Financial summary ── */}
        <SectionCard title="Financial Summary">
          <div className="space-y-2 text-sm">
            {[
              { label: "Previous balance",            value: bill.previous_balance,             muted: true },
              { label: "Payments received",            value: -(bill.payments_received ?? 0),    muted: true },
              { label: "Current charges",              value: bill.current_amount_due,            muted: false },
              { label: "VAT",                          value: bill.total_vat,                    muted: true },
            ].map(({ label, value, muted }) =>
              value !== null && value !== undefined ? (
                <div key={label} className="flex justify-between">
                  <span className={muted ? "text-zinc-500" : "font-medium text-zinc-700"}>{label}</span>
                  <span className={`font-mono ${Number(value) < 0 ? "text-green-600" : muted ? "text-zinc-500" : "text-zinc-800"}`}>
                    {Number(value) < 0 ? `−R ${Math.abs(Number(value)).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}` : formatZAR(Number(value))}
                  </span>
                </div>
              ) : null,
            )}
            <div className="border-t border-zinc-200 pt-2 mt-2 flex justify-between">
              <span className="font-semibold text-zinc-900">Total amount due</span>
              <span className="font-mono font-bold text-zinc-900">{formatZAR(bill.total_amount_due)}</span>
            </div>
          </div>
        </SectionCard>

        {/* ── Errors & warnings ── */}
        {errors.length > 0 && (
          <SectionCard title={`Issues (${errors.length})`}>
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
          </SectionCard>
        )}

        {/* ── Line items ── */}
        <SectionCard title={`Line Items (${lineItems.length})`}>
          {lineItems.length === 0 ? (
            <p className="text-sm text-zinc-400">No line items found.</p>
          ) : (
            <div className="overflow-x-auto -mx-5">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-zinc-100">
                    {["#", "Category", "Description", "Period", "Usage", "Amount"].map((h, i) => (
                      <th
                        key={h}
                        scope="col"
                        className={`px-5 py-2 text-xs font-medium text-zinc-500 uppercase tracking-wide whitespace-nowrap ${
                          i >= 4 ? "text-right" : "text-left"
                        }`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50">
                  {lineItems.map((item) => {
                    const isSubtotal     = item.line_type === "subtotal";
                    const isInformational = item.line_type === "informational";
                    const isCredit       = item.line_type === "rebate" || item.line_type === "reversal";
                    const catColor       = CATEGORY_COLORS[item.utility_category] ?? "bg-zinc-100 text-zinc-500";

                    return (
                      <tr
                        key={item.id}
                        className={`${isSubtotal ? "bg-zinc-50" : ""} ${isInformational ? "opacity-60" : ""}`}
                      >
                        {/* Line order */}
                        <td className="px-5 py-2 text-xs text-zinc-300 tabular-nums w-8">
                          {item.line_order}
                        </td>

                        {/* Category badge */}
                        <td className="px-5 py-2 whitespace-nowrap">
                          <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium ${catColor}`}>
                            {item.utility_category.replace(/_/g, " ")}
                          </span>
                        </td>

                        {/* Description */}
                        <td className="px-5 py-2 text-sm text-zinc-700 max-w-xs">
                          <span className={isSubtotal ? "font-semibold" : ""}>
                            {item.description ?? item.section_label ?? "—"}
                          </span>
                          {item.tariff_tier && (
                            <span className="ml-1.5 text-xs text-zinc-400">Tier {item.tariff_tier}</span>
                          )}
                          {isCredit && (
                            <span className="ml-1.5 inline-flex items-center rounded-full bg-green-50 px-1.5 py-0.5 text-xs font-medium text-green-700 ring-1 ring-green-600/20">
                              {item.line_type}
                            </span>
                          )}
                        </td>

                        {/* Period */}
                        <td className="px-5 py-2 text-xs text-zinc-400 whitespace-nowrap">
                          {item.period_start
                            ? formatPeriod(item.period_start, item.period_end)
                            : "—"}
                        </td>

                        {/* Usage */}
                        <td className="px-5 py-2 text-xs text-zinc-500 whitespace-nowrap text-right tabular-nums">
                          {formatUsage(item.usage_value, item.usage_unit)}
                        </td>

                        {/* Amount */}
                        <td
                          className={`px-5 py-2 text-sm font-mono whitespace-nowrap text-right tabular-nums ${
                            isCredit || (item.amount !== null && Number(item.amount) < 0)
                              ? "text-green-600"
                              : isSubtotal
                                ? "font-semibold text-zinc-900"
                                : "text-zinc-700"
                          }`}
                        >
                          {item.amount !== null
                            ? `${Number(item.amount) < 0 ? "−" : ""}R ${Math.abs(Number(item.amount)).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}`
                            : "—"}
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
