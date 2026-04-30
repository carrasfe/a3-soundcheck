"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import type { KnownArtistRow } from "./actions";
import { addKnownArtists, removeKnownArtist } from "./actions";

// ─── Roster parser ─────────────────────────────────────────────────────────────

const GENRE_TAGS = new Set([
  "alternative", "indie", "rock", "pop", "r&b/soul", "r&b", "soul",
  "jazz", "latin", "dance / edm", "dance/edm", "edm", "electronic",
  "country", "metal", "hip hop", "hip-hop", "hip hop/rap", "folk",
  "punk", "classical", "reggae", "blues", "christian", "k-pop", "k rock",
  "j pop", "j rock", "anime", "asian artists", "cloud rap", "french rap",
  "french pop", "french house", "french indie pop", "hindi indie",
  "indian indie", "indie folk", "indie rock", "indie pop", "indie soul",
  "bedroom pop", "art pop", "krautrock", "neo psychedelic", "post rock",
  "post punk", "post hardcore", "math rock", "noise rock", "slowcore",
  "egg punk", "electroclash", "synthpop", "alternative dance", "jazz house",
  "latin alternative", "latin indie", "japanese indie",
  "gospel", "worship", "bluegrass", "swing", "emo", "hardcore",
  "progressive", "psychedelic", "shoegaze", "grunge", "ambient", "trap",
  "drill", "afrobeats", "afropop",
]);

// Matches Chartmetric metric lines: optional #, digits/commas/dots, optional K/M/B suffix
const METRIC_RE = /^#?\d[\d,.]*\s*[kKmMbB]?$/;

function parseRoster(text: string): string[] {
  const seen = new Set<string>();
  const artists: string[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (METRIC_RE.test(line)) continue;
    if (GENRE_TAGS.has(line.toLowerCase())) continue;
    if (!seen.has(line)) {
      seen.add(line);
      artists.push(line);
    }
  }
  return artists;
}

// ─── Paste Roster Modal ────────────────────────────────────────────────────────

