"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
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

function formatMonthLabel(period: string): string {
  const [y, m] = period.split("-").map(Number);
  const month = new Date(y, m - 1, 1).toLocaleDateString("en-ZA", { month: "short" });
  return `${month} ${y}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Single-row dashboard period selector:
 *   [All] [2024] [2025] [2026]  |  ‹  [Apr 2026]  [May 2026]  [Jun 2026]  ›
 *
 * Props:
 *   selected — "all" | "YYYY" | "YYYY-MM"
 */
export function DashboardPeriodSelector({ selected }: { selected: string }) {
  const router       = useRouter();
  const pathname     = usePathname();
  const searchParams = useSearchParams();

  const months = generateMonths();
  const years  = [...new Set(months.map((m) => m.slice(0, 4)))];

  const isMonthSelected = /^\d{4}-\d{2}$/.test(selected);
  const isYearSelected  = /^\d{4}$/.test(selected);
  const selectedIdx     = isMonthSelected ? months.indexOf(selected) : -1;

  // Position the scroller so the active month is visible (centred when possible).
  const [offset, setOffset] = useState(() => {
    const target = selectedIdx >= 0 ? selectedIdx : months.length - 1;
    return Math.max(0, Math.min(target - 1, months.length - 3));
  });

  const visible        = months.slice(offset, offset + 3);
  const canScrollLeft  = offset > 0;
  const canScrollRight = offset + 3 < months.length;

  // Always push an explicit ?period= param so the server can distinguish
  // "all" from "no param (default to current month)".
  // Preserve any other params (e.g. ?property=…) that may already be in the URL.
  function navigate(period: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("period", period);
    router.push(`${pathname}?${params.toString()}`);
  }

  // Shared pill classes
  const basePill  = "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap";
  const activePill  = "bg-zinc-900 text-white";
  const inactivePill = "border border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:text-zinc-900";

  return (
    <div className="flex items-center gap-2 flex-wrap">

      {/* ── All ── */}
      <button
        onClick={() => navigate("all")}
        className={`${basePill} ${selected === "all" ? activePill : inactivePill}`}
      >
        All
      </button>

      {/* ── Year pills ── */}
      {years.map((year) => (
        <button
          key={year}
          onClick={() => navigate(year)}
          className={`${basePill} ${isYearSelected && selected === year ? activePill : inactivePill}`}
        >
          {year}
        </button>
      ))}

      {/* ── Divider ── */}
      <div className="h-4 w-px bg-zinc-200 mx-1" />

      {/* ── Left arrow ── */}
      <button
        onClick={() => setOffset((o) => Math.max(0, o - 1))}
        disabled={!canScrollLeft}
        aria-label="Previous month"
        className="flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-400 hover:border-zinc-300 hover:text-zinc-700 disabled:opacity-25 disabled:cursor-not-allowed transition-colors text-sm"
      >
        ‹
      </button>

      {/* ── Month pills ── */}
      {visible.map((month) => {
        const active = month === selected;
        return (
          <button
            key={month}
            onClick={() => navigate(month)}
            className={`${basePill} ${active ? activePill : inactivePill}`}
          >
            {formatMonthLabel(month)}
          </button>
        );
      })}

      {/* ── Right arrow ── */}
      <button
        onClick={() => setOffset((o) => Math.min(months.length - 3, o + 1))}
        disabled={!canScrollRight}
        aria-label="Next month"
        className="flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-400 hover:border-zinc-300 hover:text-zinc-700 disabled:opacity-25 disabled:cursor-not-allowed transition-colors text-sm"
      >
        ›
      </button>

    </div>
  );
}
