"use client";

import { useRef, useState } from "react";
import { VALID_GENRES } from "@/app/evaluations/new/types";
import { createResearchDrafts } from "@/app/research/actions";

const MAX_ARTISTS = 10; // keep in sync with app/research/actions.ts
const DEFAULT_GENRE = "Rock / Alt / Indie";

type Row = { key: number; name: string; genre: string };
type Artist = { name: string; genre: string };

export function buildResearchPrompt(artists: Artist[]): string {
  const list = artists.map((a, i) => `${i + 1}. ${a.name} (${a.genre})`).join("\n");
  return `Run A3 Soundcheck research for ${artists.length} artist${artists.length === 1 ? "" : "s"}. Work through them one at a time. After each artist, use the update_draft or create_draft Soundcheck tool to push the data before moving to the next.

ARTISTS:
${list}

For each artist, complete these steps:

CHARTMETRIC (app.chartmetric.com):
- Search for the artist
- Overview tab: read Spotify monthly listeners, Spotify followers, TikTok followers, YouTube subscribers, Instagram followers
- Click Social & Streaming Stats tab: read Instagram engagement rate, TikTok engagement rate (Chartmetric native ER), YouTube engagement rate, TikTok average views per video, Spotify Fan Conversion Rate
- Click the List view icon (horizontal lines icon) to switch to table view. Read the historical data to find: Spotify monthly listeners from 12 months ago (calculate YoY % change), Instagram followers from 90 days ago (calculate 90-day gain)
- Click Audience tab: read all age demographics (13-17, 18-24, 25-34, 35-44, 45-64, 65+) split by Male and Female percentages, and ethnicity breakdown (White, Hispanic, African American, Asian)
- Click Playlists tab: read editorial playlist count and total reach

ROSTR (rostr.co):
- Search for the artist
- Click their Team tab
- Read: management company, individual manager names, booking agencies with territory (North America, UK/EU, Worldwide), individual agent names, label, publisher
- Use Soundcheck get_contacts to check which companies, agencies, managers, and agents already exist in the database

POLLSTAR (pollstar.com):
- Search for the artist
- Click Explore in Datacloud on their artist page
- Read: venue capacities for recent shows, sell-through percentages
- Note the data for touring metrics

PUSH TO SOUNDCHECK:
After collecting all data for this artist, use the update_draft tool (search for the artist first to find the existing draft) or create_draft to push everything. Use these field names:
- spotify_monthly_listeners, fan_concentration_ratio, spotify_yoy_pct
- ig_followers, ig_er_pct, ig_90day_gain
- tiktok_followers, tiktok_avg_views, tiktok_er_pct
- youtube_subscribers, youtube_er_pct
- reddit_members, discord_members
- store_quality, merch_range, price_point_highest, d2c_level, merch_provider
- press_score, playlist_score
- num_dates, market_coverage, venue_capacity, sell_through_pct
- management_company, manager_names, booking_agent
- All demographics: d_13_17_m, d_13_17_f, d_18_24_m, d_18_24_f, d_25_34_m, d_25_34_f, d_35_44_m, d_35_44_f, d_45_64_m, d_45_64_f, d_65_m, d_65_f, eth_white, eth_hispanic, eth_aa, eth_asian
Enter percentages as numbers (22 for 22%, not 0.22).

After each artist, summarize what was found and what's still missing. Then move to the next artist.`;
}

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
  onClose: () => void;
  onDone: (message: string, kind?: "success" | "error") => void;
}

export default function QuickResearchModal({ onClose, onDone }: Props) {
  const nextKey = useRef(1);
  const newRow = (name = "", genre = DEFAULT_GENRE): Row => ({ key: nextKey.current++, name, genre });

  const [rows, setRows] = useState<Row[]>(() => [newRow()]);
  const [busy, setBusy] = useState<null | "chrome" | "drafts">(null);
  const [notice, setNotice] = useState<string | null>(null);
  const inputRefs = useRef(new Map<number, HTMLInputElement>());

  const artists: Artist[] = rows.filter((r) => r.name.trim()).map((r) => ({ name: r.name.trim(), genre: r.genre }));
  const atMax = rows.length >= MAX_ARTISTS;

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

  const createDrafts = async () => {
    const { results, error } = await createResearchDrafts(artists);
    if (error) return { ok: 0, failed: artists.length, error };
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
    onDone(
      `Prompt copied for ${n} artist${n === 1 ? "" : "s"}! Open any research site in Chrome and paste into Claude side panel.` +
        (failed ? ` (${failed} draft${failed === 1 ? "" : "s"} couldn't be created${error ? `: ${error}` : ""} — Claude will create them.)` : ""),
      failed ? "error" : "success"
    );
    onClose();
  };

  const handleDraftsOnly = async () => {
    if (artists.length === 0 || busy) return;
    setBusy("drafts");
    const { ok, failed, error } = await createDrafts();
    setBusy(null);
    if (ok === 0) {
      setNotice(`Couldn't create drafts${error ? `: ${error}` : ""}`);
      return;
    }
    onDone(
      `${ok} draft${ok === 1 ? "" : "s"} created in Soundcheck` +
        (failed ? ` (${failed} failed${error ? `: ${error}` : ""})` : ""),
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
              One artist per row — paste a list (one per line or comma-separated) to fill rows. Max {MAX_ARTISTS}.
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

        {/* Rows */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
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
                <input
                  ref={(el) => { if (el) inputRefs.current.set(r.key, el); else inputRefs.current.delete(r.key); }}
                  autoFocus={i === 0}
                  value={r.name}
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
                  className="min-w-0 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#001489] focus:outline-none focus:ring-1 focus:ring-[#001489] disabled:bg-gray-50"
                />
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
            disabled={artists.length === 0 || !!busy}
            className="rounded-lg border-2 border-[#001489] px-4 py-2 text-sm font-semibold text-[#001489] transition hover:bg-[#001489]/5 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy === "drafts" ? "Creating drafts…" : "Push to Artist Scores Only"}
          </button>
        </div>
      </div>
    </div>
  );
}
