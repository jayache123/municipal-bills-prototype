"use client";

import { useEffect, useRef, useState, useTransition } from "react";

function ChevronDown() {
  return (
    <svg className="h-3 w-3 opacity-60" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
      <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
    </svg>
  );
}

export type StatusOption = {
  value: string;
  label: string;
  className: string; // Tailwind colour classes (bg + text + ring)
};

type Props = {
  currentStatus: string;
  options: StatusOption[];
  /** Server action or async fn — receives the new status value */
  onSelect: (status: string) => Promise<void>;
  /** Extra Tailwind classes added to the pill wrapper */
  className?: string;
};

export function StatusPill({ currentStatus, options, onSelect, className = "" }: Props) {
  const [open, setOpen] = useState(false);
  const [optimisticStatus, setOptimisticStatus] = useState(currentStatus);
  const [isPending, startTransition] = useTransition();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Keep optimistic status in sync when the prop changes (e.g. after page revalidation).
  useEffect(() => {
    setOptimisticStatus(currentStatus);
  }, [currentStatus]);

  // Position state for the fixed dropdown (escapes overflow:hidden containers).
  const [dropdownStyle, setDropdownStyle] = useState<{
    top: number;
    left: number;
    minWidth: number;
  } | null>(null);

  function openDropdown(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setDropdownStyle({
      top: rect.bottom + 4,
      left: rect.left,
      minWidth: Math.max(rect.width, 140),
    });
    setOpen(true);
  }

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      if (
        buttonRef.current?.contains(e.target as Node) ||
        dropdownRef.current?.contains(e.target as Node)
      ) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  const currentOption =
    options.find((o) => o.value === optimisticStatus) ??
    ({ value: optimisticStatus, label: optimisticStatus, className: "bg-zinc-100 text-zinc-500 ring-zinc-400/20" } as StatusOption);

  function handleSelect(e: React.MouseEvent, value: string) {
    e.stopPropagation();
    e.preventDefault();
    setOpen(false);
    if (value === optimisticStatus) return;

    const prev = optimisticStatus;
    setOptimisticStatus(value); // Optimistic update

    startTransition(async () => {
      try {
        await onSelect(value);
      } catch {
        setOptimisticStatus(prev); // Revert on error
      }
    });
  }

  return (
    <>
      <button
        ref={buttonRef}
        onClick={openDropdown}
        disabled={isPending}
        className={`relative z-10 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 transition-opacity cursor-pointer select-none ${currentOption.className} ${isPending ? "opacity-60" : "hover:opacity-80"} ${className}`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {currentOption.label}
        <ChevronDown />
      </button>

      {open && dropdownStyle && (
        <div
          ref={dropdownRef}
          role="listbox"
          style={{
            position: "fixed",
            top: dropdownStyle.top,
            left: dropdownStyle.left,
            minWidth: dropdownStyle.minWidth,
            zIndex: 9999,
          }}
          className="rounded-lg border border-zinc-200 bg-white py-1 shadow-lg"
        >
          {options.map((opt) => (
            <button
              key={opt.value}
              role="option"
              aria-selected={opt.value === optimisticStatus}
              onClick={(e) => handleSelect(e, opt.value)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-zinc-50 transition-colors"
            >
              <span className={`inline-flex rounded-full px-2 py-0.5 font-medium ring-1 ${opt.className}`}>
                {opt.label}
              </span>
              {opt.value === optimisticStatus && (
                <span className="ml-auto text-zinc-400">✓</span>
              )}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
