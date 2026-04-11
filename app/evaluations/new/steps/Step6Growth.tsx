"use client";

import { useMemo } from "react";
import { Input, Select, ScoreSelector, ScoreBadge } from "../ui";
import type { EvalFormData, StepProps } from "../types";
import { buildScoringInputs } from "../types";
import { calculateScore } from "@/lib/scoring-engine";

const ALBUM_OPTIONS = [
  { value: "peak_declining",  label: "Album in last 6 months (peak / declining)" },
  { value: "normalizing",     label: "Album in last 6–18 months (normalizing)" },
  { value: "anticipation",    label: "Album releasing soon (anticipation)" },
];

const VENUE_PROGRESSION_OPTIONS = [
  { value: "smaller",        label: "Smaller venues than previous cycle" },
  { value: "same",           label: "Same venue size" },
  { value: "slight_step_up", label: "Slight step-up" },
  { value: "major_jump",     label: "Major jump" },
  { value: "tier_change",    label: "Tier change (e.g. clubs → theatres)" },
];

export default function Step6Growth({ data, onChange, csvFilled, errors }: StepProps) {
  const set = (key: keyof EvalFormData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      onChange({ [key]: e.target.value });

  const p4 = useMemo(() => {
    const inputs = buildScoringInputs(data);
    if (!inputs || !data.genre) return null;
    try { return calculateScore(inputs).p4; } catch { return null; }
  }, [data]);

  // IG growth % preview
  const igGrowthPct = useMemo(() => {
    const f = parseFloat(data.ig_followers)  || 0;
    const g = parseFloat(data.ig_30day_gain) || 0;
    if (!f || !g) return null;
    return ((g / f) * 100).toFixed(2) + "%";
  }, [data.ig_followers, data.ig_30day_gain]);

  const listenerSize = parseFloat(data.spotify_monthly_listeners) || 0;
  const yoyTierHint =
    listenerSize >= 2_000_000 ? "Large (2M+): thresholds −5% / 2% / 10% / 30%"
    : listenerSize >= 500_000 ? "Mid (500K–2M): thresholds −2% / 5% / 20% / 45%"
    : listenerSize > 0         ? "Small (<500K): thresholds 0% / 10% / 30% / 60%"
    : null;

  return (
    <div className="space-y-6">
      {/* Spotify */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[#1B2A4A]">Spotify Growth</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Monthly Listeners</label>
            <div className="flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
              {listenerSize > 0
                ? listenerSize.toLocaleString()
                : <span className="text-gray-400 italic">Enter in Step 4 (P2)</span>}
            </div>
          </div>
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <Input
                label="Year-over-Year Change %"
                type="number"
                value={data.spotify_yoy_pct}
                onChange={set("spotify_yoy_pct")}
                placeholder="e.g. 12"
                hint={yoyTierHint ?? "Enter as 12, not 0.12. Negative values OK."}
                csvFilled={csvFilled.has("spotify_yoy_pct")}
              />
            </div>
            <div className="mb-0.5 shrink-0">
              <ScoreBadge score={p4?.sub_scores.spotify_yoy ?? null} />
            </div>
          </div>
        </div>

        {/* Album Cycle Override */}
        <div className="mt-4">
          {!data.show_album_cycle ? (
            <button
              type="button"
              onClick={() => onChange({ show_album_cycle: true })}
              className="text-sm text-[#C0392B] hover:underline"
            >
              + Add album cycle context
            </button>
          ) : (
            <div className="rounded-lg border border-[#1B2A4A]/20 bg-[#1B2A4A]/5 p-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium text-[#1B2A4A]">Album Cycle Context</p>
                <button
                  type="button"
                  onClick={() => onChange({ show_album_cycle: false, album_cycle_override: "" })}
                  className="text-xs text-[#C0392B] hover:underline"
                >
                  Remove
                </button>
              </div>
              <p className="mb-3 text-xs text-[#1B2A4A]/70">
                If YoY score is below 3, this will boost it by 1 point (max 3). Useful when listener decline is expected mid-cycle.
              </p>
              <Select
                label="Album Cycle Status"
                value={data.album_cycle_override}
                onChange={set("album_cycle_override")}
              >
                <option value="">Select context…</option>
                {ALBUM_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            </div>
          )}
        </div>
      </section>

      {/* Venue Progression */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-[#1B2A4A]">Venue Progression</h3>
            <p className="text-xs text-gray-500">25% weight</p>
          </div>
          <ScoreBadge score={p4?.sub_scores.venue_progression ?? null} />
        </div>
        <Select
          label="Vs. last major cycle"
          required
          value={data.venue_progression}
          onChange={set("venue_progression")}
          error={errors.venue_progression}
        >
          <option value="">Select…</option>
          {VENUE_PROGRESSION_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </Select>
        {data.venue_progression === "same" && (
          <p className="mt-1.5 text-xs text-gray-500">
            "Same venue size" auto-scores by capacity:
            &lt;1K=1, &lt;2.5K=2, &lt;5K=3, 5K+=4
          </p>
        )}
      </section>

      {/* IG Growth */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-[#1B2A4A]">Instagram Growth</h3>
            <p className="text-xs text-gray-500">20% weight</p>
          </div>
          <ScoreBadge score={p4?.sub_scores.ig_growth ?? null} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Followers</label>
            <div className="flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
              {parseFloat(data.ig_followers) > 0
                ? parseFloat(data.ig_followers).toLocaleString()
                : <span className="text-gray-400 italic">From Step 4</span>}
            </div>
          </div>
          <div>
            <Input
              label="30-Day Follower Gain"
              type="number"
              min={0}
              value={data.ig_30day_gain}
              onChange={set("ig_30day_gain")}
              placeholder="e.g. 3500"
              hint="Net new followers over the last 30 days"
              csvFilled={csvFilled.has("ig_30day_gain")}
            />
            {igGrowthPct && (
              <p className="mt-1 text-xs text-gray-500">
                Growth rate: <span className="font-semibold text-[#1B2A4A]">{igGrowthPct}</span>
                {parseFloat(data.ig_followers) > 200_000 && (
                  <span className="ml-1 text-gray-400">(relaxed thresholds for 200K+ accounts)</span>
                )}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Press & Playlist */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="mb-5 text-sm font-semibold uppercase tracking-wider text-[#1B2A4A]">Press & Playlist</h3>
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">
                Press Coverage <span className="text-[#C0392B]">*</span>
              </label>
              <ScoreBadge score={p4?.sub_scores.press ?? null} />
            </div>
            <p className="mb-2 text-xs text-gray-500">15% weight</p>
            <ScoreSelector
              label=""
              required
              value={data.press_score}
              onChange={(v) => onChange({ press_score: v })}
              descriptions={[
                "1 — No meaningful press",
                "2 — Local / minor blog coverage",
                "3 — Regional / mid-tier publications",
                "4 — National press, multiple outlets",
                "5 — Major national / international coverage",
              ]}
              error={errors.press_score}
            />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">
                Playlist Placement <span className="text-[#C0392B]">*</span>
              </label>
              <ScoreBadge score={p4?.sub_scores.playlist ?? null} />
            </div>
            <p className="mb-2 text-xs text-gray-500">10% weight</p>
            <ScoreSelector
              label=""
              required
              value={data.playlist_score}
              onChange={(v) => onChange({ playlist_score: v })}
              descriptions={[
                "1 — No notable playlist placement",
                "2 — Indie / editorial playlists",
                "3 — Mid-tier editorial or high-follower indie",
                "4 — Major editorial (Today's Top Hits adjacent)",
                "5 — Multiple flagship editorial placements",
              ]}
              error={errors.playlist_score}
            />
          </div>
        </div>
      </section>

      {/* P4 summary */}
      {p4 && (
        <section className="rounded-xl border border-[#1B2A4A]/20 bg-[#1B2A4A]/5 p-6">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[#1B2A4A]">P4 Live Preview</h3>
          <div className="grid grid-cols-5 gap-2 text-sm">
            {[
              { label: "YoY",      score: p4.sub_scores.spotify_yoy,       weight: "30%" },
              { label: "Venue",    score: p4.sub_scores.venue_progression,  weight: "25%" },
              { label: "IG Growth",score: p4.sub_scores.ig_growth,          weight: "20%" },
              { label: "Press",    score: p4.sub_scores.press,              weight: "15%" },
              { label: "Playlist", score: p4.sub_scores.playlist,           weight: "10%" },
            ].map(({ label, score, weight }) => (
              <div key={label} className="text-center">
                <p className="text-xs text-gray-500">{label}</p>
                <ScoreBadge score={score} size="md" />
                <p className="mt-0.5 text-xs text-gray-400">{weight}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-[#1B2A4A]/10 pt-3">
            <span className="text-sm font-medium text-gray-600">P4 Score</span>
            <span className="text-lg font-bold text-[#1B2A4A]">{p4.final_score.toFixed(2)}</span>
          </div>
        </section>
      )}
    </div>
  );
}
