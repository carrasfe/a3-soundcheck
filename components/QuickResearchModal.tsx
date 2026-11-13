"use client";

import { useMemo, useRef, useState } from "react";
import { VALID_GENRES } from "@/app/evaluations/new/types";
import { createResearchDrafts } from "@/app/research/actions";
import type { DraftRow } from "@/app/page";
import { buildResearchPrompt, type ResearchArtist } from "@/lib/research-prompt";

const MAX_ARTISTS = 10; // keep in sync with app/research/actions.ts
const DEFAULT_GENRE = "Rock / Alt / Indie";

/** draftId set = row came from "Add from Saved Drafts" and updates that draft */
type Row = { key: number; name: string; genre: string; draftId?: string };
type Artist = ResearchArtist;

const normName = (s: string) => s.trim().toLowerCase();
const toGenre = (g: string | null | undefined) =>
  VALID_GENRES.find((v) => v.toLowerCase() === (g ?? "").trim().toLowerCase()) ?? DEFAULT_GENRE;

/** Split pasted text into names: one per line, or comma-separated when it's a single line. */
function splitNames(text: string): string[] {
  const lines = text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const parts = lines.length > 1 ? lines : text.split(",");
  return parts.map((s) => s.trim()).filter(Boolean);
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  }
}

interface Props {
  drafts: DraftRow[];
  onClose: () => void;
  onDone: (message: string, kind?: "success" | "error") => void;
}

