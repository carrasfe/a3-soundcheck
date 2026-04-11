"use client";

import { useState } from "react";
import Sidebar from "./Sidebar";

interface Props {
  showSidebar: boolean;
  children: React.ReactNode;
}

export default function AppShell({ showSidebar, children }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden">
      {showSidebar && (
        <>
          {/* Backdrop — mobile/tablet only */}
          {sidebarOpen && (
            <div
              className="fixed inset-0 z-40 bg-black/50 lg:hidden"
              onClick={() => setSidebarOpen(false)}
            />
          )}

          {/* Sidebar wrapper */}
          <div
            className={`
              fixed inset-y-0 left-0 z-50 w-64 transition-transform duration-200 ease-in-out
              lg:relative lg:z-auto lg:translate-x-0
              ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
            `}
          >
            <Sidebar onClose={() => setSidebarOpen(false)} />
          </div>
        </>
      )}

      <main
        className={`${showSidebar ? "flex-1" : "w-full"} relative min-w-0 overflow-y-auto bg-white`}
      >
        {/* Hamburger — visible only on mobile/tablet when sidebar is not open */}
        {showSidebar && (
          <button
            className="lg:hidden fixed top-3 left-3 z-30 flex h-9 w-9 items-center justify-center rounded-md bg-[#1B2A4A] text-white shadow-md"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open navigation"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>
        )}

        {children}
      </main>
    </div>
  );
}
