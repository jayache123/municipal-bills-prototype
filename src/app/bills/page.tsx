import Link from "next/link";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { DashboardPeriodSelector } from "@/components/dashboard-period-selector";
import { PropertyFilter, type PropertyOption } from "@/components/property-filter";
import { StatusPill } from "@/components/status-pill";
import { BILL_STATUS_OPTIONS } from "@/lib/status-options";
import { updateBillStatus } from "./[id]/actions";

// ── Types ─────────────────────────────────────────────────────────────────────

type BillRow = {
  id: string;
  status: string;
  billing_period_start: string | null;
  issue_date: string | null;
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
  return `R ${Number(amount).toLocaleString("en-ZA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function BillsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; property?: string }>;
}) {
  const { period, property } = await searchParams;
  const propertyId = property ?? null;
  const supabase = getSupabaseServiceClient();

  // Build query — filter by summary_month only when a period is selected.
  let query = supabase
    .from("bills")
    .select(`
      id,
      status,
      billing_period_start,
      issue_date,
      total_amount_due,
      due_date,
      created_at,
      billing_accounts ( account_number, customer_name ),
      primary_property:properties!primary_property_id ( address, suburb )
    `)
    .order("created_at", { ascending: false });

  if (period && period !== "all") {
    if (/^\d{4}$/.test(period)) {
      // Full-year filter: "2026" → summary_month between 2026-01-01 and 2026-12-31
      query = query
        .gte("summary_month", `${period}-01-01`)
        .lte("summary_month", `${period}-12-31`);
    } else if (/^\d{4}-\d{2}$/.test(period)) {
      // Month filter: "2026-05" → "2026-05-01"
      query = query.eq("summary_month", `${period}-01`);
    }
  }

  // When filtering by a parent property, also include any child units so that
  // bills linked directly to a unit (e.g. 3B Vredefort Unit 24) still appear
  // when the user selects the parent complex from the dropdown.
  if (propertyId) {
    const { data: childData } = await supabase
      .from("properties")
      .select("id")
      .eq("parent_property_id", propertyId);
    const childIds = (childData ?? []).map((p: { id: string }) => p.id);
    const propertyIds = [propertyId, ...childIds];
    query = propertyIds.length === 1
      ? query.eq("primary_property_id", propertyId)
      : query.in("primary_property_id", propertyIds);
  }

  // Fetch property options for the filter dropdown (top-level only).
  type PropertyOptionRow = { id: string; address: string; complex_name: string | null };
  const [{ data, error }, propertyOptionsRes] = await Promise.all([
    query,
    supabase
      .from("properties")
      .select("id, address, complex_name")
      .is("parent_property_id", null)
      .order("address", { ascending: true }),
  ]);

  const propertyOptions: PropertyOption[] = ((propertyOptionsRes.data ?? []) as PropertyOptionRow[]).map((p) => ({
    id: p.id,
    label: p.complex_name ?? p.address,
  }));

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
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h1 className="text-xl font-semibold text-zinc-900">Bills</h1>
            <p className="mt-0.5 text-sm text-zinc-500">
              {bills.length} bill{bills.length !== 1 ? "s" : ""}
              {period && period !== "all" ? " this period" : " total"}
            </p>
          </div>
          <Link
            href="/upload"
            className="shrink-0 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700 transition-colors"
          >
            + Upload Bill
          </Link>
        </div>

        {/* ── Period selector + property filter ── */}
        <div className="mb-6 flex items-center gap-3 flex-wrap">
          <DashboardPeriodSelector selected={(!period || period === "all") ? "all" : period} />
          <div className="hidden sm:block h-4 w-px bg-zinc-200" />
          <PropertyFilter properties={propertyOptions} selected={propertyId} />
        </div>

        {/* ── Empty state ── */}
        {bills.length === 0 && (
          <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-8 py-16 text-center">
            <p className="text-sm font-medium text-zinc-500">
              {period ? "No bills for this period" : "No bills yet"}
            </p>
            <p className="mt-1 text-xs text-zinc-400">
              {period ? "Try a different month or clear the filter" : "Upload a PDF to get started"}
            </p>
            {!period && (
              <Link
                href="/upload"
                className="mt-5 inline-block rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700 transition-colors"
              >
                Upload Bill
              </Link>
            )}
          </div>
        )}

        {/* ── Table ── */}
        {bills.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-zinc-100">
                <thead>
                  <tr className="bg-zinc-50">
                    {["Status", "Property", "Account", "Period", "Amount Due", "Due Date"].map((h) => (
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
                    const boundUpdateStatus = updateBillStatus.bind(null, bill.id);
                    return (
                      <tr key={bill.id} className="relative cursor-pointer hover:bg-zinc-50/60 transition-colors">
                        {/* Stretched link — covers the entire row */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <Link href={`/bills/${bill.id}`} className="absolute inset-0" aria-label={`View bill ${bill.id}`} />
                          <StatusPill
                            currentStatus={bill.status}
                            options={BILL_STATUS_OPTIONS}
                            onSelect={boundUpdateStatus}
                          />
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

                        {/* Period — use issue_date so the displayed month matches the bill date */}
                        <td className="px-4 py-3 text-sm text-zinc-600 whitespace-nowrap">
                          {formatPeriod(bill.issue_date ?? bill.billing_period_start)}
                        </td>

                        {/* Amount due */}
                        <td className="px-4 py-3 text-sm font-semibold text-zinc-800 whitespace-nowrap text-right">
                          {formatZAR(bill.total_amount_due)}
                        </td>

                        {/* Due date */}
                        <td className="px-4 py-3 text-sm text-zinc-500 whitespace-nowrap">
                          {formatDate(bill.due_date)}
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
