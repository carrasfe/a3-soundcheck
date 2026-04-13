"use client";

import { useMemo } from "react";
import { ScoreSelector, ScoreBadge } from "../ui";
import type { StepProps } from "../types";
import { buildScoringInputs } from "../types";
import { calculateScore } from "@/lib/scoring-engine";

export default function Step9PressPlaylist({ data, onChange, errors }: StepProps) {
  const p4 = useMemo(() => {
    const inputs = buildScoringInputs(data);
    if (!inputs || !data.genre) return null;
    try { return calculateScore(inputs).p4; } catch { return null; }
  }, [data]);

  return (
    <div className="space-y-6">
      {/* Press */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-[#1B2A4A]">
              Press / Blog Coverage
            </h3>
            <p className="text-xs text-gray-500">15% weight in P4</p>
          </div>
          <ScoreBadge score={p4?.sub_scores.press ?? null} />
        </div>
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
      </section>

      {/* Playlist */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-[#1B2A4A]">
              Playlist / Algorithm Traction
            </h3>
            <p className="text-xs text-gray-500">10% weight in P4</p>
          </div>
          <ScoreBadge score={p4?.sub_scores.playlist ?? null} />
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
      {p4 && (
        <section className="rounded-xl border border-[#1B2A4A]/20 bg-[#1B2A4A]/5 p-6">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[#1B2A4A]">
            P4 Live Preview
          </h3>
          <div className="grid grid-cols-5 gap-2 text-sm">
            {[
              { label: "YoY",       score: p4.sub_scores.spotify_yoy,      weight: "30%" },
              { label: "Venue",     score: p4.sub_scores.venue_progression, weight: "25%" },
              { label: "IG Growth", score: p4.sub_scores.ig_growth,         weight: "20%" },
              { label: "Press",     score: p4.sub_scores.press,             weight: "15%" },
              { label: "Playlist",  score: p4.sub_scores.playlist,          weight: "10%" },
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
