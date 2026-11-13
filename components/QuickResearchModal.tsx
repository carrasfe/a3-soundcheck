"use client";

import { useState } from "react";
import { VALID_GENRES } from "@/app/evaluations/new/types";

export function buildResearchPrompt(artist: string, genre: string): string {
  return `Run a full A3 Soundcheck research for ${artist} (${genre}).

Step 1: I'm on Chartmetric. Read all stats from this page. Then click Social & Streaming Stats, switch to List view, and read the table. Then click Audience and read demographics. Then click Playlists and read editorial playlist data.

Step 2: Navigate to rostr.co and search for ${artist}. Read their Team tab for management, agents (note territories), label, and publisher.

Step 3: Check Soundcheck contacts for each manager and agent found. Report what exists and what's new.

Step 4: Navigate to reddit.com/r/[artist subreddit if it exists] and note the member count.

Step 5: Search for ${artist} official merch store. Note: store quality (1-5), merch product range (count of non-music items), highest priced non-music item, whether they have email signup, SMS, Patreon or fan club.

Step 6: Create a Soundcheck draft with ALL data collected. Genre: ${genre}.`;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for browsers/contexts without the async clipboard API
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
  onCopied: () => void;
}

export default function QuickResearchModal({ onClose, onCopied }: Props) {
  const [artist, setArtist] = useState("");
  const [genre, setGenre] = useState("");
  const [error, setError] = useState<string | null>(null);

  const canCopy = artist.trim() !== "" && genre !== "";

  const handleCopy = async () => {
    if (!canCopy) return;
    const ok = await copyText(buildResearchPrompt(artist.trim(), genre));
    if (ok) {
      onCopied();
      onClose();
    } else {
      setError("Couldn't access the clipboard. Please allow clipboard access and try again.");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-[#001489]">Quick Research</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Generate a research prompt for Claude in the Chrome side panel
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
          >
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        <form
          className="space-y-4 px-6 py-5"
          onSubmit={(e) => { e.preventDefault(); handleCopy(); }}
        >
          <div>
            <label htmlFor="qr-artist" className="mb-1 block text-xs font-semibold text-gray-700">
              Artist name
            </label>
            <input
              id="qr-artist"
              autoFocus
              value={artist}
              onChange={(e) => { setArtist(e.target.value); setError(null); }}
              placeholder="e.g. Phoebe Bridgers"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#001489] focus:outline-none focus:ring-1 focus:ring-[#001489]"
            />
          </div>

          <div>
            <label htmlFor="qr-genre" className="mb-1 block text-xs font-semibold text-gray-700">
              Genre
            </label>
            <select
              id="qr-genre"
              value={genre}
              onChange={(e) => { setGenre(e.target.value); setError(null); }}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-[#001489] focus:outline-none focus:ring-1 focus:ring-[#001489]"
            >
              <option value="">Select a genre…</option>
              {VALID_GENRES.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>

          {error && <p className="text-xs text-[#C8102E]">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-600 transition hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canCopy}
              className="rounded-lg bg-[#C8102E] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#a60d26] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Copy Research Prompt
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
