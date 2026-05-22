// Shared utility-category metadata.
//
// The eight category values mirror the `utility_category` enum in
// supabase/schema.sql. Keeping labels, colours and ordering in one place means
// the bill detail page, the Utilities page and any future page stay consistent.

export type UtilityCategory =
  | "rates"
  | "electricity"
  | "water"
  | "refuse"
  | "sewerage"
  | "improvement_district"
  | "sundry"
  | "other";

// Display order used across the app (matches the bill detail page).
export const CATEGORY_ORDER: UtilityCategory[] = [
  "rates",
  "electricity",
  "water",
  "refuse",
  "sewerage",
  "improvement_district",
  "sundry",
  "other",
];

// Full labels — used in legends, info grids and prose.
export const CATEGORY_LABELS: Record<UtilityCategory, string> = {
  rates: "Property Rates",
  electricity: "Electricity",
  water: "Water",
  refuse: "Refuse",
  sewerage: "Sewerage",
  improvement_district: "Improvement District (CID)",
  sundry: "Sundries",
  other: "Other",
};

// Short labels — used in tight spaces (chart legends, table headers).
export const CATEGORY_SHORT_LABELS: Record<UtilityCategory, string> = {
  rates: "Rates",
  electricity: "Electricity",
  water: "Water",
  refuse: "Refuse",
  sewerage: "Sewerage",
  improvement_district: "CID",
  sundry: "Sundries",
  other: "Other",
};

// Tailwind badge classes — same colour scheme as the bill detail page.
export const CATEGORY_BADGE_CLASSES: Record<UtilityCategory, string> = {
  rates: "bg-blue-50 text-blue-700",
  electricity: "bg-yellow-50 text-yellow-700",
  water: "bg-cyan-50 text-cyan-700",
  refuse: "bg-green-50 text-green-700",
  sewerage: "bg-orange-50 text-orange-700",
  improvement_district: "bg-purple-50 text-purple-700",
  sundry: "bg-zinc-100 text-zinc-600",
  other: "bg-zinc-100 text-zinc-500",
};

// Solid hex colours for charts — the same hues as the badge classes above.
export const CATEGORY_CHART_COLORS: Record<UtilityCategory, string> = {
  rates: "#3b82f6", // blue-500
  electricity: "#eab308", // yellow-500
  water: "#06b6d4", // cyan-500
  refuse: "#22c55e", // green-500
  sewerage: "#f97316", // orange-500
  improvement_district: "#a855f7", // purple-500
  sundry: "#71717a", // zinc-500
  other: "#a1a1aa", // zinc-400
};

// VAT is not a utility category — it is a bill-level tax. It is shown as its
// own segment in the spend charts so the totals reconcile to the real bill.
export const VAT_LABEL = "VAT";
export const VAT_CHART_COLOR = "#cbd5e1"; // slate-300

// VAT rate applied to each category. In Cape Town, property rates are
// zero-rated; the remaining municipal charges are standard-rated at 15%.
export const CATEGORY_VAT_RATE: Record<UtilityCategory, number> = {
  rates: 0,
  electricity: 0.15,
  water: 0.15,
  refuse: 0.15,
  sewerage: 0.15,
  improvement_district: 0.15,
  sundry: 0.15,
  other: 0.15,
};

// Categories that carry a meaningful metered consumption figure (kWh / kL).
// Only these appear in the usage-over-time charts.
export const USAGE_CATEGORIES: UtilityCategory[] = [
  "electricity",
  "water",
  "sewerage",
];
