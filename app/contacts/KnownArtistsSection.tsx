"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import type { KnownArtistRow } from "./actions";
import { addKnownArtists, removeKnownArtist } from "./actions";

interface Props {
  initialItems: KnownArtistRow[];
  // Exactly one scope: manager, agent, company (unassigned), or agency (unassigned)
  managerId?: string;
  agentId?: string;
  managementCompanyId?: string;
  agencyId?: string;
  // For company/agency: optional dropdown to assign to a specific person
  personOptions?: { id: string; name: string }[];
  personType?: "manager" | "agent";
}

export default function KnownArtistsSection({
  initialItems,
  managerId,
  agentId,
  managementCompanyId,
  agencyId,
  personOptions,
  personType,
}: Props) {
  const [items, setItems] = useState<KnownArtistRow[]>(initialItems);
  const [input, setInput] = useState("");
  const [selectedPersonId, setSelectedPersonId] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const hasPersonDropdown = !!personOptions && personOptions.length > 0;

  async function handleAdd() {
    const names = input.split(",").map((n) => n.trim()).filter(Boolean);
    if (names.length === 0) return;
    setAdding(true);
    setAddError(null);

    // Determine scope: if person dropdown shown and something selected, use person; else use company/agency
    let opts: Parameters<typeof addKnownArtists>[1] = {};
    if (managerId) {
      opts = { managerId };
    } else if (agentId) {
      opts = { agentId };
    } else if (hasPersonDropdown && selectedPersonId) {
      if (personType === "manager") opts = { managerId: selectedPersonId };
      else opts = { agentId: selectedPersonId };
    } else if (managementCompanyId) {
      opts = { managementCompanyId };
    } else if (agencyId) {
      opts = { agencyId };
    }

    const { items: newItems, error } = await addKnownArtists(names, opts);
    setAdding(false);
    if (error) { setAddError(error); return; }
    setItems((prev) => {
      // Deduplicate by id
      const existing = new Set(prev.map((i) => i.id));
      return [...prev, ...newItems.filter((i) => !existing.has(i.id))];
    });
    setInput("");
    setAddError(null);
  }

  async function handleRemove(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
    const { error } = await removeKnownArtist(id);
    if (error) {
      // Re-add on failure
      setItems((prev) => [...prev, ...initialItems.filter((i) => i.id === id)]);
    }
  }

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">
        Other Known Artists
      </h2>

      {/* List */}
      {items.length === 0 ? (
        <p className="mb-3 text-sm text-gray-400 italic">None added yet.</p>
      ) : (
        <div className="mb-3 rounded-xl border border-gray-200 bg-white shadow-sm divide-y divide-gray-100">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-3 px-4 py-2.5">
              {item.matched_artist_id ? (
                <Link
                  href={`/artists/${item.matched_artist_id}`}
                  className="flex-1 text-sm font-medium text-[#1B2A4A] hover:underline"
                >
                  {item.name}
                  <span className="ml-1.5 text-[10px] text-[#C0392B] font-normal">in Soundcheck</span>
                </Link>
              ) : (
                <span className="flex-1 text-sm text-gray-700">{item.name}</span>
              )}
              <button
                onClick={() => handleRemove(item.id)}
                className="shrink-0 text-gray-300 hover:text-[#C0392B] transition"
                aria-label={`Remove ${item.name}`}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add input */}
      <div className="space-y-2">
        {hasPersonDropdown && (
          <select
            value={selectedPersonId}
            onChange={(e) => setSelectedPersonId(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#C0392B] focus:ring-1 focus:ring-[#C0392B]"
          >
            <option value="">— Unassigned (company level) —</option>
            {personOptions.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )}
        <div className="flex gap-2">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAdd(); } }}
            placeholder="Add artists (comma-separated)…"
            className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#C0392B] focus:ring-1 focus:ring-[#C0392B]"
          />
          <button
            onClick={handleAdd}
            disabled={adding || !input.trim()}
            className="rounded-lg bg-[#1B2A4A] px-3 py-2 text-xs font-semibold text-white hover:bg-[#243561] disabled:opacity-40"
          >
            {adding ? "Adding…" : "Add"}
          </button>
        </div>
        {addError && <p className="text-xs text-[#C0392B]">{addError}</p>}
        <p className="text-xs text-gray-400">
          e.g. "Arctic Monkeys, Fontaines DC, Royal Blood" — press Enter or click Add
        </p>
      </div>
    </section>
  );
}
