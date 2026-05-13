"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import type { KnownArtistRow } from "./actions";
import { addKnownArtists, removeKnownArtist } from "./actions";

// ─── Roster parser ─────────────────────────────────────────────────────────────
//
// Two modes, chosen by whether the pasted text contains any metric lines:
//
// CHARTMETRIC MODE (text has metrics) — position-based state machine:
//   Artist Name      ← first non-metric line after a metric (or at start)
//   Genre Tag        ← subsequent non-metric lines (skipped)
//   15.3M            ← metric → "expect_artist" state
//   4.2M             ← metric
//   Next Artist Name ← first non-metric after metrics → artist
//
// PLAIN LIST MODE (no metrics) — every line is treated as an artist name.
//
// In both modes a single-word line whose lowercase form matches a common genre
// term is skipped (catches edge cases like a bare "Rock" or "Soul" line).

const METRIC_RE = /^#?[\d,.][\d,.]*\s*[kKmMbB]?$/;

const GENERIC_GENRE_WORDS = new Set([
  "rock", "pop", "indie", "folk", "jazz", "metal", "punk", "soul",
  "country", "blues", "reggae", "dance", "electronic", "classical",
  "latin", "alternative", "emo", "grunge", "ambient", "gospel",
  "worship", "rap", "funk", "house", "techno", "ska", "swing",
]);

function isGenericGenreWord(line: string): boolean {
  return !line.includes(" ") && line.length < 15 && GENERIC_GENRE_WORDS.has(line.toLowerCase());
}

function parseRoster(text: string): string[] {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const hasMetrics = lines.some((l) => METRIC_RE.test(l));
  const seen = new Set<string>();
  const artists: string[] = [];

  if (!hasMetrics) {
    // Plain list: every line is an artist name
    for (const line of lines) {
      if (!seen.has(line) && !isGenericGenreWord(line)) {
        seen.add(line);
        artists.push(line);
      }
    }
    return artists;
  }

  // Chartmetric format: position-based
  let state: "expect_artist" | "in_genres" = "expect_artist";
  for (const line of lines) {
    if (METRIC_RE.test(line)) { state = "expect_artist"; continue; }
    if (state === "expect_artist") {
      if (isGenericGenreWord(line)) continue; // skip stray genre word, stay in expect_artist
      if (!seen.has(line)) { seen.add(line); artists.push(line); }
      state = "in_genres";
    }
    // in_genres: skip
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
          <h2 className="text-base font-semibold text-[#001489]">Paste Roster</h2>
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
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono outline-none resize-y focus:border-[#C8102E] focus:ring-1 focus:ring-[#C8102E]"
              />
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500">
                  Found <strong className="text-[#001489]">{parsed.length}</strong> artist{parsed.length !== 1 ? "s" : ""}.
                  {selectedCount !== parsed.length && (
                    <span className="text-gray-400"> {selectedCount} selected.</span>
                  )}
                </p>
                <button
                  type="button"
                  onClick={() => setChecked(checked.size === parsed.length ? new Set() : new Set(parsed))}
                  className="text-xs text-[#001489] hover:underline"
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
                        className="accent-[#001489] shrink-0"
                      />
                      <span className="flex-1 text-sm text-gray-700">{name}</span>
                      <button
                        type="button"
                        onClick={() => removeOne(name)}
                        className="shrink-0 text-gray-300 hover:text-[#C8102E] text-base leading-none"
                        aria-label={`Remove ${name}`}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {addError && <p className="text-xs text-[#C8102E]">{addError}</p>}
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
              className="w-full rounded-lg bg-[#001489] py-2.5 text-sm font-semibold text-white hover:bg-[#1428a8] disabled:opacity-40 transition"
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
                className="flex-1 rounded-lg bg-[#C8102E] py-2.5 text-sm font-semibold text-white hover:bg-[#a60d26] disabled:opacity-40 transition"
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
                      className="flex-1 text-sm font-medium text-[#001489] hover:underline"
                    >
                      {item.name}
                      <span className="ml-1.5 text-[10px] font-normal text-[#C8102E]">in Soundcheck</span>
                    </Link>
                  ) : (
                    <span className="flex-1 text-sm text-gray-700">{item.name}</span>
                  )}
                  <button
                    onClick={() => handleRemove(item.id)}
                    className="shrink-0 text-gray-300 transition hover:text-[#C8102E]"
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
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#C8102E] focus:ring-1 focus:ring-[#C8102E]"
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
                className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm outline-none transition focus:border-[#C8102E] focus:ring-1 focus:ring-[#C8102E] disabled:opacity-50"
              />
              <button
                onClick={handleAdd}
                disabled={adding || !input.trim()}
                className="rounded-lg bg-[#001489] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#1428a8] disabled:opacity-40"
              >
                {adding ? "Adding…" : "Add"}
              </button>
              <button
                type="button"
                onClick={() => setShowPasteModal(true)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-xs font-semibold text-gray-600 transition hover:border-[#001489] hover:text-[#001489]"
              >
                Paste Roster
              </button>
            </div>
            {addError && <p className="text-xs text-[#C8102E]">{addError}</p>}
            <p className="text-xs text-gray-400">e.g. "Arctic Monkeys, Royal Blood" — or use Paste Roster for bulk import</p>
          </div>
        </div>
      </section>
    </>
  );
}
