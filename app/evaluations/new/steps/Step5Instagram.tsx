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
    const g = parseFloat(data.ig_90day_gain) || 0;
    if (!f || !g) return null;
    return ((g / f) * 100).toFixed(2) + "%";
  }, [data.ig_followers, data.ig_90day_gain]);

  return (
    <div className="space-y-6">
      {/* Instagram ER */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-[#001489]">Instagram</h3>
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
        {scores?.p2.ig_er_tier && data.ig_er_pct && (
          <p className={`mt-2 text-xs ${scores.p2.ig_er_tier.mode === "capped" ? "text-[#C8102E]" : "text-gray-500"}`}>
            {scores.p2.ig_er_tier.mode === "capped"
              ? `⚠ Tier ${scores.p2.ig_er_tier.tier}: ${scores.p2.ig_er_tier.range_label} followers — IG score capped at ${scores.p2.ig_er_tier.cap_score}`
              : scores.p2.ig_er_tier.mode === "adjusted"
              ? `Tier ${scores.p2.ig_er_tier.tier}: ${scores.p2.ig_er_tier.range_label} followers — thresholds adjusted ×${scores.p2.ig_er_tier.multiplier.toFixed(1)}`
              : `Tier ${scores.p2.ig_er_tier.tier}: ${scores.p2.ig_er_tier.range_label} followers — baseline thresholds`}
          </p>
        )}
      </section>

      {/* 90-Day Growth */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-[#001489]">Instagram Growth</h3>
            <p className="text-xs text-gray-500">20% weight in P4</p>
          </div>
          <ScoreBadge score={scores?.p4.sub_scores.ig_growth ?? null} />
        </div>
        <Input
          label="90-Day Follower Gain"
          type="number"
          min={0}
          value={data.ig_90day_gain}
          onChange={set("ig_90day_gain")}
          placeholder="e.g. 10500"
          hint="Net new followers over the last 90 days"
          csvFilled={csvFilled.has("ig_90day_gain")}
        />
        {igGrowthPct && (
          <p className="mt-2 text-xs text-gray-500">
            Monthly growth rate: <span className="font-semibold text-[#001489]">{igGrowthPct}</span>
            {parseFloat(data.ig_followers) > 200_000 && (
              <span className="ml-1 text-gray-400">(relaxed thresholds for 200K+ accounts)</span>
            )}
          </p>
        )}
      </section>
    </div>
  );
}
