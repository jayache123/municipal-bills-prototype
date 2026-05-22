"use client";

import { useState } from "react";
import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="h-full flex overflow-hidden bg-zinc-50">

      {/* Desktop sidebar — hidden below md breakpoint */}
      <div className="hidden md:flex shrink-0">
        <Sidebar />
      </div>

      {/* Mobile slide-out drawer + backdrop */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40 md:hidden"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <div className="fixed inset-y-0 left-0 z-50 w-56 shadow-xl md:hidden">
            <Sidebar onClose={() => setMobileOpen(false)} />
          </div>
        </>
      )}

      {/* Right column: top bar + scrollable main */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <TopBar onMenuOpen={() => setMobileOpen(true)} />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>

    </div>
  );
}
