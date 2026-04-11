"use client";

import { useState, useTransition } from "react";
import type { AdminUser } from "./actions";
import { inviteUser, updateUserRole, setUserStatus, listUsers } from "./actions";

const ROLE_BADGE: Record<string, string> = {
  admin:     "bg-[#C0392B]/10 text-[#C0392B] border border-[#C0392B]/20",
  evaluator: "bg-[#1B2A4A]/10 text-[#1B2A4A] border border-[#1B2A4A]/20",
};

const STATUS_BADGE: Record<string, string> = {
  active:   "bg-[#1B2A4A]/5 text-[#1B2A4A] border border-[#1B2A4A]/20",
  inactive: "bg-gray-100 text-gray-500 border border-gray-200",
};

export default function UserManagementTab({ initialUsers }: { initialUsers: AdminUser[] }) {
  const [users, setUsers] = useState<AdminUser[]>(initialUsers);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"evaluator" | "admin">("evaluator");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);

  const refresh = async () => {
    const updated = await listUsers();
    setUsers(updated);
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setInviteError(null);
    const { error } = await inviteUser(inviteEmail.trim(), inviteRole);
    if (error) {
      setInviteError(error);
    } else {
      setInviteSuccess(true);
      setInviteEmail("");
      setTimeout(() => {
        setInviteSuccess(false);
        setShowInvite(false);
      }, 2000);
      await refresh();
    }
  };

  const handleRoleChange = (userId: string, newRole: "admin" | "evaluator") => {
    startTransition(async () => {
      setActionError(null);
      const { error } = await updateUserRole(userId, newRole);
      if (error) { setActionError(error); return; }
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
      );
    });
  };

  const handleStatusToggle = (userId: string, currentStatus: string) => {
    const newStatus = currentStatus === "active" ? "inactive" : "active";
    startTransition(async () => {
      setActionError(null);
      const { error } = await setUserStatus(userId, newStatus);
      if (error) { setActionError(error); return; }
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, status: newStatus } : u))
      );
    });
  };

  return (
    <div className="mx-auto max-w-4xl p-6">
      {/* Header */}
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-800">Users</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {users.length} user{users.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={() => { setShowInvite(true); setInviteError(null); setInviteSuccess(false); }}
          className="rounded-lg bg-[#1B2A4A] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#243561] transition"
        >
          + Invite User
        </button>
      </div>

      {actionError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {actionError}
        </div>
      )}

      {/* User table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">User</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Role</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Status</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-400">
                  No users found. Invite someone to get started.
                </td>
              </tr>
            )}
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-800">
                    {user.full_name || <span className="text-gray-400 italic">No name set</span>}
                  </p>
                  <p className="text-xs text-gray-400">{user.email}</p>
                </td>
                <td className="px-4 py-3">
                  <select
                    value={user.role}
                    disabled={isPending}
                    onChange={(e) =>
                      handleRoleChange(user.id, e.target.value as "admin" | "evaluator")
                    }
                    className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#1B2A4A]/20 cursor-pointer ${
                      ROLE_BADGE[user.role] ?? ROLE_BADGE.evaluator
                    }`}
                  >
                    <option value="evaluator">Evaluator</option>
                    <option value="admin">Admin</option>
                  </select>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      STATUS_BADGE[user.status] ?? STATUS_BADGE.active
                    }`}
                  >
                    {user.status === "active" ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    disabled={isPending}
                    onClick={() => handleStatusToggle(user.id, user.status)}
                    className={`rounded-lg border px-3 py-1 text-xs font-medium transition disabled:opacity-50 ${
                      user.status === "active"
                        ? "border-red-200 text-red-600 hover:bg-red-50"
                        : "border-emerald-200 text-emerald-600 hover:bg-emerald-50"
                    }`}
                  >
                    {user.status === "active" ? "Deactivate" : "Reactivate"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Invite modal */}
      {showInvite && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setShowInvite(false)}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-4 text-base font-semibold text-[#1B2A4A]">Invite New User</h3>

            {inviteSuccess ? (
              <div className="rounded-lg bg-emerald-50 px-4 py-6 text-center">
                <p className="text-sm font-semibold text-emerald-700">✓ Invitation sent!</p>
                <p className="mt-1 text-xs text-emerald-600">
                  The user will receive an email with a link to set up their account.
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Email address
                    </label>
                    <input
                      type="email"
                      autoFocus
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleInvite()}
                      placeholder="name@company.com"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#1B2A4A] focus:outline-none focus:ring-2 focus:ring-[#1B2A4A]/20"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value as "evaluator" | "admin")}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#1B2A4A] focus:outline-none"
                    >
                      <option value="evaluator">Evaluator</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                </div>

                {inviteError && (
                  <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                    {inviteError}
                  </div>
                )}

                <div className="mt-4 flex justify-end gap-2">
                  <button
                    onClick={() => setShowInvite(false)}
                    className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleInvite}
                    disabled={!inviteEmail.trim() || isPending}
                    className="rounded-lg bg-[#1B2A4A] px-4 py-2 text-sm font-semibold text-white hover:bg-[#243561] disabled:opacity-40 transition"
                  >
                    Send Invitation
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
