"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { getDraftCount } from "@/app/evaluations/new/actions";

interface SidebarProps {
  onClose?: () => void;
}

const NAV_ITEMS = [
  { label: "Dashboard", href: "/" },
  { label: "New Evaluation", href: "/evaluations/new" },
  { label: "Artists", href: "/artists" },
  { label: "Contacts", href: "/contacts" },
];

const ADMIN_ITEMS = [{ label: "Admin Settings", href: "/admin" }];

export default function Sidebar({ onClose }: SidebarProps) {
  const pathname = usePathname();
  const { profile, signOut } = useAuth();
  const [draftCount, setDraftCount] = useState(0);

  useEffect(() => {
    getDraftCount().then(setDraftCount).catch(() => {});
  }, []);

  const displayName = profile?.full_name || "User";
  const isAdmin = profile?.role === "admin";

  const allNavItems = isAdmin ? [...NAV_ITEMS, ...ADMIN_ITEMS] : NAV_ITEMS;

  return (
    <aside className="flex h-screen w-64 flex-col bg-[#1B2A4A] text-white">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-white/10 px-6 py-5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-[#C0392B] text-sm font-bold">
          A3
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-tight">A3 Soundcheck</p>
          <p className="text-xs text-white/50">Artist Evaluation</p>
        </div>
        {/* Close button — mobile/tablet only */}
        <button
          className="lg:hidden -mr-1 flex h-8 w-8 items-center justify-center rounded text-white/60 hover:bg-white/10 hover:text-white transition"
          onClick={onClose}
          aria-label="Close navigation"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* User info */}
      <div className="border-b border-white/10 px-5 py-4">
        <p className="truncate text-sm font-medium text-white">{displayName}</p>
        <span
          className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
            isAdmin
              ? "bg-[#C0392B]/20 text-[#e05a4c]"
              : "bg-white/10 text-white/60"
          }`}
        >
          {isAdmin ? "Admin" : "Evaluator"}
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-1">
          {allNavItems.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onClose}
                  className={`flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-[#C0392B] text-white"
                      : "text-white/70 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <span>{item.label}</span>
                  {item.href === "/" && draftCount > 0 && (
                    <span className="ml-2 rounded-full bg-amber-400 px-1.5 py-0.5 text-xs font-bold text-amber-900 leading-none">
                      {draftCount}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer */}
      <div className="border-t border-white/10 px-3 py-4">
        <button
          onClick={signOut}
          className="w-full rounded-md px-3 py-2 text-left text-sm font-medium text-white/60 transition-colors hover:bg-white/10 hover:text-white"
        >
          Log out
        </button>
        <p className="mt-3 px-3 text-xs text-white/30">
          A3 Merchandise &copy; {new Date().getFullYear()}
        </p>
      </div>
    </aside>
  );
}