function PasteRosterModal({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (names: string[]) => Promise<{ error: string | null }>;
}) {
  const [rawText, setRawText] = useState("");
  const [parsed, setParsed] = useState<string[] | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  function handleParse() {
    const names = parseRoster(rawText);
    setParsed(names);
    setChecked(new Set(names));
  }

  function toggleOne(name: string, on: boolean) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (on) next.add(name); else next.delete(name);
      return next;
    });
  }

  function removeOne(name: string) {
    setParsed((prev) => prev?.filter((n) => n !== name) ?? null);
    setChecked((prev) => { const next = new Set(prev); next.delete(name); return next; });
  }

  async function handleAdd() {
    if (!parsed) return;
    const toAdd = parsed.filter((n) => checked.has(n));
    if (toAdd.length === 0) return;
    setAdding(true);
    setAddError(null);
    const { error } = await onAdd(toAdd);
    setAdding(false);
    if (error) { setAddError(error); return; }
    onClose();
  }

  const selectedCount = checked.size;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative w-full max-w-lg rounded-xl bg-white shadow-xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 shrink-0">
          <h2 className="text-base font-semibold text-[#1B2A4A]">Paste Roster</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-lg leading-none"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {!parsed ? (
            <>
              <p className="text-sm text-gray-500">
                Paste a roster copied from Chartmetric or any source. Genre tags and
                listener counts will be filtered out automatically.
              </p>
              <textarea
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder={"Paste artist roster from Chartmetric or any list…\n\nExample:\nArctic Monkeys\nAlternative\nIndie Rock\n15.3M\n4.2M\nRoyal Blood\nRock\n858k\n413k"}
                rows={12}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono outline-none resize-y focus:border-[#C0392B] focus:ring-1 focus:ring-[#C0392B]"
              />
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500">
                  Found <strong className="text-[#1B2A4A]">{parsed.length}</strong> artist{parsed.length !== 1 ? "s" : ""}.
                  {selectedCount !== parsed.length && (
                    <span className="text-gray-400"> {selectedCount} selected.</span>
                  )}
                </p>
                <button
                  type="button"
                  onClick={() => setChecked(checked.size === parsed.length ? new Set() : new Set(parsed))}
                  className="text-xs text-[#1B2A4A] hover:underline"
                >
                  {checked.size === parsed.length ? "Deselect all" : "Select all"}
                </button>
              </div>

              {parsed.length === 0 ? (
                <p className="text-sm text-gray-400 italic">No artist names found. Try pasting more text.</p>
              ) : (
                <div className="rounded-lg border border-gray-200 divide-y divide-gray-100 max-h-64 overflow-y-auto">
                  {parsed.map((name) => (
                    <div key={name} className="flex items-center gap-2 px-3 py-2">
                      <input
                        type="checkbox"
                        checked={checked.has(name)}
                        onChange={(e) => toggleOne(name, e.target.checked)}
                        className="accent-[#1B2A4A] shrink-0"
                      />
                      <span className="flex-1 text-sm text-gray-700">{name}</span>
                      <button
                        type="button"
                        onClick={() => removeOne(name)}
                        className="shrink-0 text-gray-300 hover:text-[#C0392B] text-base leading-none"
                        aria-label={`Remove ${name}`}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {addError && <p className="text-xs text-[#C0392B]">{addError}</p>}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 px-6 py-4 shrink-0">
          {!parsed ? (
            <button
              type="button"
              onClick={handleParse}
              disabled={!rawText.trim()}
              className="w-full rounded-lg bg-[#1B2A4A] py-2.5 text-sm font-semibold text-white hover:bg-[#243561] disabled:opacity-40 transition"
            >
              Parse
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setParsed(null); }}
                className="flex-1 rounded-lg border border-gray-300 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition"
              >
                ← Back
              </button>
              <button
                type="button"
                onClick={handleAdd}
                disabled={adding || selectedCount === 0}
                className="flex-1 rounded-lg bg-[#C0392B] py-2.5 text-sm font-semibold text-white hover:bg-[#a93226] disabled:opacity-40 transition"
              >
                {adding ? "Adding…" : `Add ${selectedCount} Artist${selectedCount !== 1 ? "s" : ""}`}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

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
  const [showPasteModal, setShowPasteModal] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const hasPersonDropdown = !!personOptions && personOptions.length > 0;

  function buildOpts(): Parameters<typeof addKnownArtists>[1] {
    if (managerId) return { managerId };
    if (agentId) return { agentId };
    if (hasPersonDropdown && selectedPersonId) {
      return personType === "manager"
        ? { managerId: selectedPersonId }
        : { agentId: selectedPersonId };
    }
    if (managementCompanyId) return { managementCompanyId };
    if (agencyId) return { agencyId };
    return {};
  }

  async function doAdd(names: string[]): Promise<{ error: string | null }> {
    const { items: newItems, error } = await addKnownArtists(names, buildOpts());
    if (error) return { error };
    setItems((prev) => {
      const existing = new Set(prev.map((i) => i.id));
      return [...prev, ...newItems.filter((i) => !existing.has(i.id))];
    });
    return { error: null };
  }

  async function handleAdd() {
    const names = input.split(",").map((n) => n.trim()).filter(Boolean);
    if (names.length === 0) return;
    setAdding(true);
    setAddError(null);
    const { error } = await doAdd(names);
    setAdding(false);
    if (error) { setAddError(error); return; }
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
    <>
      {showPasteModal && (
        <PasteRosterModal
          onClose={() => setShowPasteModal(false)}
          onAdd={doAdd}
        />
      )}

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
              <button
                type="button"
                onClick={() => setShowPasteModal(true)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-xs font-semibold text-gray-600 transition hover:border-[#1B2A4A] hover:text-[#1B2A4A]"
              >
                Paste Roster
              </button>
            </div>
            {addError && <p className="text-xs text-[#C0392B]">{addError}</p>}
            <p className="text-xs text-gray-400">e.g. "Arctic Monkeys, Royal Blood" — or use Paste Roster for bulk import</p>
          </div>
        </div>
      </section>
    </>
  );
}
