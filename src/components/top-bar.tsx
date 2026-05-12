"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Maps URL path segments to human-readable labels.
const SEGMENT_LABELS: Record<string, string> = {
  "":           "Dashboard",
  bills:        "Bills",
  properties:   "Properties",
  upload:       "Upload",
  api:          "API",
};

// Detects UUID path segments so we can label them generically.
function isUUID(s: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

function segmentLabel(seg: string): string {
  if (isUUID(seg)) return "Detail";
  return SEGMENT_LABELS[seg] ?? (seg.charAt(0).toUpperCase() + seg.slice(1));
}

type Crumb = { label: string; href: string };

function buildCrumbs(pathname: string): Crumb[] {
  if (pathname === "/") return [{ label: "Dashboard", href: "/" }];

  const segments = pathname.split("/").filter(Boolean);

  const crumbs: Crumb[] = [{ label: "Dashboard", href: "/" }];
  segments.forEach((seg, i) => {
    crumbs.push({
      label: segmentLabel(seg),
      href: "/" + segments.slice(0, i + 1).join("/"),
    });
  });

  return crumbs;
}

export function TopBar() {
  const pathname = usePathname();
  const crumbs = buildCrumbs(pathname);

  return (
    <header className="h-14 shrink-0 flex items-center justify-between border-b border-zinc-200 bg-white px-5">

      {/* ── Breadcrumb ── */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm min-w-0">
        {crumbs.map((crumb, i) => {
          const isLast = i === crumbs.length - 1;
          return (
            <span key={crumb.href} className="flex items-center gap-1 min-w-0">
              {i > 0 && (
                <span className="text-zinc-300 select-none px-0.5">/</span>
              )}
              {isLast ? (
                <span className="font-medium text-zinc-800 truncate">
                  {crumb.label}
                </span>
              ) : (
                <Link
                  href={crumb.href}
                  className="text-zinc-400 hover:text-zinc-800 transition-colors shrink-0"
                >
                  {crumb.label}
                </Link>
              )}
            </span>
          );
        })}
      </nav>

      {/* ── Account button ── */}
      <button
        type="button"
        title="Account"
        className="ml-4 shrink-0 w-8 h-8 rounded-full bg-zinc-900 flex items-center justify-center text-white text-xs font-semibold hover:bg-zinc-700 transition-colors focus:outline-none focus:ring-2 focus:ring-zinc-400 focus:ring-offset-2"
      >
        JA
      </button>

    </header>
  );
}
