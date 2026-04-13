"use client";

import { useMemo } from "react";
import { Input, Select, ScoreBadge } from "../ui";
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
                label="Fan Concentration Ratio (FCR) %"
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
    </div>
  );
}
