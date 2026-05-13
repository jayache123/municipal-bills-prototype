"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Period navigation bar: ◀ May 2026 ▶  ·  All periods
 *
 * Renders as plain <Link> elements — no client-side JS needed beyond rendering.
 * The parent server page reads ?period=YYYY-MM from searchParams.
 *
 * Props:
 *   selected  — currently active period as "YYYY-MM" (or null = all periods)
 *   showAll   — whether to show the "All periods" escape hatch (default true)
 */
export function PeriodSelector({
  selected,
  showAll = true,
}: {
  selected: string | null;
  showAll?: boolean;
}) {
  const pathname = usePathname();

  // Parse selected into year + month numbers.
  const [selYear, selMonth] = selected
    ? selected.split("-").map(Number)
    : [new Date().getFullYear(), new Date().getMonth() + 1];

  // Build YYYY-MM string for a given offset from the current selection.
  function periodParam(offsetMonths: number): string {
    const d = new Date(selYear, selMonth - 1 + offsetMonths, 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  }

  // Human-readable label for the selected period.
  const label = new Date(selYear, selMonth - 1, 1).toLocaleDateString("en-ZA", {
    month: "long",
    year: "numeric",
  });

  const prevParam = periodParam(-1);
  const nextParam = periodParam(+1);

  // Don't allow navigating past the current month.
  const now = new Date();
  const isCurrentMonth = selYear === now.getFullYear() && selMonth === (now.getMonth() + 1);
  const isFutureMonth  = new Date(selYear, selMonth - 1, 1) > now;

  return (
    <div className="flex items-center gap-3">
      {/* Prev */}
      <Link
        href={`${pathname}?period=${prevParam}`}
        className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300 hover:text-zinc-900 transition-colors text-sm"
        aria-label="Previous month"
      >
        ‹
      </Link>

      {/* Current period label */}
      <span className="min-w-[120px] text-center text-sm font-medium text-zinc-800">
        {selected ? label : "All periods"}
      </span>

      {/* Next — disabled if at or past current month */}
      {isCurrentMonth || isFutureMonth ? (
        <span className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-100 bg-zinc-50 text-zinc-300 text-sm cursor-not-allowed">
          ›
        </span>
      ) : (
        <Link
          href={`${pathname}?period=${nextParam}`}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300 hover:text-zinc-900 transition-colors text-sm"
          aria-label="Next month"
        >
          ›
        </Link>
      )}

      {/* All periods escape hatch */}
      {showAll && selected && (
        <Link
          href={pathname}
          className="text-xs text-zinc-400 hover:text-zinc-700 transition-colors"
        >
          All periods
        </Link>
      )}
    </div>
  );
}
