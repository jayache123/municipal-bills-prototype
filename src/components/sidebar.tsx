"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { label: "Dashboard",  href: "/",           exact: true  },
  { label: "Bills",      href: "/bills",       exact: false },
  { label: "Properties", href: "/properties",  exact: false },
  { label: "Analysis",   href: "/utilities",   exact: false },
  { label: "Upload Bill",href: "/upload",      exact: false },
];

export function Sidebar({ onClose }: { onClose?: () => void }) {
  const pathname = usePathname();

  return (
    <aside className="w-52 shrink-0 flex flex-col border-r border-zinc-200 bg-white h-full">

      {/* App name + optional close button (mobile) */}
      <div className="h-14 flex items-center justify-between px-5 border-b border-zinc-100">
        <span className="text-sm font-semibold text-zinc-900 tracking-tight">
          Municipal Bills
        </span>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 transition-colors"
          >
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M3 3l10 10M13 3L3 13" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>

      {/* Nav links */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV_ITEMS.map(({ label, href, exact }) => {
          const isActive = exact
            ? pathname === href
            : pathname === href || pathname.startsWith(href + "/");

          return (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-zinc-100 text-zinc-900"
                  : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-800"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-zinc-100">
        <p className="text-xs text-zinc-400">Prototype v0.1</p>
      </div>
    </aside>
  );
}
