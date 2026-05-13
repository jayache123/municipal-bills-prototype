import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

// ── Types ─────────────────────────────────────────────────────────────────────

type Property = {
  id: string;
  address: string;
  complex_name: string | null;
  unit_number: string | null;
  erf_number: string | null;
  suburb: string | null;
  postal_code: string | null;
  status: string;
  billing_frequency: string;
  notes: string | null;
  created_at: string;
  parent_property_id: string | null;
  municipal_valuation: number | null;
  billing_accounts: {
    account_number: string;
    customer_name: string | null;
    business_partner_number: string | null;
    municipalities: { name: string } | null;
  } | null;
};

type ChildUnit = {
  id: string;
  unit_number: string | null;
  erf_number: string | null;
  address: string;
  suburb: string | null;
  status: string;
  municipal_valuation: number | null;
};

type BillRow = {
  id: string;
  status: string;
  billing_period_start: string | null;
  total_amount_due: number | null;
  due_date: string | null;
  raw_pdf_filename: string | null;
};

// ── Status configs ────────────────────────────────────────────────────────────

const PROPERTY_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  active:   { label: "Active",   className: "bg-green-50  text-green-700  ring-green-600/20" },
  inactive: { label: "Inactive", className: "bg-zinc-100  text-zinc-500   ring-zinc-400/20"  },
  sold:     { label: "Sold",     className: "bg-zinc-100  text-zinc-400   ring-zinc-300/20"  },
};

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
  not_applicable: { label: "N/A",          className: "bg-zinc-50    text-zinc-400   ring-zinc-400/20"   },
};

function StatusBadge({ status, config }: { status: string; config: typeof BILL_STATUS_CONFIG }) {
  const cfg = config[status] ?? { label: status, className: "bg-zinc-100 text-zinc-500 ring-zinc-400/20" };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}

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

