import Link from "next/link";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

// ── Types ─────────────────────────────────────────────────────────────────────

type BillRow = {
  id: string;
  status: string;
  billing_period_start: string | null;
  total_amount_due: number | null;
  due_date: string | null;
  created_at: string;
  billing_accounts: {
    account_number: string;
    customer_name: string | null;
  } | null;
  primary_property: {
    address: string;
    suburb: string | null;
  } | null;
};

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  approved:       { label: "Approved",     className: "bg-green-50   text-green-700  ring-green-600/20" },
  pending_review: { label: "Needs Review", className: "bg-amber-50   text-amber-700  ring-amber-600/20" },
  hard_rejected:  { label: "Rejected",     className: "bg-red-50     text-red-700    ring-red-600/20"   },
  received:       { label: "Received",     className: "bg-zinc-100   text-zinc-600   ring-zinc-500/20"  },
  expected:       { label: "Expected",     className: "bg-blue-50    text-blue-700   ring-blue-600/20"  },
  queried:        { label: "Queried",      className: "bg-orange-50  text-orange-700 ring-orange-600/20"},
  reviewed:       { label: "Reviewed",     className: "bg-indigo-50  text-indigo-700 ring-indigo-600/20"},
  paid:           { label: "Paid",         className: "bg-emerald-50 text-emerald-700 ring-emerald-600/20"},
  overdue:        { label: "Overdue",      className: "bg-red-50     text-red-800    ring-red-700/20"   },
  not_applicable: { label: "N/A",          className: "bg-zinc-50    text-zinc-400   ring-zinc-400/20"  },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, className: "bg-zinc-100 text-zinc-500 ring-zinc-400/20" };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}

// ── Formatters ────────────────────────────────────────────────────────────────

function formatPeriod(start: string | null): string {
  if (!start) return "—";
  // Dates from Supabase are "YYYY-MM-DD". Parse as local to avoid UTC-offset day shift.
  const [y, m] = start.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-ZA", {
    month: "short",
    year: "numeric",
  });
}

function formatDate(date: string | null): string {
  if (!date) return "—";
  const [y, m, d] = date.split("-");
  return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatZAR(amount: number | null): string {
  if (amount === null || amount === undefined) return "—";
  return `R ${Number(amount).toLocaleString("en-ZA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function BillsPage() {
  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase
    .from("bills")
    .select(`
      id,
      status,
      billing_period_start,
      total_amount_due,
      due_date,
      created_at,
      billing_accounts ( account_number, customer_name ),
      primary_property:properties!primary_property_id ( address, suburb )
    `)
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center px-4">
        <p className="text-sm text-red-600">Failed to load bills: {error.message}</p>
      </div>
    );
  }

  const bills = (data ?? []) as unknown as BillRow[];

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">

        {/* ── Header ── */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-zinc-900">Bills</h1>
            <p className="mt-0.5 text-sm text-zinc-500">
              {bills.length} bill{bills.length !== 1 ? "s" : ""} processed
            </p>
          </div>
          <Link
            href="/upload"
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700 transition-colors"
          >
            + Upload Bill
          </Link>
        </div>

        {/* ── Empty state ── */}
        {bills.length === 0 && (
          <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-8 py-16 text-center">
            <p className="text-sm font-medium text-zinc-500">No bills yet</p>
            <p className="mt-1 text-xs text-zinc-400">Upload a PDF to get started</p>
            <Link
              href="/upload"
              className="mt-5 inline-block rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700 transition-colors"
            >
              Upload Bill
            </Link>
          </div>
        )}

        {/* ── Table ── */}
        {bills.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-zinc-100">
                <thead>
                  <tr className="bg-zinc-50">
                    {["Status", "Property", "Account", "Period", "Amount Due", "Due Date", ""].map((h) => (
                      <th
                        key={h}
                        scope="col"
                        className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wide whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {bills.map((bill) => {
                    const acct = bill.billing_accounts;
                    const prop = bill.primary_property;
                    return (
                      <tr key={bill.id} className="hover:bg-zinc-50/60 transition-colors">
                        {/* Status */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <StatusBadge status={bill.status} />
                        </td>

                        {/* Property */}
                        <td className="px-4 py-3 text-sm text-zinc-800 max-w-[220px]">
                          {prop ? (
                            <>
                              <span className="font-medium">{prop.address}</span>
                              {prop.suburb && (
                                <span className="ml-1.5 text-xs text-zinc-400">{prop.suburb}</span>
                              )}
                            </>
                          ) : (
                            <span className="text-zinc-400">—</span>
                          )}
                        </td>

                        {/* Account */}
                        <td className="px-4 py-3 text-sm text-zinc-500 whitespace-nowrap">
                          <span className="font-mono">{acct?.account_number ?? "—"}</span>
                          {acct?.customer_name && (
                            <p className="text-xs text-zinc-400 truncate max-w-[160px]">
                              {acct.customer_name}
                            </p>
                          )}
                        </td>

                        {/* Period */}
                        <td className="px-4 py-3 text-sm text-zinc-600 whitespace-nowrap">
                          {formatPeriod(bill.billing_period_start)}
                        </td>

                        {/* Amount due */}
                        <td className="px-4 py-3 text-sm font-semibold text-zinc-800 whitespace-nowrap text-right">
                          {formatZAR(bill.total_amount_due)}
                        </td>

                        {/* Due date */}
                        <td className="px-4 py-3 text-sm text-zinc-500 whitespace-nowrap">
                          {formatDate(bill.due_date)}
                        </td>

                        {/* Link */}
                        <td className="px-4 py-3 whitespace-nowrap text-right">
                          <Link
                            href={`/bills/${bill.id}`}
                            className="text-xs font-medium text-zinc-400 hover:text-zinc-900 transition-colors"
                          >
                            View →
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
