"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** All months from Jan 2024 through the current calendar month. */
function generateMonths(): string[] {
  const months: string[] = [];
  const now = new Date();
  let y = 2024, m = 1;
  while (y < now.getFullYear() || (y === now.getFullYear() && m <= now.getMonth() + 1)) {
    months.push(`${y}-${String(m).padStart(2, "0")}`);
    if (++m > 12) { m = 1; y++; }
  }
  return months;
}

function formatMonthLabel(period: string): { month: string; year: string } {
  const [y, m] = period.split("-").map(Number);
  return {
    month: new Date(y, m - 1, 1).toLocaleDateString("en-ZA", { month: "short" }),
    year:  String(y),
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Dashboard period selector — three tiers:
 *   1. [All]  [2024]  [2025]  [2026]  — "all" or a full-year view
 *   2.  ‹  [ Apr 2026 ] [ Apr 2026 ] [ May 2026 ]  ›  — 3-month scroller
 *
 * Props:
 *   selected — "all" | "YYYY" | "YYYY-MM"
 */
export function DashboardPeriodSelector({ selected }: { selected: string }) {
  const router   = useRouter();
  const pathname = usePathname();

  const months = generateMonths();
  const years  = [...new Set(months.map((m) => m.slice(0, 4)))];

  const isMonthSelected = /^\d{4}-\d{2}$/.test(selected);
  const isYearSelected  = /^\d{4}$/.test(selected);
  const selectedIdx     = isMonthSelected ? months.indexOf(selected) : -1;

  // Initialise the scroller so the active month is visible (centred when possible).
  const [offset, setOffset] = useState(() => {
    const target = selectedIdx >= 0 ? selectedIdx : months.length - 1;
    return Math.max(0, Math.min(target - 1, months.length - 3));
  });

  const visible       = months.slice(offset, offset + 3);
  const canScrollLeft  = offset > 0;
  const canScrollRight = offset + 3 < months.length;

  function navigate(period: string) {
    router.push(period === "all" ? pathname : `${pathname}?period=${period}`);
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-3">

      {/* ── Tier 1: All + year pills ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => navigate("all")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            selected === "all"
              ? "bg-zinc-900 text-white"
              : "border border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:text-zinc-900"
          }`}
        >
          All
        </button>

        {years.map((year) => (
          <button
            key={year}
            onClick={() => navigate(year)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              isYearSelected && selected === year
                ? "bg-zinc-900 text-white"
                : "border border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:text-zinc-900"
            }`}
          >
            {year}
          </button>
        ))}
      </div>

      {/* ── Tier 2: 3-month scroller ── */}
      <div className="flex items-center gap-2">

        {/* Left arrow */}
        <button
          onClick={() => setOffset((o) => Math.max(0, o - 1))}
          disabled={!canScrollLeft}
          aria-label="Previous month"
          className="flex h-[60px] w-7 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-400 hover:border-zinc-300 hover:text-zinc-700 disabled:opacity-25 disabled:cursor-not-allowed transition-colors text-base"
        >
          ‹
        </button>

        {/* Month tiles */}
        <div className="flex gap-2">
          {visible.map((month) => {
            const { month: mLabel, year: yLabel } = formatMonthLabel(month);
            const active = month === selected;
            return (
              <button
                key={month}
                onClick={() => navigate(month)}
                className={`flex flex-col items-center justify-center w-[76px] h-[60px] rounded-xl border transition-colors ${
                  active
                    ? "bg-zinc-900 border-zinc-900 text-white"
                    : "bg-white border-zinc-200 text-zinc-700 hover:border-zinc-400 hover:text-zinc-900"
                }`}
              >
                <span className="text-sm font-semibold leading-tight">{mLabel}</span>
                <span className={`text-xs leading-tight mt-0.5 ${active ? "text-zinc-400" : "text-zinc-400"}`}>
                  {yLabel}
                </span>
              </button>
            );
          })}
        </div>

        {/* Right arrow */}
        <button
          onClick={() => setOffset((o) => Math.min(months.length - 3, o + 1))}
          disabled={!canScrollRight}
          aria-label="Next month"
          className="flex h-[60px] w-7 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-400 hover:border-zinc-300 hover:text-zinc-700 disabled:opacity-25 disabled:cursor-not-allowed transition-colors text-base"
        >
          ›
        </button>

      </div>
    </div>
  );
}