function formatPeriod(start: string | null): string {
  if (!start) return "—";
  const [y, m] = start.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-ZA", {
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

export default async function PropertyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = getSupabaseServiceClient();

  // Fetch property, bills, and child units in parallel.
  const [propRes, billsRes, childUnitsRes] = await Promise.all([
    supabase
      .from("properties")
      .select(`
        id,
        address,
        complex_name,
        unit_number,
        erf_number,
        suburb,
        postal_code,
        status,
        billing_frequency,
        notes,
        created_at,
        billing_accounts (
          account_number,
          customer_name,
          business_partner_number,
          municipalities ( name )
        )
      `)
      .eq("id", id)
      .single(),

    supabase
      .from("bills")
      .select(`
        id,
        status,
        billing_period_start,
        total_amount_due,
        due_date,
        raw_pdf_filename
      `)
      .eq("primary_property_id", id)
      .order("billing_period_start", { ascending: false }),

    // Child units linked to this property as parent.
    supabase
      .from("properties")
      .select("id, unit_number, erf_number, address, suburb, status, municipal_valuation")
      .eq("parent_property_id", id)
      .order("unit_number", { ascending: true }),
  ]);

  if (propRes.error || !propRes.data) notFound();

  const prop = propRes.data as unknown as Property;
  const bills = (billsRes.data ?? []) as unknown as BillRow[];
  const childUnits = (childUnitsRes.data ?? []) as unknown as ChildUnit[];
  const acct = prop.billing_accounts;
  const muni = acct?.municipalities;

  const propStatusCfg = PROPERTY_STATUS_CONFIG[prop.status] ?? {
    label: prop.status,
    className: "bg-zinc-100 text-zinc-500 ring-zinc-400/20",
  };

  // Build the display name shown as the page heading
  const displayName = [
    prop.complex_name,
    prop.unit_number ? `Unit ${prop.unit_number}` : null,
    prop.address,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-6">

        {/* ── Page heading ── */}
        <h1 className="text-lg font-semibold text-zinc-900 truncate">
          {displayName}
        </h1>

        {/* ── Status bar ── */}
        <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-5 py-4">
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${propStatusCfg.className}`}>
            {propStatusCfg.label}
          </span>
          <span className="text-sm font-medium text-zinc-800">{prop.address}</span>
          {prop.suburb && (
            <span className="text-sm text-zinc-400">{prop.suburb}</span>
          )}
        </div>

        {/* ── Property details ── */}
        <SectionCard title="Property Details">
          <InfoGrid
            items={[
              { label: "Municipality",        value: muni?.name },
              { label: "Account Number",      value: acct?.account_number && (
                <span className="font-mono">{acct.account_number}</span>
              )},
              { label: "Customer",            value: acct?.customer_name },
              { label: "Address",             value: prop.address },
              { label: "Suburb",              value: prop.suburb },
              { label: "Complex",             value: prop.complex_name },
              { label: "Unit",                value: prop.unit_number },
              { label: "Erf Number",          value: prop.erf_number },
              { label: "Postal Code",         value: prop.postal_code },
              { label: "Municipal Valuation",  value: prop.municipal_valuation
                  ? `R ${Number(prop.municipal_valuation).toLocaleString("en-ZA")}`
                  : null },
              { label: "Billing Frequency",   value: prop.billing_frequency
                  ? prop.billing_frequency.charAt(0).toUpperCase() + prop.billing_frequency.slice(1)
                  : null },
              { label: "Status",              value: (
                <StatusBadge status={prop.status} config={PROPERTY_STATUS_CONFIG} />
              )},
              { label: "Registered",          value: new Date(prop.created_at).toLocaleDateString("en-ZA", {
                  day: "numeric", month: "short", year: "numeric"
                })},
            ]}
          />
          {prop.notes && (
            <p className="mt-5 text-sm text-zinc-500 border-t border-zinc-100 pt-4">{prop.notes}</p>
          )}
        </SectionCard>

        {/* ── Units (only shown for parent properties) ── */}
        {childUnits.length > 0 && (
          <SectionCard title={`Units (${childUnits.length})`}>
            <div className="overflow-x-auto -mx-5 px-5">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-zinc-100">
                    {["Unit", "Erf", "Municipal Valuation", "Status", ""].map((h) => (
                      <th
                        key={h}
                        scope="col"
                        className="pb-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wide whitespace-nowrap pr-6 last:pr-0"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50">
                  {childUnits.map((unit) => (
                    <tr key={unit.id} className="hover:bg-zinc-50/60 transition-colors">
                      <td className="py-3 pr-6 text-sm font-medium text-zinc-800 whitespace-nowrap">
                        Unit {unit.unit_number ?? "—"}
                      </td>
                      <td className="py-3 pr-6 text-sm text-zinc-500 whitespace-nowrap">
                        {unit.erf_number ? `Erf ${unit.erf_number}` : "—"}
                      </td>
                      <td className="py-3 pr-6 text-sm text-zinc-700 font-mono whitespace-nowrap">
                        {unit.municipal_valuation
                          ? `R ${Number(unit.municipal_valuation).toLocaleString("en-ZA")}`
                          : <span className="text-zinc-300">Not yet captured</span>}
                      </td>
                      <td className="py-3 pr-6 whitespace-nowrap">
                        <StatusBadge status={unit.status} config={PROPERTY_STATUS_CONFIG} />
                      </td>
                      <td className="py-3 whitespace-nowrap text-right">
                        <Link
                          href={`/properties/${unit.id}`}
                          className="text-xs font-medium text-zinc-400 hover:text-zinc-900 transition-colors"
                        >
                          View →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        )}

        {/* ── Bills history ── */}
        <SectionCard title={`Bills (${bills.length})`}>
          {bills.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm text-zinc-400">No bills for this property yet</p>
              <Link
                href="/upload"
                className="mt-3 inline-block text-xs font-medium text-zinc-500 hover:text-zinc-900 transition-colors"
              >
                Upload a bill →
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto -mx-5 px-5">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-zinc-100">
                    {["Status", "Period", "Amount Due", "Due Date", ""].map((h) => (
                      <th
                        key={h}
                        scope="col"
                        className="pb-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wide whitespace-nowrap pr-6 last:pr-0"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50">
                  {bills.map((bill) => (
                    <tr key={bill.id} className="hover:bg-zinc-50/60 transition-colors">
                      <td className="py-3 pr-6 whitespace-nowrap">
                        <StatusBadge status={bill.status} config={BILL_STATUS_CONFIG} />
                      </td>
                      <td className="py-3 pr-6 text-sm text-zinc-600 whitespace-nowrap">
                        {formatPeriod(bill.billing_period_start)}
                      </td>
                      <td className="py-3 pr-6 text-sm font-semibold text-zinc-800 whitespace-nowrap">
                        {formatZAR(bill.total_amount_due)}
                      </td>
                      <td className="py-3 pr-6 text-sm text-zinc-500 whitespace-nowrap">
                        {formatDate(bill.due_date)}
                      </td>
                      <td className="py-3 whitespace-nowrap text-right">
                        <Link
                          href={`/bills/${bill.id}`}
                          className="text-xs font-medium text-zinc-400 hover:text-zinc-900 transition-colors"
                        >
                          View →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

      </div>
    </div>
  );
}
