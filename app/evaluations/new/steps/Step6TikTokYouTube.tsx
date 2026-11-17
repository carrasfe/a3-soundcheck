"use client";

import { useMemo } from "react";
import { Input, ScoreBadge } from "../ui";
import type { EvalFormData, StepProps } from "../types";
import { buildScoringInputs } from "../types";
import {
  calculateScore, tiktokViralBonus, youtubeReachBonus, YOUTUBE_SUBSCRIBER_FLOOR_MIN, type MetricTier,
} from "@/lib/scoring-engine";

/** "Tier: 500K-1M followers — thresholds adjusted ×0.4" style note under a score. */
function tierNote(tier: MetricTier, unit: string, metric: string): { text: string; warn: boolean } {
  if (tier.mode === "capped") return { text: `⚠ ${tier.range_label} ${unit} — ${metric} score capped at ${tier.cap_score}`, warn: true };
  if (tier.mode === "adjusted") return { text: `Tier: ${tier.range_label} ${unit} — thresholds adjusted ×${tier.multiplier}`, warn: false };
  return { text: `Tier: ${tier.range_label} ${unit} — baseline thresholds`, warn: false };
}

export default function Step6TikTokYouTube({ data, onChange, csvFilled, errors }: StepProps) {
  const set = (key: keyof EvalFormData) =>
    (e: React.ChangeEvent<HTMLInputElement>) => onChange({ [key]: e.target.value });

  const p2 = useMemo(() => {
    const inputs = buildScoringInputs(data);
    if (!inputs || !data.genre) return null;
    try { return calculateScore(inputs).p2; } catch { return null; }
  }, [data]);

  // Legacy views/followers ER — only surfaced as a fallback note when the
  // Chartmetric ER hasn't been entered yet (graceful degradation for older data).
  const legacyTtEr = useMemo(() => {
    if (data.tiktok_er_pct) return null;
    const f = parseFloat(data.tiktok_followers) || 0;
    const v = parseFloat(data.tiktok_avg_views)  || 0;
    if (!f || !v) return null;
    return ((v / f) * 100).toFixed(2) + "%";
  }, [data.tiktok_er_pct, data.tiktok_followers, data.tiktok_avg_views]);

  const reachBonus = useMemo(() => {
    const subs = parseFloat(data.youtube_subscribers) || 0;
    const aud  = parseFloat(data.youtube_monthly_audience) || 0;
    return { bonus: youtubeReachBonus(subs, aud, p2?.sub_scores.YouTube ?? 0), subs, aud };
  }, [data.youtube_subscribers, data.youtube_monthly_audience, p2]);

  const viralSignal = useMemo(() => {
    const f = parseFloat(data.tiktok_followers) || 0;
    const v = parseFloat(data.tiktok_avg_views)  || 0;
    const bonus = tiktokViralBonus(f, v);
    if (!bonus) return null;
    return { bonus, avgViews: v, followers: f };
  }, [data.tiktok_followers, data.tiktok_avg_views]);

  return (
    <div className="space-y-6">
      {/* TikTok */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-[#001489]">TikTok</h3>
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
          <Input
            label="TikTok Engagement Rate (%)"
            type="number"
            min={0}
            step="0.01"
            value={data.tiktok_er_pct}
            onChange={set("tiktok_er_pct")}
            placeholder="Enter Chartmetric ER, e.g. 1.42"
            hint="Chartmetric native ER — engagement per view, not views/followers"
            csvFilled={csvFilled.has("tiktok_er_pct")}
          />
        </div>
        <div className="mt-4">
          <Input
            label="Avg Views per Video"
            type="number"
            min={0}
            value={data.tiktok_avg_views}
            onChange={set("tiktok_avg_views")}
            placeholder="From Chartmetric overview"
            hint="Used only for the TikTok Viral Signal bonus below — no longer used for ER scoring"
            csvFilled={csvFilled.has("tiktok_avg_views")}
          />
        </div>
        {legacyTtEr && (
          <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
            ⚠ No Chartmetric ER entered — showing legacy calculated ER ({legacyTtEr}) for reference only.
            It is <strong>not</strong> used for scoring; enter the Chartmetric ER above for an accurate TikTok score.
          </p>
        )}
        {p2?.tiktok_er_tier && data.tiktok_followers && (() => {
          const n = tierNote(p2.tiktok_er_tier, "followers", "TikTok");
          return <p className={`mt-2 text-xs ${n.warn ? "text-amber-600" : "text-gray-500"}`}>{n.text}</p>;
        })()}
        {viralSignal && (
          <p className="mt-2 rounded-lg bg-purple-50 px-3 py-2 text-xs font-medium text-purple-700">
            ⚡ TikTok Viral Signal detected: {(viralSignal.avgViews / 1000).toFixed(0)}K avg views on {(viralSignal.followers / 1000).toFixed(0)}K followers — P4 bonus +{viralSignal.bonus.toFixed(1)} will apply
          </p>
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
          <h3 className="text-sm font-semibold uppercase tracking-wider text-[#001489]">YouTube</h3>
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
          <Input
            label="Monthly Audience"
            type="number"
            min={0}
            value={data.youtube_monthly_audience}
            onChange={set("youtube_monthly_audience")}
            placeholder="From Chartmetric YouTube tab"
            hint="Feeds the P4 YouTube Reach bonus (500K+ subscribers with a YouTube score of 1–2)"
            csvFilled={csvFilled.has("youtube_monthly_audience")}
          />
          <Input
            label="Avg Likes per Video"
            type="number"
            min={0}
            value={data.youtube_avg_likes}
            onChange={set("youtube_avg_likes")}
            placeholder="Average Likes per Video from Chartmetric"
            hint="For reference only — not scored"
            csvFilled={csvFilled.has("youtube_avg_likes")}
          />
        </div>
        {p2?.youtube_er_tier && data.youtube_subscribers && (() => {
          const n = tierNote(p2.youtube_er_tier, "subscribers", "YouTube");
          return <p className={`mt-2 text-xs ${n.warn ? "text-amber-600" : "text-gray-500"}`}>{n.text}</p>;
        })()}
        {p2?.youtube_floor_applied && (
          <p className="mt-2 text-xs text-[#001489]">
            Subscriber floor: over {(YOUTUBE_SUBSCRIBER_FLOOR_MIN / 1000).toFixed(0)}K subscribers — YouTube score raised to 2 so it stays in P2
          </p>
        )}
        {reachBonus.bonus > 0 && (
          <p className="mt-2 rounded-lg bg-[#001489]/5 px-3 py-2 text-xs font-medium text-[#001489]">
            YouTube Reach: {(reachBonus.aud / 1_000_000).toFixed(1)}M monthly audience on {(reachBonus.subs / 1_000_000).toFixed(1)}M subscribers — P4 bonus +{reachBonus.bonus.toFixed(2)} will apply
          </p>
        )}
        <p className="mt-2 text-xs text-gray-500">
          Semi-optional: if score is 0–1, YouTube is excluded from the weighted average and its weight is redistributed.
          Channels over 500K subscribers can't score below 2.
        </p>
      </section>
    </div>
  );
}
