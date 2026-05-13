"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateAgency } from "../../actions";
import DeleteContactButton from "../../DeleteContactButton";

const inputCls =
  "w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none transition focus:border-[#C8102E] focus:ring-1 focus:ring-[#C8102E]";

export default function EditAgencyHeader({
  agency,
  agentsCount,
  artistsCount,
  knownArtistsCount,
  isAdmin,
  deleteAction,
}: {
  agency: { id: string; name: string; website: string | null; notes: string | null };
  agentsCount: number;
  artistsCount: number;
  knownArtistsCount: number;
  isAdmin: boolean;
  deleteAction: () => Promise<{ error: string | null }>;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [notes, setNotes] = useState("");

  function startEdit() {
    setName(agency.name);
    setWebsite(agency.website ?? "");
    setNotes(agency.notes ?? "");
    setError(null);
    setEditing(true);
  }

  async function handleSave() {
    if (!name.trim()) { setError("Name is required"); return; }
    setSaving(true);
    setError(null);
    const result = await updateAgency(agency.id, {
      name: name.trim(),
      website: website || undefined,
      notes: notes || undefined,
    });
    setSaving(false);
    if (result.error) { setError(result.error); return; }
    setEditing(false);
    router.refresh();
  }

  const stats = (
    <div className="mt-3 flex gap-4 text-sm text-gray-500">
      <span>{agentsCount} agent{agentsCount !== 1 ? "s" : ""}</span>
      <span>{artistsCount} Soundcheck artist{artistsCount !== 1 ? "s" : ""}</span>
      <span>{knownArtistsCount} known artist{knownArtistsCount !== 1 ? "s" : ""}</span>
    </div>
  );

  if (!editing) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#001489]">{agency.name}</h1>
            {agency.website && (
              <a
                href={agency.website.startsWith("http") ? agency.website : `https://${agency.website}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 text-sm text-[#C8102E] hover:underline"
              >
                {agency.website}
              </a>
            )}
            {agency.notes && <p className="mt-2 text-sm text-gray-600">{agency.notes}</p>}
            {stats}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {isAdmin && (
              <DeleteContactButton
                confirmMessage={`Delete ${agency.name}? This will also remove all agents and known artists linked to this agency. This cannot be undone.`}
                action={deleteAction}
                redirectTo="/contacts"
              />
            )}
            <button
              type="button"
              onClick={startEdit}
              className="rounded border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:border-[#001489]/30 hover:bg-gray-50 transition"
            >
              Edit
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[#001489]/30 bg-white p-6 shadow-sm">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[#001489]">Edit Agency</h2>
          <button type="button" onClick={() => setEditing(false)} className="text-xs text-gray-400 hover:text-gray-600">
            Cancel
          </button>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Agency Name *</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Website</label>
          <input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="e.g. wme.com" className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Notes</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={`${inputCls} resize-none`} />
        </div>
        {stats}
        {error && <p className="text-xs text-[#C8102E]">{error}</p>}
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-[#001489] px-4 py-2 text-sm font-semibold text-white hover:bg-[#001489]/90 disabled:opacity-50"
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
