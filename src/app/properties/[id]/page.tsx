import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { StatusPill } from "@/components/status-pill";
import { BILL_STATUS_OPTIONS, PROPERTY_STATUS_OPTIONS } from "@/lib/status-options";
import { updatePropertyStatus } from "../actions";
import { updateBillStatus } from "@/app/bills/[id]/actions";

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
  issue_date: string | null;
  billing_period_start: string | null;
  total_amount_due: number | null;
  due_date: string | null;
  raw_pdf_filename: string | null;
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

  // Step 1: fetch property details and child units in parallel.
  const [propRes, childUnitsRes] = await Promise.all([
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

    // Child units linked to this property as parent.
    supabase
      .from("properties")
      .select("id, unit_number, erf_number, address, suburb, status, municipal_valuation")
      .eq("parent_property_id", id)
      .order("unit_number", { ascending: true }),
  ]);

  if (propRes.error || !propRes.data) notFound();

  const prop = propRes.data as unknown as Property;
  const childUnits = (childUnitsRes.data ?? []) as unknown as ChildUnit[];

  // Step 2: fetch bills for this property AND any child units, so that bills
  // linked directly to a unit record still appear on the parent property page.
  const childUnitIds = childUnits.map((u) => u.id);
  const propertyIds = [id, ...childUnitIds];
  const billsRes = await supabase
    .from("bills")
    .select(`
      id,
      status,
      issue_date,
      billing_period_start,
      total_amount_due,
      due_date,
      raw_pdf_filename
    `)
    .in("primary_property_id", propertyIds)
    .order("billing_period_start", { ascending: false });

  const bills = (billsRes.data ?? []) as unknown as BillRow[];
  const acct = prop.billing_accounts;
  const muni = acct?.municipalities;

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
          <StatusPill
            currentStatus={prop.status}
            options={PROPERTY_STATUS_OPTIONS}
            onSelect={updatePropertyStatus.bind(null, prop.id)}
          />
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
                <StatusPill currentStatus={prop.status} options={PROPERTY_STATUS_OPTIONS} onSelect={updatePropertyStatus.bind(null, prop.id)} />
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
                    {["Unit", "Erf", "Municipal Valuation", "Status"].map((h) => (
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
                    <tr key={unit.id} className="relative cursor-pointer hover:bg-zinc-50/60 transition-colors">
                      <td className="py-3 pr-6 text-sm font-medium text-zinc-800 whitespace-nowrap">
                        <Link href={`/properties/${unit.id}`} className="absolute inset-0" aria-label={`View unit ${unit.unit_number}`} />
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
                        <StatusPill
                          currentStatus={unit.status}
                          options={PROPERTY_STATUS_OPTIONS}
                          onSelect={updatePropertyStatus.bind(null, unit.id)}
                        />
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
                    {["Status", "Period", "Amount Due", "Due Date"].map((h) => (
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
                    <tr key={bill.id} className="relative cursor-pointer hover:bg-zinc-50/60 transition-colors">
                      <td className="py-3 pr-6 whitespace-nowrap">
                        <Link href={`/bills/${bill.id}`} className="absolute inset-0" aria-label={`View bill`} />
                        <StatusPill
                          currentStatus={bill.status}
                          options={BILL_STATUS_OPTIONS}
                          onSelect={updateBillStatus.bind(null, bill.id)}
                        />
                      </td>
                      <td className="py-3 pr-6 text-sm text-zinc-600 whitespace-nowrap">
                        {formatPeriod(bill.issue_date ?? bill.billing_period_start)}
                      </td>
                      <td className="py-3 pr-6 text-sm font-semibold text-zinc-800 whitespace-nowrap">
                        {formatZAR(bill.total_amount_due)}
                      </td>
                      <td className="py-3 pr-6 text-sm text-zinc-500 whitespace-nowrap">
                        {formatDate(bill.due_date)}
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
