import Link from "next/link";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { DashboardPeriodSelector } from "@/components/dashboard-period-selector";
import { PropertyFilter, type PropertyOption } from "@/components/property-filter";

// ── Types ─────────────────────────────────────────────────────────────────────

type BillSummary = {
  status: string;
  total_amount_due: number | null;
};

type BillRow = {
  id: string;
  status: string;
  billing_period_start: string | null;
  total_amount_due: number | null;
  raw_pdf_filename: string | null;
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

const BILL_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  approved:       { label: "Approved",     className: "bg-green-50   text-green-700  ring-green-600/20"  },
  pending_review: { label: "Needs Review", className: "bg-amber-50   text-amber-700  ring-amber-600/20"  },
  hard_rejected:  { label: "Rejected",     className: "bg-red-50     text-red-700    ring-red-600/20"    },
  received:       { label: "Received",     className: "bg-zinc-100   text-zinc-600   ring-zinc-500/20"   },
  expected:       { label: "Expected",     className: "bg-blue-50    text-blue-700   ring-blue-600/20"   },
  queried:        { label: "Queried",      className: "bg-orange-50  text-orange-700 ring-orange-600/20" },
  reviewed:       { label: "Reviewed",     className: "bg-indigo-50  text-indigo-700 ring-indigo-600/20" },
  paid:           { label: "Paid",         className: "bg-emerald-50 text-emerald-700 ring-emerald-600/20"},
  overdue:        { label: "Overdue",      className: "bg-red-50     text-red-800    ring-red-700/20"    },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = BILL_STATUS_CONFIG[status] ?? { label: status, className: "bg-zinc-100 text-zinc-500 ring-zinc-400/20" };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}

// ── Formatters ────────────────────────────────────────────────────────────────

function formatPeriod(start: string | null): string {
  if (!start) return "—";
  const [y, m] = start.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-ZA", {
    month: "short",
    year: "numeric",
  });
}

function formatZAR(amount: number): string {
  return `R ${amount.toLocaleString("en-ZA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "amber" | "green" | "red";
}) {
  const accentClass =
    accent === "amber" ? "border-amber-200 bg-amber-50" :
    accent === "green" ? "border-green-200 bg-green-50" :
    accent === "red"   ? "border-red-200   bg-red-50"   :
    "border-zinc-200 bg-white";

  const valueClass =
    accent === "amber" ? "text-amber-800" :
    accent === "green" ? "text-green-800" :
    accent === "red"   ? "text-red-800"   :
    "text-zinc-900";

  return (
    <div className={`rounded-xl border px-5 py-5 ${accentClass}`}>
      <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">{label}</p>
      <p className={`mt-1.5 text-2xl font-semibold tabular-nums ${valueClass}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-zinc-400">{sub}</p>}
    </div>
  );
}

