"use client";

import { useEffect, useRef, useState } from "react";
import {
  CATEGORY_CHART_COLORS,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  type UtilityCategory,
} from "@/lib/categories";

/**
 * Multi-select utility-category filter. Each category shows its chart colour
 * so the dropdown reads as a legend for the page.
 */
export function CategoryFilter({
  selected,
  onChange,
}: {
  selected: UtilityCategory[];
  onChange: (next: UtilityCategory[]) => void;
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
  const allSelected = CATEGORY_ORDER.every((c) => selectedSet.has(c));
  const isFiltering = !allSelected;

  // Re-emit in the canonical category order.
  function emit(next: Set<UtilityCategory>) {
    onChange(CATEGORY_ORDER.filter((c) => next.has(c)));
  }

  function toggle(c: UtilityCategory) {
    const next = new Set(selectedSet);
    if (next.has(c)) next.delete(c);
    else next.add(c);
    emit(next);
  }

  const label = allSelected
    ? "All categories"
    : selected.length === 0
      ? "No categories"
      : `${selected.length} categor${selected.length !== 1 ? "ies" : "y"}`;

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
        <div className="absolute top-full mt-1.5 left-0 z-50 w-60 rounded-xl border border-zinc-200 bg-white shadow-lg overflow-hidden">
          <div className="flex items-center justify-between border-b border-zinc-100 px-3 py-2">
            <button
              onClick={() => emit(new Set(CATEGORY_ORDER))}
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

          <div className="max-h-72 overflow-y-auto py-1">
            {CATEGORY_ORDER.map((c) => (
              <label
                key={c}
                className="flex items-center gap-2.5 px-3 py-1.5 cursor-pointer hover:bg-zinc-50"
              >
                <input
                  type="checkbox"
                  checked={selectedSet.has(c)}
                  onChange={() => toggle(c)}
                  className="h-3.5 w-3.5 rounded accent-zinc-900"
                />
                <span
                  className="h-2.5 w-2.5 rounded-sm shrink-0"
                  style={{ backgroundColor: CATEGORY_CHART_COLORS[c] }}
                />
                <span className="text-xs text-zinc-600">{CATEGORY_LABELS[c]}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
