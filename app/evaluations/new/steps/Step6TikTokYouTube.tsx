"use client";

import { useMemo } from "react";
import { Input, ScoreBadge } from "../ui";
import type { EvalFormData, StepProps } from "../types";
import { buildScoringInputs } from "../types";
import { calculateScore } from "@/lib/scoring-engine";

export default function Step6TikTokYouTube({ data, onChange, csvFilled, errors }: StepProps) {
  const set = (key: keyof EvalFormData) =>
    (e: React.ChangeEvent<HTMLInputElement>) => onChange({ [key]: e.target.value });

  const p2 = useMemo(() => {
    const inputs = buildScoringInputs(data);
    if (!inputs || !data.genre) return null;
    try { return calculateScore(inputs).p2; } catch { return null; }
  }, [data]);

  const ttEr = useMemo(() => {
    const f = parseFloat(data.tiktok_followers) || 0;
    const v = parseFloat(data.tiktok_avg_views)  || 0;
    if (!f || !v) return null;
    return ((v / f) * 100).toFixed(2) + "%";
  }, [data.tiktok_followers, data.tiktok_avg_views]);

  return (
    <div className="space-y-6">
      {/* TikTok */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-[#1B2A4A]">TikTok</h3>
          <ScoreBadge score={p2?.sub_scores.TikTok ?? null} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Follower Count"
            required
            type="number"
            min={0}
            value={data.tiktok_followers}
            onChange={set("tiktok_followers")}
            placeholder="e.g. 150000"
            error={errors.tiktok_followers}
            csvFilled={csvFilled.has("tiktok_followers")}
          />
          <div>
            <Input
              label="Avg Views per Video (10 non-viral posts)"
              type="number"
              min={0}
              value={data.tiktok_avg_views}
              onChange={set("tiktok_avg_views")}
              placeholder="e.g. 8500"
            />
            {ttEr && (
              <p className="mt-1 text-xs text-gray-500">
                Calculated ER: <span className="font-semibold text-[#1B2A4A]">{ttEr}</span>
              </p>
            )}
          </div>
        </div>
        {parseFloat(data.tiktok_followers) < 15_000 && data.tiktok_followers && (
          <p className="mt-2 text-xs text-amber-600">⚠ Under 15K followers — TikTok score capped at 1</p>
        )}
        {parseFloat(data.tiktok_followers) >= 15_000 && parseFloat(data.tiktok_followers) < 75_000 && (
          <p className="mt-2 text-xs text-amber-600">⚠ 15–75K followers — TikTok score capped at 3</p>
        )}
        {p2 && (
          <p className="mt-2 text-xs text-gray-500">
            Age-adjusted TikTok weight:{" "}
            <span className="font-medium">{(p2.tiktok_age_adjusted_weight * 100).toFixed(1)}%</span>
            {p2.tiktok_age_adjusted_weight < (p2.sub_weights.TikTok + 0.001) && (
              <span className="ml-1 text-amber-600">(reduced for audience age)</span>
            )}
          </p>
        )}
      </section>

      {/* YouTube */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-[#1B2A4A]">YouTube</h3>
          <div className="flex items-center gap-2">
            {p2?.youtube_excluded && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                Excluded (score ≤1)
              </span>
            )}
            <ScoreBadge score={p2?.sub_scores.YouTube ?? null} />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Subscriber Count"
            required
            type="number"
            min={0}
            value={data.youtube_subscribers}
            onChange={set("youtube_subscribers")}
            placeholder="e.g. 80000"
            error={errors.youtube_subscribers}
            csvFilled={csvFilled.has("youtube_subscribers")}
          />
          <Input
            label="YouTube Engagement Rate (%)"
            type="number"
            min={0}
            step="0.01"
            value={data.youtube_er_pct}
            onChange={set("youtube_er_pct")}
            placeholder="Enter as 2.5, not 0.025"
          />
        </div>
        <p className="mt-2 text-xs text-gray-500">
          Semi-optional: if score is 0–1, YouTube is excluded from the weighted average and its weight is redistributed.
        </p>
      </section>
    </div>
  );
}
