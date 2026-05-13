"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { updateManager, createManagementCompany } from "../../actions";
import type { ManagerRow } from "../../actions";
import DeleteContactButton from "../../DeleteContactButton";

type Company = { id: string; name: string };

const inputCls =
  "w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none transition focus:border-[#C0392B] focus:ring-1 focus:ring-[#C0392B]";

function CompanySelect({
  companies,
  value,
  onChange,
  onRequestCreate,
}: {
  companies: Company[];
  value: string;
  onChange: (id: string) => void;
  onRequestCreate: () => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const label =
    value === ""
      ? "— None (Independent) —"
      : (companies.find((c) => c.id === value)?.name ?? "");
  const filtered = companies.filter(
    (c) => !query || c.name.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="relative">
      <input
        value={open ? query : label}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => { setOpen(true); setQuery(""); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search companies…"
        className={inputCls}
        autoComplete="off"
      />
      {open && (
        <div className="absolute z-20 mt-1 w-full overflow-auto rounded-md border border-gray-200 bg-white shadow-lg max-h-52">
          <button
            type="button"
            onMouseDown={() => { onChange(""); setOpen(false); }}
            className="w-full px-3 py-2 text-left text-sm text-gray-500 hover:bg-gray-50"
          >
            — None (Independent) —
          </button>
          {filtered.map((c) => (
            <button
              key={c.id}
              type="button"
              onMouseDown={() => { onChange(c.id); setOpen(false); }}
              className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-50 ${
                c.id === value ? "font-semibold text-[#1B2A4A]" : "text-gray-700"
              }`}
            >
              {c.name}
            </button>
          ))}
          {filtered.length === 0 && query && (
            <p className="px-3 py-2 text-sm text-gray-400 italic">No match</p>
          )}
          <button
            type="button"
            onMouseDown={() => { setOpen(false); onRequestCreate(); }}
            className="w-full border-t border-gray-100 px-3 py-2 text-left text-xs font-semibold text-[#C0392B] hover:bg-red-50"
          >
            + Create new company
          </button>
        </div>
      )}
    </div>
  );
}

export default function EditManagerCard({
  manager,
  companies: initialCompanies,
  isAdmin,
  deleteAction,
  deleteRedirectTo,
}: {
  manager: ManagerRow;
  companies: Company[];
  isAdmin: boolean;
  deleteAction: () => Promise<{ error: string | null }>;
  deleteRedirectTo: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [companies, setCompanies] = useState(initialCompanies);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [notes, setNotes] = useState("");
  const [isActive, setIsActive] = useState(true);

  const [showNewCompany, setShowNewCompany] = useState(false);
  const [newCoName, setNewCoName] = useState("");
  const [newCoWebsite, setNewCoWebsite] = useState("");
  const [creatingCo, setCreatingCo] = useState(false);

  function startEdit() {
    setName(manager.name);
    setEmail(manager.email ?? "");
    setPhone(manager.phone ?? "");
    setCompanyId(manager.management_company_id ?? "");
    setNotes(manager.notes ?? "");
    setIsActive(manager.is_active);
    setError(null);
    setShowNewCompany(false);
    setEditing(true);
  }

  async function handleSave() {
    if (!name.trim()) { setError("Name is required"); return; }
    setSaving(true);
    setError(null);
    const result = await updateManager(manager.id, {
      name: name.trim(),
      management_company_id: companyId || null,
      email: email || null,
      phone: phone || null,
      notes: notes || null,
      is_active: isActive,
    });
    setSaving(false);
    if (result.error) { setError(result.error); return; }
    setEditing(false);
    router.refresh();
  }

  async function handleCreateCompany() {
    if (!newCoName.trim()) return;
    setCreatingCo(true);
    const result = await createManagementCompany({ name: newCoName.trim(), website: newCoWebsite || undefined });
    setCreatingCo(false);
    if (result.error || !result.id) { setError(result.error ?? "Failed to create company"); return; }
    const added: Company = { id: result.id, name: newCoName.trim() };
    setCompanies((prev) => [...prev, added].sort((a, b) => a.name.localeCompare(b.name)));
    setCompanyId(result.id);
    setNewCoName("");
    setNewCoWebsite("");
    setShowNewCompany(false);
  }

  if (!editing) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#1B2A4A]/10 text-lg font-bold text-[#1B2A4A]">
            {manager.name[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-2xl font-bold text-[#1B2A4A]">{manager.name}</h1>
                  {!manager.is_active && (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">Inactive</span>
                  )}
                </div>
                {manager.management_company_name && (
                  <Link href={`/contacts/management/${manager.management_company_id}`} className="mt-0.5 text-sm text-[#C0392B] hover:underline">
                    {manager.management_company_name}
                  </Link>
                )}
                <div className="mt-2 flex flex-wrap gap-4 text-sm text-gray-600">
                  {manager.email && (
                    <a href={`mailto:${manager.email}`} className="flex items-center gap-1 hover:text-[#C0392B]">✉ {manager.email}</a>
                  )}
                  {manager.phone && (
                    <a href={`tel:${manager.phone}`} className="flex items-center gap-1 hover:text-[#C0392B]">☎ {manager.phone}</a>
                  )}
                </div>
                {manager.notes && <p className="mt-2 text-sm text-gray-500">{manager.notes}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {isAdmin && (
                  <DeleteContactButton
                    confirmMessage={`Delete ${manager.name}? This will remove their known artist roster and artist links.`}
                    action={deleteAction}
                    redirectTo={deleteRedirectTo}
                  />
                )}
                <button
                  type="button"
                  onClick={startEdit}
                  className="rounded border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:border-[#1B2A4A]/30 hover:bg-gray-50 transition"
                >
                  Edit
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[#1B2A4A]/30 bg-white p-6 shadow-sm">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[#1B2A4A]">Edit Manager</h2>
          <button type="button" onClick={() => setEditing(false)} className="text-xs text-gray-400 hover:text-gray-600">
            Cancel
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Name *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Phone</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Management Company</label>
            <CompanySelect
              companies={companies}
              value={companyId}
              onChange={setCompanyId}
              onRequestCreate={() => setShowNewCompany(true)}
            />
          </div>
        </div>

        {showNewCompany && (
          <div className="rounded-lg border border-[#C0392B]/20 bg-[#C0392B]/5 p-3 space-y-2">
            <p className="text-xs font-semibold text-[#C0392B]">New Management Company</p>
            <input
              value={newCoName}
              onChange={(e) => setNewCoName(e.target.value)}
              placeholder="Company name *"
              className={inputCls}
            />
            <input
              value={newCoWebsite}
              onChange={(e) => setNewCoWebsite(e.target.value)}
              placeholder="Website (optional)"
              className={inputCls}
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleCreateCompany}
                disabled={creatingCo || !newCoName.trim()}
                className="rounded bg-[#C0392B] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#a93226] disabled:opacity-50"
              >
                {creatingCo ? "Creating…" : "Create"}
              </button>
              <button
                type="button"
                onClick={() => setShowNewCompany(false)}
                className="rounded border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:border-gray-400"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className={`${inputCls} resize-none`}
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="h-4 w-4 accent-[#C0392B]"
          />
          Active
        </label>

        {error && <p className="text-xs text-[#C0392B]">{error}</p>}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-[#1B2A4A] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1B2A4A]/90 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            disabled={saving}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-600 hover:border-gray-400 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
