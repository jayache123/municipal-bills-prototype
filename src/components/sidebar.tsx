"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  {
    label: "Dashboard",
    href: "/",
    // Only active on exact match
    exact: true,
  },
  {
    label: "Bills",
    href: "/bills",
    exact: false,
  },
  {
    label: "Properties",
    href: "/properties",
    exact: false,
  },
  {
    label: "Analysis",
    href: "/utilities",
    exact: false,
  },
  {
    label: "Upload Bill",
    href: "/upload",
    exact: false,
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-52 shrink-0 flex flex-col border-r border-zinc-200 bg-white">
      {/* App name */}
      <div className="h-14 flex items-center px-5 border-b border-zinc-100">
        <span className="text-sm font-semibold text-zinc-900 tracking-tight">
          Municipal Bills
        </span>
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
