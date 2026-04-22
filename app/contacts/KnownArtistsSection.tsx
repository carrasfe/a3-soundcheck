"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import type { KnownArtistRow } from "./actions";
import { addKnownArtists, removeKnownArtist } from "./actions";

interface Props {
  initialItems: KnownArtistRow[];
  managerId?: string;
  agentId?: string;
  managementCompanyId?: string;
  agencyId?: string;
  personOptions?: { id: string; name: string }[];
  personType?: "manager" | "agent";
  title?: string;
}

export default function KnownArtistsSection({
  initialItems,
  managerId,
  agentId,
  managementCompanyId,
  agencyId,
  personOptions,
  personType,
  title = "Full Roster",
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
      const existing = new Set(prev.map((i) => i.id));
      return [...prev, ...newItems.filter((i) => !existing.has(i.id))];
    });
    setInput("");
    setAddError(null);
    inputRef.current?.focus();
  }

  async function handleRemove(id: string) {
    const removed = items.find((i) => i.id === id);
    setItems((prev) => prev.filter((i) => i.id !== id));
    const { error } = await removeKnownArtist(id);
    if (error && removed) {
      setItems((prev) => [...prev, removed].sort((a, b) => a.name.localeCompare(b.name)));
    }
  }

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">
        {title} ({items.length})
      </h2>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        {/* Artist list */}
        {items.length === 0 ? (
          <div className="px-5 py-4 text-sm text-gray-400 italic">No artists added yet.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {items.map((item) => (
              <div key={item.id} className="flex items-center gap-3 px-5 py-2.5">
                {item.matched_artist_id ? (
                  <Link
                    href={`/artists/${item.matched_artist_id}`}
                    className="flex-1 text-sm font-medium text-[#1B2A4A] hover:underline"
                  >
                    {item.name}
                    <span className="ml-1.5 text-[10px] font-normal text-[#C0392B]">in Soundcheck</span>
                  </Link>
                ) : (
                  <span className="flex-1 text-sm text-gray-700">{item.name}</span>
                )}
                <button
                  onClick={() => handleRemove(item.id)}
                  className="shrink-0 text-gray-300 transition hover:text-[#C0392B]"
                  aria-label={`Remove ${item.name}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add input — always visible */}
        <div className="border-t border-gray-100 px-5 py-4 space-y-2">
          {hasPersonDropdown && (
            <select
              value={selectedPersonId}
              onChange={(e) => setSelectedPersonId(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#C0392B] focus:ring-1 focus:ring-[#C0392B]"
            >
              <option value="">— Company level (unassigned) —</option>
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
              disabled={adding}
              className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm outline-none transition focus:border-[#C0392B] focus:ring-1 focus:ring-[#C0392B] disabled:opacity-50"
            />
            <button
              onClick={handleAdd}
              disabled={adding || !input.trim()}
              className="rounded-lg bg-[#1B2A4A] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#243561] disabled:opacity-40"
            >
              {adding ? "Adding…" : "Add"}
            </button>
          </div>
          {addError && <p className="text-xs text-[#C0392B]">{addError}</p>}
          <p className="text-xs text-gray-400">e.g. "Arctic Monkeys, Royal Blood" — press Enter or click Add</p>
        </div>
      </div>
    </section>
  );
}