function BillListRow({ bill }: { bill: BillRow }) {
  const prop = bill.primary_property;
  const acct = bill.billing_accounts;

  return (
    <Link
      href={`/bills/${bill.id}`}
      className="flex items-center gap-4 py-3 border-b border-zinc-100 last:border-0 hover:bg-zinc-50/60 transition-colors"
    >
      <div className="shrink-0">
        <StatusBadge status={bill.status} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-zinc-800 truncate">
          {prop?.address ?? acct?.account_number ?? "Unknown property"}
        </p>
        <p className="text-xs text-zinc-400 truncate">
          {[prop?.suburb, acct?.customer_name].filter(Boolean).join(" · ")}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm font-semibold text-zinc-700 tabular-nums">
          {bill.total_amount_due !== null ? formatZAR(bill.total_amount_due) : "—"}
        </p>
        <p className="text-xs text-zinc-400">{formatPeriod(bill.billing_period_start)}</p>
      </div>
    </Link>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; property?: string }>;
}) {
  const { period, property } = await searchParams;
  const propertyId = property ?? null;

  // Resolve the active period:
  //   undefined  → default to current calendar month
  //   "all"      → no filter (all time)
  //   "YYYY"     → full year
  //   "YYYY-MM"  → specific month
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const activePeriod = period ?? currentMonth;

  const isAll   = activePeriod === "all";
  const isYear  = /^\d{4}$/.test(activePeriod);
  const isMonth = /^\d{4}-\d{2}$/.test(activePeriod);

  // Human-readable subtitle label.
  let periodLabel: string;
  if (isAll) {
    periodLabel = "All periods";
  } else if (isYear) {
    periodLabel = activePeriod;
  } else {
    const [y, m] = activePeriod.split("-").map(Number);
    periodLabel = new Date(y, m - 1, 1).toLocaleDateString("en-ZA", { month: "long", year: "numeric" });
  }

  const supabase = getSupabaseServiceClient();

  // Build the summary stats query with the appropriate filter.
  let summaryQuery = supabase.from("bills").select("status, total_amount_due");
  if (isMonth) {
    summaryQuery = summaryQuery.eq("summary_month", `${activePeriod}-01`);
  } else if (isYear) {
    summaryQuery = summaryQuery
      .gte("summary_month", `${activePeriod}-01-01`)
      .lte("summary_month", `${activePeriod}-12-31`);
  }
  // isAll → no filter added

  const [summaryRes, queueRes, recentRes, propertiesRes, propertyOptionsRes] = await Promise.all([
    // Summary stats — filtered by the selected period (and property if set).
    (() => {
      let q = summaryQuery;
      if (propertyId) q = q.eq("primary_property_id", propertyId);
      return q;
    })(),

    // Review queue — ALL pending_review bills regardless of period (it's an action queue).
    (() => {
      let q = supabase
        .from("bills")
        .select(`
          id, status, billing_period_start, total_amount_due, raw_pdf_filename,
          billing_accounts ( account_number, customer_name ),
          primary_property:properties!primary_property_id ( address, suburb )
        `)
        .eq("status", "pending_review")
        .order("created_at", { ascending: false });
      if (propertyId) q = q.eq("primary_property_id", propertyId);
      return q;
    })(),

    // Period bills — all bills for the active period, ordered newest first.
    (() => {
      let q = supabase
        .from("bills")
        .select(`
          id, status, billing_period_start, total_amount_due, raw_pdf_filename,
          billing_accounts ( account_number, customer_name ),
          primary_property:properties!primary_property_id ( address, suburb )
        `)
        .order("billing_period_start", { ascending: false });
      if (isMonth) q = q.eq("summary_month", `${activePeriod}-01`);
      else if (isYear) q = q.gte("summary_month", `${activePeriod}-01-01`).lte("summary_month", `${activePeriod}-12-31`);
      if (propertyId) q = q.eq("primary_property_id", propertyId);
      return q;
    })(),

    // Property count — top-level only (exclude child units).
    supabase
      .from("properties")
      .select("id")
      .is("parent_property_id", null),

    // Property options for the filter dropdown — top-level only.
    supabase
      .from("properties")
      .select("id, address, complex_name, suburb")
      .is("parent_property_id", null)
      .order("address", { ascending: true }),
  ]);

  // ── Compute aggregates ───────────────────────────────────────────────────

  const summaryBills  = (summaryRes.data  ?? []) as BillSummary[];
  const queueBills    = (queueRes.data    ?? []) as unknown as BillRow[];
  const periodBills   = (recentRes.data   ?? []) as unknown as BillRow[];
  const propertyCount = (propertiesRes.data ?? []).length;

  type PropertyOptionRow = { id: string; address: string; complex_name: string | null; suburb: string | null };
  const propertyOptions: PropertyOption[] = ((propertyOptionsRes.data ?? []) as PropertyOptionRow[]).map((p) => ({
    id: p.id,
    label: p.complex_name ?? p.address,
  }));

  const pendingReviewCount = summaryBills.filter(b => b.status === "pending_review").length;
  const hardRejectedCount  = summaryBills.filter(b => b.status === "hard_rejected").length;

  const amountPending = summaryBills
    .filter(b => b.status === "pending_review")
    .reduce((sum, b) => sum + (b.total_amount_due ?? 0), 0);

  const amountApproved = summaryBills
    .filter(b => b.status === "approved")
    .reduce((sum, b) => sum + (b.total_amount_due ?? 0), 0);

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-8">

        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-zinc-900">Dashboard</h1>
            <p className="mt-0.5 text-sm text-zinc-500">{periodLabel}</p>
          </div>
          <Link
            href="/upload"
            className="shrink-0 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700 transition-colors"
          >
            + Upload Bill
          </Link>
        </div>

        {/* ── Period selector + property filter ── */}
        <div className="flex items-center gap-3 flex-wrap">
          <DashboardPeriodSelector selected={activePeriod} />
          <div className="hidden sm:block h-4 w-px bg-zinc-200" />
          <PropertyFilter properties={propertyOptions} selected={propertyId} />
        </div>

        {/* ── Summary cards ── */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard
            label="Needs Review"
            value={String(pendingReviewCount)}
            sub={pendingReviewCount === 1 ? "bill awaiting review" : "bills awaiting review"}
            accent={pendingReviewCount > 0 ? "amber" : undefined}
          />
          <StatCard
            label="Amount Pending"
            value={amountPending > 0 ? formatZAR(amountPending) : "—"}
            sub="in bills needing review"
            accent={amountPending > 0 ? "amber" : undefined}
          />
          <StatCard
            label="Amount Approved"
            value={amountApproved > 0 ? formatZAR(amountApproved) : "—"}
            sub="across approved bills"
            accent={amountApproved > 0 ? "green" : undefined}
          />
          <StatCard
            label="Properties"
            value={String(propertyCount)}
            sub={`${hardRejectedCount > 0 ? `${hardRejectedCount} rejected bill${hardRejectedCount !== 1 ? "s" : ""}` : "all bills processing"}`}
            accent={hardRejectedCount > 0 ? "red" : undefined}
          />
        </div>

        {/* ── Review queue ── */}
        <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
          <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-3">
            <h2 className="text-sm font-semibold text-zinc-700">Review Queue</h2>
            {queueBills.length > 0 && (
              <Link href="/bills" className="text-xs text-zinc-400 hover:text-zinc-900 transition-colors">
                View all →
              </Link>
            )}
          </div>
          <div className="px-5">
            {queueBills.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-sm font-medium text-green-700">✓ All bills reviewed</p>
                <p className="mt-0.5 text-xs text-zinc-400">No bills are currently awaiting review</p>
              </div>
            ) : (
              queueBills.map((bill) => (
                <BillListRow key={bill.id} bill={bill} />
              ))
            )}
          </div>
        </div>

        {/* ── Period bills ── */}
        <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
          <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-3">
            <h2 className="text-sm font-semibold text-zinc-700">
              Bills
              {periodBills.length > 0 && (
                <span className="ml-2 text-xs font-normal text-zinc-400">{periodBills.length}</span>
              )}
            </h2>
            <Link
              href={isMonth || isYear ? `/bills?period=${activePeriod}` : "/bills"}
              className="text-xs text-zinc-400 hover:text-zinc-900 transition-colors"
            >
              View all →
            </Link>
          </div>
          {periodBills.length === 0 ? (
            <div className="py-8 text-center px-5">
              <p className="text-sm text-zinc-400">No bills for this period</p>
              <Link
                href="/upload"
                className="mt-2 inline-block text-xs font-medium text-zinc-500 hover:text-zinc-900 transition-colors"
              >
                Upload a bill →
              </Link>
            </div>
          ) : (
            <div className="px-5 overflow-y-auto max-h-80">
              {periodBills.map((bill) => (
                <BillListRow key={bill.id} bill={bill} />
              ))}
            </div>
          )}
        </div>

        {/* ── Quick links ── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "All Bills",    href: "/bills"      },
            { label: "Properties",  href: "/properties"  },
            { label: "Upload Bill", href: "/upload"      },
          ].map(({ label, href }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center justify-center rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm font-medium text-zinc-600 hover:border-zinc-300 hover:text-zinc-900 transition-colors"
            >
              {label}
            </Link>
          ))}
        </div>

      </div>
    </div>
  );
}
