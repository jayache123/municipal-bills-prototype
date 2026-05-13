import Link from "next/link";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

// ── Types ─────────────────────────────────────────────────────────────────────

type PropertyRow = {
  id: string;
  address: string;
  complex_name: string | null;
  unit_number: string | null;
  erf_number: string | null;
  suburb: string | null;
  status: string;
  created_at: string;
  billing_accounts: {
    account_number: string;
    customer_name: string | null;
    municipalities: { name: string } | null;
  } | null;
};

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  active:   { label: "Active",   className: "bg-green-50  text-green-700  ring-green-600/20"  },
  inactive: { label: "Inactive", className: "bg-zinc-100  text-zinc-500   ring-zinc-400/20"   },
  sold:     { label: "Sold",     className: "bg-zinc-100  text-zinc-400   ring-zinc-300/20"   },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, className: "bg-zinc-100 text-zinc-500 ring-zinc-400/20" };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function PropertiesPage() {
  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase
    .from("properties")
    .select(`
      id,
      address,
      complex_name,
      unit_number,
      erf_number,
      suburb,
      status,
      created_at,
      billing_accounts (
        account_number,
        customer_name,
        municipalities ( name )
      )
    `)
    // Only show top-level records: standalone properties and complex parents.
    // Child unit records (parent_property_id IS NOT NULL) are visible via the
    // "Units" section on each parent's detail page.
    .is("parent_property_id", null)
    .order("address", { ascending: true });

  if (error) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center px-4">
        <p className="text-sm text-red-600">Failed to load properties: {error.message}</p>
      </div>
    );
  }

  const properties = (data ?? []) as unknown as PropertyRow[];

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">

        {/* ── Header ── */}
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-zinc-900">Properties</h1>
          <p className="mt-0.5 text-sm text-zinc-500">
            {properties.length} propert{properties.length !== 1 ? "ies" : "y"} registered
          </p>
        </div>

        {/* ── Empty state ── */}
        {properties.length === 0 && (
          <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-8 py-16 text-center">
            <p className="text-sm font-medium text-zinc-500">No properties yet</p>
            <p className="mt-1 text-xs text-zinc-400">Properties are created automatically when bills are uploaded</p>
          </div>
        )}

        {/* ── Table ── */}
        {properties.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-zinc-100">
                <thead>
                  <tr className="bg-zinc-50">
                    {["Status", "Property", "Complex / Unit", "Account", "Municipality"].map((h) => (
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
                  {properties.map((prop) => {
                    const acct = prop.billing_accounts;
                    const muni = acct?.municipalities;
                    const hasComplex = prop.complex_name || prop.unit_number;

                    return (
                      <tr key={prop.id} className="relative cursor-pointer hover:bg-zinc-50/60 transition-colors">

                        {/* Stretched link — covers the entire row */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <Link href={`/properties/${prop.id}`} className="absolute inset-0" aria-label={`View property ${prop.address}`} />
                          <StatusBadge status={prop.status} />
                        </td>

                        {/* Property */}
                        <td className="px-4 py-3 text-sm text-zinc-800 max-w-[240px]">
                          <span className="font-medium">{prop.address}</span>
                          {prop.suburb && (
                            <span className="ml-1.5 text-xs text-zinc-400">{prop.suburb}</span>
                          )}
                        </td>

                        {/* Complex / Unit */}
                        <td className="px-4 py-3 text-sm text-zinc-600 whitespace-nowrap">
                          {hasComplex ? (
                            <>
                              {prop.complex_name && <span>{prop.complex_name}</span>}
                              {prop.complex_name && prop.unit_number && (
                                <span className="text-zinc-300 mx-1">·</span>
                              )}
                              {prop.unit_number && (
                                <span className="text-zinc-500">Unit {prop.unit_number}</span>
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
                            <p className="text-xs text-zinc-400 truncate max-w-[180px]">
                              {acct.customer_name}
                            </p>
                          )}
                        </td>

                        {/* Municipality */}
                        <td className="px-4 py-3 text-sm text-zinc-500 whitespace-nowrap">
                          {muni?.name ?? "—"}
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
