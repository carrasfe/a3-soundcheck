"use client";

import { useMemo } from "react";
import { Input, Select, ScoreBadge, ScoreSelector } from "../ui";
import type { EvalFormData, StepProps } from "../types";
import { buildScoringInputs } from "../types";
import { calculateScore } from "@/lib/scoring-engine";

const ALBUM_OPTIONS = [
  { value: "peak_declining", label: "Album in last 6 months (peak / declining)" },
  { value: "normalizing",    label: "Album in last 6–18 months (normalizing)" },
  { value: "anticipation",   label: "Album releasing soon (anticipation)" },
];

export default function Step4Spotify({ data, onChange, csvFilled, errors }: StepProps) {
  const set = (key: keyof EvalFormData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      onChange({ [key]: e.target.value });

  const scores = useMemo(() => {
    const inputs = buildScoringInputs(data);
    if (!inputs || !data.genre) return null;
    try {
      const r = calculateScore(inputs);
      return { p2: r.p2, p4: r.p4 };
    } catch { return null; }
  }, [data]);

  const listenerSize = parseFloat(data.spotify_monthly_listeners) || 0;
  const yoyTierHint =
    listenerSize >= 2_000_000 ? "Large (2M+): thresholds −5% / 2% / 10% / 30%"
    : listenerSize >= 500_000 ? "Mid (500K–2M): thresholds −2% / 5% / 20% / 45%"
    : listenerSize > 0         ? "Small (<500K): thresholds 0% / 10% / 30% / 60%"
    : null;

  return (
    <div className="space-y-6">
      {/* Monthly Listeners + FCR */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[#1B2A4A]">Spotify</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Monthly Listeners"
            required
            type="number"
            min={0}
            value={data.spotify_monthly_listeners}
            onChange={set("spotify_monthly_listeners")}
            placeholder="e.g. 1500000"
            error={errors.spotify_monthly_listeners}
            csvFilled={csvFilled.has("spotify_monthly_listeners")}
          />
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <Input
                label="Fan Conversion Ratio (FCR) %"
                required
                type="number"
                min={0}
                max={100}
                value={data.fan_concentration_ratio}
                onChange={set("fan_concentration_ratio")}
                placeholder="e.g. 22"
                hint="Enter as 22, not 0.22"
                error={errors.fan_concentration_ratio}
                csvFilled={csvFilled.has("fan_concentration_ratio")}
              />
            </div>
            <div className="mb-0.5 shrink-0">
              <ScoreBadge score={scores?.p2.sub_scores.FCR ?? null} />
            </div>
          </div>
        </div>
      </section>

      {/* YoY Growth + Album Cycle Override */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-[#1B2A4A]">Spotify Growth</h3>
            <p className="text-xs text-gray-500">30% weight in P4</p>
          </div>
          <ScoreBadge score={scores?.p4.sub_scores.spotify_yoy ?? null} />
        </div>
        <Input
          label="Year-over-Year Monthly Listener Trend (%)"
          type="number"
          value={data.spotify_yoy_pct}
          onChange={set("spotify_yoy_pct")}
          placeholder="e.g. 12"
          hint={yoyTierHint ?? "Enter as 12, not 0.12. Negative values OK."}
          error={errors.spotify_yoy_pct}
          csvFilled={csvFilled.has("spotify_yoy_pct")}
        />

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

      {/* Playlist / Algorithm Traction */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-[#1B2A4A]">
              Playlist / Algorithm Traction
            </h3>
            <p className="text-xs text-gray-500">10% weight in P4</p>
          </div>
          <ScoreBadge score={scores?.p4.sub_scores.playlist ?? null} />
        </div>
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
      </section>

      {/* P4 Live Preview */}
      {scores?.p4 && (
        <section className="rounded-xl border border-[#1B2A4A]/20 bg-[#1B2A4A]/5 p-6">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[#1B2A4A]">
            P4 Live Preview
          </h3>
          <div className="grid grid-cols-5 gap-2 text-sm">
            {[
              { label: "YoY",       score: scores.p4.sub_scores.spotify_yoy,       weight: "30%" },
              { label: "Venue",     score: scores.p4.sub_scores.venue_progression,  weight: "25%" },
              { label: "IG Growth", score: scores.p4.sub_scores.ig_growth,          weight: "20%" },
              { label: "Press",     score: scores.p4.sub_scores.press,              weight: "15%" },
              { label: "Playlist",  score: scores.p4.sub_scores.playlist,           weight: "10%" },
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
            <span className="text-lg font-bold text-[#1B2A4A]">{scores.p4.final_score.toFixed(2)}</span>
          </div>
        </section>
      )}
    </div>
  );
}
