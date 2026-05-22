"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  CATEGORY_CHART_COLORS,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  CATEGORY_SHORT_LABELS,
  CATEGORY_VAT_RATE,
  USAGE_CATEGORIES,
  VAT_CHART_COLOR,
  VAT_LABEL,
  type UtilityCategory,
} from "@/lib/categories";
import {
  SAMPLE_MONTHS,
  SAMPLE_PROPERTIES,
  UTILITY_RECORDS,
  type SampleProperty,
} from "./sample-data";
import { CategoryFilter } from "./category-filter";
import { DateFilter } from "./date-filter";

// ── Formatters ────────────────────────────────────────────────────────────────

function formatZAR(n: number): string {
  return `R ${n.toLocaleString("en-ZA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// Whole-rand format — used in the dense matrix table.
function formatZAR0(n: number): string {
  return `R ${Math.round(n).toLocaleString("en-ZA")}`;
}

// Compact format for chart axes (e.g. "R 4.4k").
function formatCompactZAR(n: number): string {
  if (Math.abs(n) >= 1000) {
    const k = n / 1000;
    return `R ${k.toLocaleString("en-ZA", { maximumFractionDigits: k >= 10 ? 0 : 1 })}k`;
  }
  return `R ${Math.round(n)}`;
}

function formatNumber(n: number): string {
  return n.toLocaleString("en-ZA", { maximumFractionDigits: 1 });
}

// "2025-04" → "Apr 25"
function monthLabel(period: string): string {
  const [y, m] = period.split("-").map(Number);
  const mon = new Date(y, m - 1, 1).toLocaleDateString("en-ZA", { month: "short" });
  return `${mon} ${String(y).slice(-2)}`;
}

const TOOLTIP_CONTENT_STYLE = {
  fontSize: 12,
  borderRadius: 8,
  border: "1px solid #e4e4e7",
  boxShadow: "0 4px 12px rgb(0 0 0 / 0.06)",
};
const TOOLTIP_LABEL_STYLE = { fontWeight: 600, color: "#27272a", marginBottom: 2 };

// ── Small presentational components ───────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-5 py-5">
      <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold tabular-nums text-zinc-900">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-zinc-400">{sub}</p>}
    </div>
  );
}

function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
      <div className="border-b border-zinc-100 px-5 py-3">
        <h2 className="text-sm font-semibold text-zinc-700">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-zinc-400">{subtitle}</p>}
      </div>
      <div className="px-5 py-5">{children}</div>
    </div>
  );
}

/**
 * Measures its own width and renders the chart with explicit pixel dimensions.
 * Recharts charts need numeric width/height; measuring the container directly
 * (rather than using ResponsiveContainer) keeps the console free of the
 * transient "width(-1)" warning.
 */
function ChartArea({
  height,
  children,
}: {
  height: number;
  children: (width: number, height: number) => ReactElement;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setWidth(w);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} style={{ height }} className="w-full">
      {width > 0 && children(width, height)}
    </div>
  );
}

// ── Property dropdown (single-select) ─────────────────────────────────────────

function PropertyDropdown({
  properties,
  selected,
  onChange,
}: {
  properties: SampleProperty[];
  selected: string | null;
  onChange: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  const sel = properties.find((p) => p.id === selected);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap ${
          selected
            ? "bg-zinc-900 border-zinc-900 text-white"
            : "bg-white border-zinc-200 text-zinc-600 hover:border-zinc-300 hover:text-zinc-900"
        }`}
      >
        <span className="max-w-[170px] truncate">{sel?.name ?? "All properties"}</span>
        <svg
          className={`h-3 w-3 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path d="M2 4l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full mt-1.5 left-0 z-50 w-60 rounded-xl border border-zinc-200 bg-white shadow-lg overflow-hidden py-1">
          <button
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
            className={`w-full text-left px-3 py-2 text-xs transition-colors hover:bg-zinc-50 ${
              !selected ? "font-semibold text-zinc-900" : "text-zinc-600"
            }`}
          >
            All properties
          </button>
          {properties.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                onChange(p.id);
                setOpen(false);
              }}
              className={`w-full text-left px-3 py-2 text-xs transition-colors hover:bg-zinc-50 ${
                selected === p.id ? "font-semibold text-zinc-900 bg-zinc-50" : "text-zinc-600"
              }`}
            >
              {p.name}
              <span className="ml-1.5 text-zinc-400">{p.suburb}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Usage-chart dot (hollow for estimated readings) ───────────────────────────

interface UsageDotProps {
  cx?: number;
  cy?: number;
  index?: number;
  payload?: { usage: number | null; readingType: "actual" | "estimated" | null };
}

function renderUsageDot(color: string) {
  return (p: UsageDotProps): ReactElement => {
    if (p.cx == null || p.cy == null || p.payload?.usage == null) {
      return <g key={`dot-empty-${p.index}`} />;
    }
    const estimated = p.payload.readingType === "estimated";
    return (
      <circle
        key={`dot-${p.index}`}
        cx={p.cx}
        cy={p.cy}
        r={3.5}
        fill={estimated ? "#ffffff" : color}
        stroke={color}
        strokeWidth={1.5}
      />
    );
  };
}

// ── Main view ─────────────────────────────────────────────────────────────────

export function UtilitiesView() {
  // Filter state — everything selected by default (no filtering).
  const [selectedMonths, setSelectedMonths] = useState<string[]>(SAMPLE_MONTHS);
  const [selectedProperty, setSelectedProperty] = useState<string | null>(null);
  const [selectedCategories, setSelectedCategories] =
    useState<UtilityCategory[]>(CATEGORY_ORDER);

  const monthSet = useMemo(() => new Set(selectedMonths), [selectedMonths]);
  const categorySet = useMemo(() => new Set(selectedCategories), [selectedCategories]);

  // Records matching all three filters.
  const filtered = useMemo(
    () =>
      UTILITY_RECORDS.filter(
        (r) =>
          monthSet.has(r.month) &&
          categorySet.has(r.category) &&
          (selectedProperty === null || r.propertyId === selectedProperty),
      ),
    [monthSet, categorySet, selectedProperty],
  );

  // Selected months in calendar order — the X-axis for every time series.
  const monthsInView = useMemo(
    () => SAMPLE_MONTHS.filter((m) => monthSet.has(m)),
    [monthSet],
  );

  // "month|category" → total amount (ex-VAT), summed across in-scope properties.
  const amountByMonthCat = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of filtered) {
      const key = `${r.month}|${r.category}`;
      map.set(key, (map.get(key) ?? 0) + r.amount);
    }
    return map;
  }, [filtered]);

  // Categories that actually carry data in the current selection.
  const activeCategories = useMemo(
    () => selectedCategories.filter((c) => filtered.some((r) => r.category === c)),
    [selectedCategories, filtered],
  );

  // Headline totals.
  const totalExVat = useMemo(() => filtered.reduce((s, r) => s + r.amount, 0), [filtered]);
  const totalVat = useMemo(
    () => filtered.reduce((s, r) => s + r.amount * CATEGORY_VAT_RATE[r.category], 0),
    [filtered],
  );
  const totalSpend = totalExVat + totalVat;
  const hasVat = totalVat > 0.005;

  const monthsWithData = useMemo(
    () => new Set(filtered.map((r) => r.month)).size,
    [filtered],
  );
  const billCount = useMemo(
    () => new Set(filtered.map((r) => `${r.propertyId}|${r.month}`)).size,
    [filtered],
  );
  const topCategory = useMemo(() => {
    const totals = new Map<UtilityCategory, number>();
    for (const r of filtered) {
      totals.set(r.category, (totals.get(r.category) ?? 0) + r.amount);
    }
    let best: UtilityCategory | null = null;
    let bestVal = -1;
    for (const [c, v] of totals) {
      if (v > bestVal) {
        best = c;
        bestVal = v;
      }
    }
    return best ? { category: best, amount: bestVal } : null;
  }, [filtered]);

  // Spend-over-time: one row per month, a key per category plus "vat".
  const spendByMonth = useMemo(() => {
    return monthsInView.map((month) => {
      const row: Record<string, number | string> = { month, label: monthLabel(month) };
      let vat = 0;
      for (const cat of activeCategories) {
        const amt = amountByMonthCat.get(`${month}|${cat}`) ?? 0;
        if (amt !== 0) row[cat] = amt;
        vat += amt * CATEGORY_VAT_RATE[cat];
      }
      if (vat > 0) row.vat = Math.round(vat * 100) / 100;
      return row;
    });
  }, [monthsInView, activeCategories, amountByMonthCat]);

  // Usage-over-time: one mini line chart per metered category with data.
  const usageCharts = useMemo(() => {
    return USAGE_CATEGORIES.filter((c) => categorySet.has(c))
      .map((cat) => {
        const points = monthsInView.map((month) => {
          const recs = filtered.filter(
            (r) => r.month === month && r.category === cat && r.usage !== null,
          );
          if (recs.length === 0) {
            return { label: monthLabel(month), usage: null, readingType: null };
          }
          const usage = recs.reduce((s, r) => s + (r.usage ?? 0), 0);
          const estimated = recs.some((r) => r.readingType === "estimated");
          return {
            label: monthLabel(month),
            usage,
            readingType: estimated ? ("estimated" as const) : ("actual" as const),
          };
        });
        const unit =
          filtered.find((r) => r.category === cat && r.usageUnit)?.usageUnit ?? "";
        const hasData = points.some((p) => p.usage !== null);
        const hasEstimate = points.some((p) => p.readingType === "estimated");
        return { category: cat, points, unit, hasData, hasEstimate };
      })
      .filter((c) => c.hasData);
  }, [categorySet, monthsInView, filtered]);

  // Month × category matrix.
  const matrix = useMemo(() => {
    const rows = monthsInView.map((month) => {
      const cells = activeCategories.map(
        (cat) => amountByMonthCat.get(`${month}|${cat}`) ?? 0,
      );
      const vat = activeCategories.reduce(
        (s, cat, i) => s + cells[i] * CATEGORY_VAT_RATE[cat],
        0,
      );
      const total = cells.reduce((a, b) => a + b, 0) + vat;
      return { month, cells, vat, total };
    });
    const colTotals = activeCategories.map((_, i) =>
      rows.reduce((s, r) => s + r.cells[i], 0),
    );
    const vatTotal = rows.reduce((s, r) => s + r.vat, 0);
    const grandTotal = rows.reduce((s, r) => s + r.total, 0);
    return { rows, colTotals, vatTotal, grandTotal };
  }, [monthsInView, activeCategories, amountByMonthCat]);

  // Donut: total spend per category (plus VAT) over the whole window.
  const donutData = useMemo(() => {
    const slices = activeCategories
      .map((cat) => ({
        key: cat as string,
        label: CATEGORY_SHORT_LABELS[cat],
        value: filtered
          .filter((r) => r.category === cat)
          .reduce((s, r) => s + r.amount, 0),
        color: CATEGORY_CHART_COLORS[cat],
      }))
      .filter((s) => s.value > 0);
    if (hasVat) {
      slices.push({
        key: "vat",
        label: VAT_LABEL,
        value: Math.round(totalVat * 100) / 100,
        color: VAT_CHART_COLOR,
      });
    }
    return slices;
  }, [activeCategories, filtered, hasVat, totalVat]);

  // Property comparison: total spend per property for the selected months and
  // categories. Ignores the property filter so all properties stay comparable.
  const propertyTotals = useMemo(() => {
    return SAMPLE_PROPERTIES.map((p) => {
      const recs = UTILITY_RECORDS.filter(
        (r) =>
          monthSet.has(r.month) &&
          categorySet.has(r.category) &&
          r.propertyId === p.id,
      );
      const exVat = recs.reduce((s, r) => s + r.amount, 0);
      const vat = recs.reduce(
        (s, r) => s + r.amount * CATEGORY_VAT_RATE[r.category],
        0,
      );
      return { id: p.id, name: p.name, total: exVat + vat };
    });
  }, [monthSet, categorySet]);

  const filtersActive =
    selectedMonths.length !== SAMPLE_MONTHS.length ||
    selectedProperty !== null ||
    selectedCategories.length !== CATEGORY_ORDER.length;

  function resetFilters() {
    setSelectedMonths(SAMPLE_MONTHS);
    setSelectedProperty(null);
    setSelectedCategories(CATEGORY_ORDER);
  }

  const isEmpty = filtered.length === 0;

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 space-y-6">

        {/* ── Header ── */}
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Analysis</h1>
          <p className="mt-0.5 text-sm text-zinc-500">
            Spend and consumption analysis across all properties
          </p>
          <p className="mt-1 text-xs text-amber-600">
            Sample data — the backend is not yet connected.
          </p>
        </div>

        {/* ── Filter row ── */}
        <div className="sticky top-0 z-40 flex items-center gap-2 flex-wrap rounded-xl border border-zinc-200 bg-white/95 backdrop-blur-sm px-4 py-3 shadow-sm">
          <DateFilter
            months={SAMPLE_MONTHS}
            selected={selectedMonths}
            onChange={setSelectedMonths}
          />
          <div className="hidden sm:block h-4 w-px bg-zinc-200" />
          <PropertyDropdown
            properties={SAMPLE_PROPERTIES}
            selected={selectedProperty}
            onChange={setSelectedProperty}
          />
          <div className="hidden sm:block h-4 w-px bg-zinc-200" />
          <CategoryFilter
            selected={selectedCategories}
            onChange={setSelectedCategories}
          />
          {filtersActive && (
            <button
              onClick={resetFilters}
              className="ml-auto text-xs font-medium text-zinc-400 hover:text-zinc-900 transition-colors"
            >
              Reset filters
            </button>
          )}
        </div>

        {isEmpty ? (
          <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-8 py-16 text-center">
            <p className="text-sm font-medium text-zinc-500">No data for the current filters</p>
            <p className="mt-1 text-xs text-zinc-400">
              Try selecting more months, properties or categories.
            </p>
          </div>
        ) : (
          <>
            {/* ── Stat cards ── */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <StatCard
                label="Total spend"
                value={formatZAR(totalSpend)}
                sub="VAT included"
              />
              <StatCard
                label="Avg / month"
                value={monthsWithData > 0 ? formatZAR(totalSpend / monthsWithData) : "—"}
                sub={`across ${monthsWithData} month${monthsWithData !== 1 ? "s" : ""}`}
              />
              <StatCard
                label="Highest category"
                value={topCategory ? CATEGORY_LABELS[topCategory.category] : "—"}
                sub={topCategory ? `${formatZAR(topCategory.amount)} ex VAT` : undefined}
              />
              <StatCard
                label="Bills in view"
                value={String(billCount)}
                sub={`${monthsWithData} month${monthsWithData !== 1 ? "s" : ""} of data`}
              />
            </div>

            {/* ── Spend over time ── */}
            <SectionCard
              title="Spend over time"
              subtitle="Monthly charges by category, VAT shown as its own segment"
            >
              <ChartArea height={340}>
                {(w, h) => (
                  <BarChart
                    width={w}
                    height={h}
                    data={spendByMonth}
                    margin={{ top: 4, right: 8, left: 8, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11, fill: "#71717a" }}
                      tickLine={false}
                      axisLine={{ stroke: "#e4e4e7" }}
                    />
                    <YAxis
                      tickFormatter={(v) => formatCompactZAR(Number(v))}
                      tick={{ fontSize: 11, fill: "#71717a" }}
                      tickLine={false}
                      axisLine={false}
                      width={60}
                    />
                    <Tooltip
                      formatter={(value) => formatZAR(Number(value))}
                      contentStyle={TOOLTIP_CONTENT_STYLE}
                      labelStyle={TOOLTIP_LABEL_STYLE}
                      cursor={{ fill: "#fafafa" }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
                    {activeCategories.map((cat) => (
                      <Bar
                        key={cat}
                        dataKey={cat}
                        stackId="spend"
                        name={CATEGORY_SHORT_LABELS[cat]}
                        fill={CATEGORY_CHART_COLORS[cat]}
                      />
                    ))}
                    {hasVat && (
                      <Bar
                        dataKey="vat"
                        stackId="spend"
                        name={VAT_LABEL}
                        fill={VAT_CHART_COLOR}
                      />
                    )}
                  </BarChart>
                )}
              </ChartArea>
            </SectionCard>

            {/* ── Usage over time ── */}
            <SectionCard
              title="Usage over time"
              subtitle="Metered consumption — electricity in kWh, water and sewerage in kL"
            >
              {usageCharts.length === 0 ? (
                <p className="text-sm text-zinc-400">
                  No metered categories in the current selection.
                </p>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                    {usageCharts.map((chart) => {
                      const color = CATEGORY_CHART_COLORS[chart.category];
                      return (
                        <div
                          key={chart.category}
                          className="rounded-lg border border-zinc-100 px-3 pt-3 pb-1"
                        >
                          <p className="text-xs font-medium text-zinc-600">
                            {CATEGORY_LABELS[chart.category]}
                            <span className="ml-1 text-zinc-400">({chart.unit})</span>
                          </p>
                          <ChartArea height={180}>
                            {(w, h) => (
                              <LineChart
                                width={w}
                                height={h}
                                data={chart.points}
                                margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
                              >
                                <CartesianGrid
                                  strokeDasharray="3 3"
                                  stroke="#f4f4f5"
                                  vertical={false}
                                />
                                <XAxis
                                  dataKey="label"
                                  tick={{ fontSize: 10, fill: "#71717a" }}
                                  tickLine={false}
                                  axisLine={{ stroke: "#e4e4e7" }}
                                />
                                <YAxis
                                  tick={{ fontSize: 10, fill: "#71717a" }}
                                  tickLine={false}
                                  axisLine={false}
                                  width={40}
                                />
                                <Tooltip
                                  formatter={(value) =>
                                    `${formatNumber(Number(value))} ${chart.unit}`
                                  }
                                  contentStyle={TOOLTIP_CONTENT_STYLE}
                                  labelStyle={TOOLTIP_LABEL_STYLE}
                                />
                                <Line
                                  type="monotone"
                                  dataKey="usage"
                                  stroke={color}
                                  strokeWidth={2}
                                  connectNulls
                                  dot={renderUsageDot(color)}
                                  activeDot={{ r: 4 }}
                                />
                              </LineChart>
                            )}
                          </ChartArea>
                        </div>
                      );
                    })}
                  </div>
                  {usageCharts.some((c) => c.hasEstimate) && (
                    <div className="flex items-center gap-4 text-xs text-zinc-400">
                      <span className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full bg-zinc-400" />
                        Actual reading
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full border-[1.5px] border-zinc-400 bg-white" />
                        Estimated reading
                      </span>
                    </div>
                  )}
                </div>
              )}
            </SectionCard>

            {/* ── Monthly breakdown matrix ── */}
            <SectionCard
              title="Monthly breakdown"
              subtitle="Charges per category per month (Rand)"
            >
              <div className="overflow-x-auto -mx-5">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="border-b border-zinc-200 bg-zinc-50">
                      <th className="px-5 py-2.5 text-left font-medium text-zinc-500 uppercase tracking-wide whitespace-nowrap">
                        Month
                      </th>
                      {activeCategories.map((cat) => (
                        <th
                          key={cat}
                          className="px-4 py-2.5 text-right font-medium text-zinc-500 uppercase tracking-wide whitespace-nowrap"
                        >
                          <span className="inline-flex items-center gap-1.5">
                            <span
                              className="h-2 w-2 rounded-sm"
                              style={{ backgroundColor: CATEGORY_CHART_COLORS[cat] }}
                            />
                            {CATEGORY_SHORT_LABELS[cat]}
                          </span>
                        </th>
                      ))}
                      {hasVat && (
                        <th className="px-4 py-2.5 text-right font-medium text-zinc-500 uppercase tracking-wide whitespace-nowrap">
                          VAT
                        </th>
                      )}
                      <th className="px-5 py-2.5 text-right font-semibold text-zinc-600 uppercase tracking-wide whitespace-nowrap">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {matrix.rows.map((row) => (
                      <tr key={row.month} className="border-t border-zinc-50">
                        <td className="px-5 py-2.5 text-zinc-600 whitespace-nowrap">
                          {monthLabel(row.month)}
                        </td>
                        {row.cells.map((cell, i) => (
                          <td
                            key={activeCategories[i]}
                            className="px-4 py-2.5 text-right tabular-nums font-mono text-zinc-700 whitespace-nowrap"
                          >
                            {cell > 0 ? (
                              formatZAR0(cell)
                            ) : (
                              <span className="text-zinc-300">—</span>
                            )}
                          </td>
                        ))}
                        {hasVat && (
                          <td className="px-4 py-2.5 text-right tabular-nums font-mono text-zinc-500 whitespace-nowrap">
                            {row.vat > 0 ? (
                              formatZAR0(row.vat)
                            ) : (
                              <span className="text-zinc-300">—</span>
                            )}
                          </td>
                        )}
                        <td className="px-5 py-2.5 text-right tabular-nums font-mono font-semibold text-zinc-900 whitespace-nowrap">
                          {formatZAR0(row.total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-zinc-200 bg-zinc-50">
                      <td className="px-5 py-2.5 font-semibold text-zinc-700 whitespace-nowrap">
                        Total
                      </td>
                      {matrix.colTotals.map((total, i) => (
                        <td
                          key={activeCategories[i]}
                          className="px-4 py-2.5 text-right tabular-nums font-mono font-semibold text-zinc-700 whitespace-nowrap"
                        >
                          {formatZAR0(total)}
                        </td>
                      ))}
                      {hasVat && (
                        <td className="px-4 py-2.5 text-right tabular-nums font-mono font-semibold text-zinc-700 whitespace-nowrap">
                          {formatZAR0(matrix.vatTotal)}
                        </td>
                      )}
                      <td className="px-5 py-2.5 text-right tabular-nums font-mono font-bold text-zinc-900 whitespace-nowrap">
                        {formatZAR0(matrix.grandTotal)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </SectionCard>

            {/* ── Donut + property comparison ── */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <SectionCard
                title="Spend by category"
                subtitle="Share of total spend over the selected period"
              >
                <ChartArea height={280}>
                  {(w, h) => (
                    <PieChart width={w} height={h}>
                      <Pie
                        data={donutData}
                        dataKey="value"
                        nameKey="label"
                        cx="50%"
                        cy="50%"
                        innerRadius={58}
                        outerRadius={94}
                        paddingAngle={2}
                        stroke="none"
                      >
                        {donutData.map((slice) => (
                          <Cell key={slice.key} fill={slice.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value) => formatZAR(Number(value))}
                        contentStyle={TOOLTIP_CONTENT_STYLE}
                        labelStyle={TOOLTIP_LABEL_STYLE}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  )}
                </ChartArea>
              </SectionCard>

              <SectionCard
                title="Spend by property"
                subtitle={
                  selectedProperty
                    ? "All properties — current selection highlighted"
                    : "Total spend per property"
                }
              >
                <ChartArea height={280}>
                  {(w, h) => (
                    <BarChart
                      width={w}
                      height={h}
                      data={propertyTotals}
                      layout="vertical"
                      margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="#f4f4f5"
                        horizontal={false}
                      />
                      <XAxis
                        type="number"
                        tickFormatter={(v) => formatCompactZAR(Number(v))}
                        tick={{ fontSize: 11, fill: "#71717a" }}
                        tickLine={false}
                        axisLine={{ stroke: "#e4e4e7" }}
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        tick={{ fontSize: 11, fill: "#71717a" }}
                        tickLine={false}
                        axisLine={false}
                        width={108}
                      />
                      <Tooltip
                        formatter={(value) => formatZAR(Number(value))}
                        contentStyle={TOOLTIP_CONTENT_STYLE}
                        labelStyle={TOOLTIP_LABEL_STYLE}
                        cursor={{ fill: "#fafafa" }}
                      />
                      <Bar dataKey="total" radius={[0, 4, 4, 0]} barSize={24}>
                        {propertyTotals.map((p) => (
                          <Cell
                            key={p.id}
                            fill={
                              selectedProperty === null
                                ? "#52525b"
                                : p.id === selectedProperty
                                  ? "#18181b"
                                  : "#d4d4d8"
                            }
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  )}
                </ChartArea>
              </SectionCard>
            </div>
          </>
        )}

        {/* ── Footer note ── */}
        <p className="text-xs text-zinc-400 text-center pb-4">
          Mockup with sample data · charts powered by Recharts
        </p>
      </div>
    </div>
  );
}
