"use client";

import { useState } from "react";
import type { ModelConfig } from "@/lib/model-defaults";
import type { AdminUser, AuditEntry } from "./actions";
import ScoringModelTab from "./ScoringModelTab";
import UserManagementTab from "./UserManagementTab";
import AuditLogTab from "./AuditLogTab";

type Tab = "scoring" | "users" | "audit";

const TABS: { id: Tab; label: string }[] = [
  { id: "scoring", label: "Scoring Model" },
  { id: "users",   label: "User Management" },
  { id: "audit",   label: "Audit Log" },
];

interface Props {
  initialConfig: ModelConfig;
  initialUsers: AdminUser[];
  initialAuditLog: AuditEntry[];
}

export default function AdminClient({ initialConfig, initialUsers, initialAuditLog }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("scoring");

  return (
    <div className="flex h-full flex-col">
      {/* Page header */}
      <div className="shrink-0 bg-[#1B2A4A] px-6 py-5 text-white">
        <h1 className="text-xl font-bold">Admin Settings</h1>
        <p className="mt-0.5 text-sm text-white/60">
          Scoring model configuration, user management, and activity audit log
        </p>
      </div>

      {/* Tab bar */}
      <div className="shrink-0 border-b border-gray-200 bg-white px-6">
        <nav className="flex gap-0" role="tablist">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              role="tab"
              aria-selected={activeTab === id}
              onClick={() => setActiveTab(id)}
              className={`border-b-2 px-5 py-3.5 text-sm font-medium transition-colors ${
                activeTab === id
                  ? "border-[#C0392B] text-[#C0392B]"
                  : "border-transparent text-gray-500 hover:text-gray-800"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto bg-gray-50">
        {activeTab === "scoring" && (
          <ScoringModelTab initialConfig={initialConfig} />
        )}
        {activeTab === "users" && (
          <UserManagementTab initialUsers={initialUsers} />
        )}
        {activeTab === "audit" && (
          <AuditLogTab initialLog={initialAuditLog} />
        )}
      </div>
    </div>
  );
}