export default function QuickResearchModal({ drafts, onClose, onDone }: Props) {
  const nextKey = useRef(1);
  const newRow = (name = "", genre = DEFAULT_GENRE, draftId?: string): Row =>
    ({ key: nextKey.current++, name, genre, draftId });

  const [rows, setRows] = useState<Row[]>(() => [newRow()]);
  const [busy, setBusy] = useState<null | "chrome" | "drafts">(null);
  const [notice, setNotice] = useState<string | null>(null);
  const inputRefs = useRef(new Map<number, HTMLInputElement>());

  // Typed names that match a saved draft are treated as existing drafts too,
  // so they get update_draft in the prompt instead of a duplicate draft.
  const draftNames = useMemo(() => new Set(drafts.map((d) => normName(d.artist_name))), [drafts]);
  const isExisting = (r: Row) => !!r.draftId || draftNames.has(normName(r.name));

  const artists: Artist[] = rows
    .filter((r) => r.name.trim())
    .map((r) => ({ name: r.name.trim(), genre: r.genre, existing: isExisting(r) }));
  const newArtists = artists.filter((a) => !a.existing);
  const atMax = rows.length >= MAX_ARTISTS;

  // ── Saved drafts picker ──
  const [pickerOpen, setPickerOpen] = useState(drafts.length > 0);
  const [draftQuery, setDraftQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const inBatch = new Set(rows.map((r) => r.draftId).filter(Boolean) as string[]);
  const batchNames = new Set(rows.map((r) => normName(r.name)).filter(Boolean));
  const availableDrafts = drafts
    .filter((d) => !inBatch.has(d.id) && !batchNames.has(normName(d.artist_name)))
    .filter((d) => !draftQuery.trim() || d.artist_name.toLowerCase().includes(draftQuery.trim().toLowerCase()))
    .sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""));

  const toggleSelected = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const addSelectedDrafts = () => {
    const picked = drafts.filter((d) => selected.has(d.id) && !inBatch.has(d.id));
    if (picked.length === 0) return;
    setRows((rs) => {
      const filled = rs.filter((r) => r.name.trim()); // drop blank rows
      const room = MAX_ARTISTS - filled.length;
      const kept = picked.slice(0, Math.max(room, 0));
      const skipped = picked.length - kept.length;
      setNotice(skipped > 0
        ? `Only ${MAX_ARTISTS} artists per batch — ${skipped} draft${skipped === 1 ? "" : "s"} not added.`
        : null);
      const next = [...filled, ...kept.map((d) => newRow(d.artist_name, toGenre(d.genre), d.id))];
      return next.length ? next : [newRow()];
    });
    setSelected(new Set());
    setDraftQuery("");
  };

  const focusRow = (key: number) => setTimeout(() => inputRefs.current.get(key)?.focus(), 0);

  const updateRow = (key: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const removeRow = (key: number) =>
    setRows((rs) => (rs.length === 1 ? [newRow()] : rs.filter((r) => r.key !== key)));

  const addRow = (afterKey?: number) => {
    if (atMax) return;
    const row = newRow();
    setRows((rs) => {
      const i = afterKey == null ? rs.length - 1 : rs.findIndex((r) => r.key === afterKey);
      return [...rs.slice(0, i + 1), row, ...rs.slice(i + 1)];
    });
    focusRow(row.key);
  };

  const handlePaste = (key: number, e: React.ClipboardEvent<HTMLInputElement>) => {
    if (rows.find((r) => r.key === key)?.draftId) return; // draft rows are read-only
    const text = e.clipboardData.getData("text");
    if (!/[\n,]/.test(text)) return; // plain single name — let the input handle it
    const names = splitNames(text);
    if (names.length <= 1) return;
    e.preventDefault();
    setRows((rs) => {
      const i = rs.findIndex((r) => r.key === key);
      const current = rs[i];
      const before = rs.slice(0, i);
      const after = rs.slice(i + 1).filter((r) => r.name.trim()); // drop trailing blanks
      const room = MAX_ARTISTS - before.length - after.length;
      const kept = names.slice(0, Math.max(room, 1));
      if (kept.length < names.length) {
        setNotice(`Only ${MAX_ARTISTS} artists per batch — ${names.length - kept.length} name${names.length - kept.length === 1 ? "" : "s"} skipped.`);
      } else {
        setNotice(null);
      }
      const pasted = kept.map((n, j) => (j === 0 ? { ...current, name: n } : newRow(n, current.genre)));
      return [...before, ...pasted, ...after];
    });
  };

  /** Creates drafts for the NEW artists only — existing drafts are updated later by update_draft. */
  const createDrafts = async () => {
    if (newArtists.length === 0) return { ok: 0, failed: 0, error: null };
    const { results, error } = await createResearchDrafts(newArtists.map(({ name, genre }) => ({ name, genre })));
    if (error) return { ok: 0, failed: newArtists.length, error };
    const failed = results.filter((r) => r.status === "error");
    return { ok: results.length - failed.length, failed: failed.length, error: failed[0]?.error ?? null };
  };

  const handleChrome = async () => {
    if (artists.length === 0 || busy) return;
    setBusy("chrome");
    // Copy first, while the click still counts as a user gesture — the prompt
    // doesn't depend on the draft ids (update_draft finds drafts by artist name).
    const copied = await copyText(buildResearchPrompt(artists));
    if (!copied) {
      setBusy(null);
      setNotice("Couldn't access the clipboard. Please allow clipboard access and try again.");
      return;
    }
    const { failed, error } = await createDrafts();
    setBusy(null);
    const n = artists.length;
    // createDrafts only handled new artists; existing drafts need no server call
    onDone(
      `Prompt copied for ${n} artist${n === 1 ? "" : "s"}! Open any research site in Chrome and paste into Claude side panel.` +
        (failed ? ` (${failed} draft${failed === 1 ? "" : "s"} couldn't be created${error ? `: ${error}` : ""} — Claude will create them.)` : ""),
      failed ? "error" : "success"
    );
    onClose();
  };

  const handleDraftsOnly = async () => {
    if (newArtists.length === 0 || busy) return;
    setBusy("drafts");
    const { ok, failed, error } = await createDrafts();
    setBusy(null);
    if (ok === 0) {
      setNotice(`Couldn't create drafts${error ? `: ${error}` : ""}`);
      return;
    }
    const existingCount = artists.length - newArtists.length;
    onDone(
      `${ok} draft${ok === 1 ? "" : "s"} created in Soundcheck` +
        (existingCount ? ` (${existingCount} already had drafts)` : "") +
        (failed ? ` — ${failed} failed${error ? `: ${error}` : ""}` : ""),
      failed ? "error" : "success"
    );
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}
    >
      <div className="flex max-h-[90vh] w-full max-w-xl flex-col rounded-xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-[#001489]">Quick Research</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Pick saved drafts and/or type new artists — paste a list (one per line or comma-separated) to fill rows. Max {MAX_ARTISTS}.
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={!!busy}
            aria-label="Close"
            className="rounded p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 disabled:opacity-40"
          >
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {/* Saved drafts picker */}
          {drafts.length > 0 && (
            <div className="mb-5 rounded-lg border border-[#001489]/20 bg-[#001489]/[0.03]">
              <button
                type="button"
                onClick={() => setPickerOpen((o) => !o)}
                className="flex w-full items-center justify-between px-4 py-2.5 text-left"
                aria-expanded={pickerOpen}
              >
                <span className="text-sm font-semibold text-[#001489]">
                  Add from Saved Drafts <span className="font-normal text-gray-500">({drafts.length})</span>
                </span>
                <span className="text-xs text-gray-400">{pickerOpen ? "▲" : "▼"}</span>
              </button>

              {pickerOpen && (
                <div className="border-t border-[#001489]/10 px-4 pb-3 pt-3">
                  <input
                    value={draftQuery}
                    onChange={(e) => setDraftQuery(e.target.value)}
                    disabled={!!busy}
                    placeholder="Search drafts by artist name…"
                    className="mb-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm focus:border-[#001489] focus:outline-none focus:ring-1 focus:ring-[#001489]"
                  />
                  <div className="max-h-44 overflow-y-auto rounded-lg border border-gray-200 bg-white">
                    {availableDrafts.length === 0 ? (
                      <p className="px-3 py-3 text-center text-xs text-gray-400">
                        {draftQuery.trim() ? "No drafts match your search" : "All drafts are already in the batch"}
                      </p>
                    ) : (
                      availableDrafts.map((d) => (
                        <label
                          key={d.id}
                          className="flex cursor-pointer items-center gap-3 border-b border-gray-100 px-3 py-2 last:border-b-0 hover:bg-gray-50"
                        >
                          <input
                            type="checkbox"
                            checked={selected.has(d.id)}
                            onChange={() => toggleSelected(d.id)}
                            disabled={!!busy}
                            className="h-4 w-4 shrink-0 accent-[#001489]"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-gray-800">{d.artist_name}</p>
                            <p className="truncate text-[11px] text-gray-500">
                              {d.genre ?? "No genre"} · by {d.evaluator_name}
                              {d.updated_at ? ` · ${new Date(d.updated_at).toLocaleDateString()}` : ""}
                            </p>
                          </div>
                        </label>
                      ))
                    )}
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-xs text-gray-400">{selected.size} selected</span>
                    <button
                      type="button"
                      onClick={addSelectedDrafts}
                      disabled={selected.size === 0 || !!busy}
                      className="rounded-lg bg-[#001489] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#152238] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Add Selected{selected.size ? ` (${selected.size})` : ""}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Rows */}
          <div className="mb-1.5 grid grid-cols-[1.5rem_1fr_11rem_1.75rem] gap-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            <span />
            <span>Artist</span>
            <span>Genre</span>
            <span />
          </div>
          <div className="space-y-2">
            {rows.map((r, i) => (
              <div key={r.key} className="grid grid-cols-[1.5rem_1fr_11rem_1.75rem] items-center gap-2">
                <span className="text-right text-xs tabular-nums text-gray-400">{i + 1}.</span>
                <div className="relative min-w-0">
                <input
                  ref={(el) => { if (el) inputRefs.current.set(r.key, el); else inputRefs.current.delete(r.key); }}
                  autoFocus={i === 0 && drafts.length === 0}
                  value={r.name}
                  readOnly={!!r.draftId}
                  title={r.draftId ? "From a saved draft — remove the row to change the artist" : undefined}
                  disabled={!!busy}
                  onChange={(e) => { updateRow(r.key, { name: e.target.value }); setNotice(null); }}
                  onPaste={(e) => handlePaste(r.key, e)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); addRow(r.key); }
                    if (e.key === "Backspace" && r.name === "" && rows.length > 1) {
                      e.preventDefault();
                      const prev = rows[i - 1] ?? rows[i + 1];
                      removeRow(r.key);
                      if (prev) focusRow(prev.key);
                    }
                  }}
                  placeholder={i === 0 ? "Artist name, or paste a list" : "Artist name"}
                  className={`w-full min-w-0 rounded-lg border px-3 py-2 text-sm focus:border-[#001489] focus:outline-none focus:ring-1 focus:ring-[#001489] disabled:bg-gray-50 ${
                    isExisting(r) && r.name.trim() ? "border-[#001489]/30 bg-[#001489]/[0.03] pr-14" : "border-gray-300"
                  }`}
                />
                {isExisting(r) && r.name.trim() && (
                  <span
                    className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-[#001489] px-1.5 py-0.5 text-[10px] font-semibold text-white"
                    title="Updates an existing draft instead of creating a new one"
                  >
                    Draft
                  </span>
                )}
                </div>
                <select
                  value={r.genre}
                  disabled={!!busy}
                  onChange={(e) => updateRow(r.key, { genre: e.target.value })}
                  aria-label={`Genre for row ${i + 1}`}
                  className="min-w-0 rounded-lg border border-gray-300 bg-white px-2 py-2 text-xs focus:border-[#001489] focus:outline-none focus:ring-1 focus:ring-[#001489] disabled:bg-gray-50"
                >
                  {VALID_GENRES.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
                <button
                  type="button"
                  onClick={() => removeRow(r.key)}
                  disabled={!!busy}
                  aria-label={`Remove row ${i + 1}`}
                  className="flex h-7 w-7 items-center justify-center rounded text-gray-400 transition hover:bg-red-50 hover:text-[#C8102E] disabled:opacity-40"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          <div className="mt-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() => addRow()}
              disabled={atMax || !!busy}
              className="text-sm font-semibold text-[#001489] transition hover:underline disabled:cursor-not-allowed disabled:text-gray-300 disabled:no-underline"
            >
              + Add Artist
            </button>
            <span className="text-xs text-gray-400">{rows.length} / {MAX_ARTISTS}</span>
          </div>

          {notice && <p className="mt-3 text-xs text-[#C8102E]">{notice}</p>}
        </div>

        {/* Actions */}
        <div className="flex shrink-0 flex-col gap-2 border-t border-gray-200 px-6 py-4 sm:flex-row-reverse">
          <button
            type="button"
            onClick={handleChrome}
            disabled={artists.length === 0 || !!busy}
            className="rounded-lg bg-[#C8102E] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#a60d26] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy === "chrome" ? "Creating drafts…" : "Copy Chrome Research Prompt"}
          </button>
          <button
            type="button"
            onClick={handleDraftsOnly}
            disabled={newArtists.length === 0 || !!busy}
            title={artists.length > 0 && newArtists.length === 0 ? "Every artist in the batch already has a draft" : undefined}
            className="rounded-lg border-2 border-[#001489] px-4 py-2 text-sm font-semibold text-[#001489] transition hover:bg-[#001489]/5 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy === "drafts" ? "Creating drafts…" : "Push to Artist Scores Only"}
          </button>
        </div>
      </div>
    </div>
  );
}
