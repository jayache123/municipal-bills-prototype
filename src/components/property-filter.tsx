"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export type PropertyOption = {
  id: string;
  label: string;
};

/**
 * Searchable property filter dropdown.
 *
 * Preserves all existing URL params (e.g. ?period=…) when navigating —
 * only adds/removes the `property` param.
 */
export function PropertyFilter({
  properties,
  selected,
}: {
  properties: PropertyOption[];
  selected: string | null;
}) {
  const router      = useRouter();
  const pathname    = usePathname();
  const searchParams = useSearchParams();

  const [open, setOpen]     = useState(false);
  const [search, setSearch] = useState("");
  const containerRef        = useRef<HTMLDivElement>(null);
  const inputRef            = useRef<HTMLInputElement>(null);

  // Close on click outside.
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  // Focus search input when dropdown opens.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const filtered = properties.filter((p) =>
    p.label.toLowerCase().includes(search.toLowerCase())
  );

  const selectedProp = properties.find((p) => p.id === selected);

  function navigate(propertyId: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (propertyId) {
      params.set("property", propertyId);
    } else {
      params.delete("property");
    }
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
    setOpen(false);
    setSearch("");
  }

  return (
    <div ref={containerRef} className="relative">

      {/* Trigger button */}
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap ${
          selected
            ? "bg-zinc-900 border-zinc-900 text-white"
            : "bg-white border-zinc-200 text-zinc-600 hover:border-zinc-300 hover:text-zinc-900"
        }`}
      >
        <span className="max-w-[160px] truncate">
          {selectedProp?.label ?? "All properties"}
        </span>
        {/* Chevron */}
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

      {/* Dropdown panel */}
      {open && (
        <div className="absolute top-full mt-1.5 left-0 z-50 w-64 rounded-xl border border-zinc-200 bg-white shadow-lg overflow-hidden">

          {/* Search */}
          <div className="p-2 border-b border-zinc-100">
            <input
              ref={inputRef}
              type="text"
              placeholder="Search properties…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs text-zinc-800 placeholder-zinc-400 focus:outline-none focus:border-zinc-400"
            />
          </div>

          {/* Options */}
          <div className="max-h-52 overflow-y-auto">
            {/* All properties */}
            <button
              onClick={() => navigate(null)}
              className={`w-full text-left px-3 py-2 text-xs transition-colors hover:bg-zinc-50 ${
                !selected ? "font-semibold text-zinc-900" : "text-zinc-600"
              }`}
            >
              All properties
            </button>

            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-xs text-zinc-400">No results</p>
            ) : (
              filtered.map((p) => (
                <button
                  key={p.id}
                  onClick={() => navigate(p.id)}
                  className={`w-full text-left px-3 py-2 text-xs transition-colors hover:bg-zinc-50 ${
                    selected === p.id
                      ? "font-semibold text-zinc-900 bg-zinc-50"
                      : "text-zinc-600"
                  }`}
                >
                  {p.label}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
