"use client";

import { useMemo } from "react";
import { Input, ScoreBadge } from "../ui";
import type { EvalFormData, StepProps } from "../types";
import { buildScoringInputs } from "../types";
import { calculateScore } from "@/lib/scoring-engine";

export default function Step5Instagram({ data, onChange, csvFilled, errors }: StepProps) {
  const set = (key: keyof EvalFormData) =>
    (e: React.ChangeEvent<HTMLInputElement>) => onChange({ [key]: e.target.value });

  const scores = useMemo(() => {
    const inputs = buildScoringInputs(data);
    if (!inputs || !data.genre) return null;
    try {
      const r = calculateScore(inputs);
      return { p2: r.p2, p4: r.p4 };
    } catch { return null; }
  }, [data]);

  const igGrowthPct = useMemo(() => {
    const f = parseFloat(data.ig_followers)  || 0;
    const g = parseFloat(data.ig_30day_gain) || 0;
    if (!f || !g) return null;
    return ((g / f) * 100).toFixed(2) + "%";
  }, [data.ig_followers, data.ig_30day_gain]);

  return (
    <div className="space-y-6">
      {/* Instagram ER */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-[#1B2A4A]">Instagram</h3>
          <ScoreBadge score={scores?.p2.sub_scores.IG_ER ?? null} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Follower Count"
            required
            type="number"
            min={0}
            value={data.ig_followers}
            onChange={set("ig_followers")}
            placeholder="e.g. 250000"
            error={errors.ig_followers}
            csvFilled={csvFilled.has("ig_followers")}
          />
          <Input
            label="Engagement Rate (%)"
            type="number"
            min={0}
            value={data.ig_er_pct}
            onChange={set("ig_er_pct")}
            placeholder="e.g. 3.2"
            hint="Enter as 3.2, not 0.032"
            error={errors.ig_er_pct}
          />
        </div>
        {parseFloat(data.ig_followers) < 10_000 && data.ig_followers && (
          <p className="mt-2 text-xs text-[#C0392B]">⚠ Under 10K followers — IG score capped at 1</p>
        )}
        {parseFloat(data.ig_followers) >= 10_000 && parseFloat(data.ig_followers) < 50_000 && (
          <p className="mt-2 text-xs text-gray-500">⚠ 10–50K followers — IG score capped at 3</p>
        )}
      </section>

      {/* 30-Day Growth */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-[#1B2A4A]">Instagram Growth</h3>
            <p className="text-xs text-gray-500">20% weight in P4</p>
          </div>
          <ScoreBadge score={scores?.p4.sub_scores.ig_growth ?? null} />
        </div>
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
          <p className="mt-2 text-xs text-gray-500">
            Monthly growth rate: <span className="font-semibold text-[#1B2A4A]">{igGrowthPct}</span>
            {parseFloat(data.ig_followers) > 200_000 && (
              <span className="ml-1 text-gray-400">(relaxed thresholds for 200K+ accounts)</span>
            )}
          </p>
        )}
      </section>
    </div>
  );
}
