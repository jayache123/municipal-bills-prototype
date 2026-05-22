"use client";

import { useEffect, useRef, useState } from "react";

// Renders "2025-04" as "Apr".
function monthName(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-ZA", { month: "short" });
}

/**
 * Multi-select date filter. Months are grouped by calendar year; each year has
 * a checkbox that toggles all of its months at once.
 */
export function DateFilter({
  months,
  selected,
  onChange,
}: {
  months: string[]; // all available months, ascending
  selected: string[]; // currently-selected months
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on click outside.
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  const selectedSet = new Set(selected);
  const allSelected = months.length > 0 && months.every((m) => selectedSet.has(m));
  const isFiltering = !allSelected;

  const years: string[] = [...new Set(months.map((m) => m.slice(0, 4)))];

  // Re-emit in the canonical (ascending) month order.
  function emit(next: Set<string>) {
    onChange(months.filter((m) => next.has(m)));
  }

  function toggleMonth(m: string) {
    const next = new Set(selectedSet);
    if (next.has(m)) next.delete(m);
    else next.add(m);
    emit(next);
  }

  function toggleYear(year: string) {
    const yearMonths = months.filter((m) => m.startsWith(year));
    const allOn = yearMonths.every((m) => selectedSet.has(m));
    const next = new Set(selectedSet);
    for (const m of yearMonths) {
      if (allOn) next.delete(m);
      else next.add(m);
    }
    emit(next);
  }

  const label = allSelected
    ? "All dates"
    : selected.length === 0
      ? "No dates"
      : `${selected.length} month${selected.length !== 1 ? "s" : ""}`;

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap ${
          isFiltering
            ? "bg-zinc-900 border-zinc-900 text-white"
            : "bg-white border-zinc-200 text-zinc-600 hover:border-zinc-300 hover:text-zinc-900"
        }`}
      >
        <span>{label}</span>
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
        <div className="absolute top-full mt-1.5 left-0 z-50 w-72 rounded-xl border border-zinc-200 bg-white shadow-lg overflow-hidden">
          <div className="flex items-center justify-between border-b border-zinc-100 px-3 py-2">
            <button
              onClick={() => emit(new Set(months))}
              className="text-xs font-medium text-zinc-600 hover:text-zinc-900 transition-colors"
            >
              Select all
            </button>
            <button
              onClick={() => emit(new Set())}
              className="text-xs font-medium text-zinc-400 hover:text-zinc-700 transition-colors"
            >
              Clear
            </button>
          </div>

          <div className="max-h-72 overflow-y-auto p-2 space-y-3">
            {years.map((year) => {
              const yearMonths = months.filter((m) => m.startsWith(year));
              const yearAllOn = yearMonths.every((m) => selectedSet.has(m));
              return (
                <div key={year}>
                  <label className="flex items-center gap-2 px-1 py-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={yearAllOn}
                      onChange={() => toggleYear(year)}
                      className="h-3.5 w-3.5 rounded accent-zinc-900"
                    />
                    <span className="text-xs font-semibold text-zinc-700">{year}</span>
                  </label>
                  <div className="mt-1 grid grid-cols-3 gap-1">
                    {yearMonths.map((m) => (
                      <label
                        key={m}
                        className="flex items-center gap-1.5 rounded-md px-2 py-1 cursor-pointer hover:bg-zinc-50"
                      >
                        <input
                          type="checkbox"
                          checked={selectedSet.has(m)}
                          onChange={() => toggleMonth(m)}
                          className="h-3.5 w-3.5 rounded accent-zinc-900"
                        />
                        <span className="text-xs text-zinc-600">{monthName(m)}</span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
