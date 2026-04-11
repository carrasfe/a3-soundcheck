"use client";

import { useMemo } from "react";
import { Input, ScoreSelector, ScoreBadge } from "../ui";
import type { EvalFormData, StepProps } from "../types";
import { buildScoringInputs } from "../types";
import { calculateScore } from "@/lib/scoring-engine";

const DISCORD_BONUS: Record<string, string> = {
  "0": "+0.00", "<500": "+0.05", "<2K": "+0.10", "<8K": "+0.15", "<25K": "+0.20", "25K+": "+0.30",
};

function discordBonusLabel(members: string): string {
  const m = parseFloat(members) || 0;
  if (m === 0) return "+0.00 bonus";
  if (m < 500)   return "+0.05 bonus";
  if (m < 2_000) return "+0.10 bonus";
  if (m < 8_000) return "+0.15 bonus";
  if (m < 25_000) return "+0.20 bonus";
  return "+0.30 bonus";
}

export default function Step4FanEngagement({ data, onChange, csvFilled, errors }: StepProps) {
  const set = (key: keyof EvalFormData) =>
    (e: React.ChangeEvent<HTMLInputElement>) => onChange({ [key]: e.target.value });

  // Real-time P2 scores
  const p2 = useMemo(() => {
    const inputs = buildScoringInputs(data);
    if (!inputs || !data.genre) return null;
    try { return calculateScore(inputs).p2; } catch { return null; }
  }, [data]);

  // TikTok ER live preview
  const ttEr = useMemo(() => {
    const f = parseFloat(data.tiktok_followers) || 0;
    const v = parseFloat(data.tiktok_avg_views)  || 0;
    if (!f || !v) return null;
    return ((v / f) * 100).toFixed(2) + "%";
  }, [data.tiktok_followers, data.tiktok_avg_views]);

  // YT ER live preview
  const ytEr = useMemo(() => {
    const s = parseFloat(data.youtube_subscribers) || 0;
    const v = parseFloat(data.youtube_avg_views)   || 0;
    if (!s || !v) return null;
    return ((v / s) * 100).toFixed(2) + "%";
  }, [data.youtube_subscribers, data.youtube_avg_views]);

  return (
    <div className="space-y-6">
      {/* Spotify */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[#1B2A4A]">Spotify</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex items-end gap-3">
            <div className="flex-1">
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
            </div>
          </div>
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
              <ScoreBadge score={p2?.sub_scores.FCR ?? null} />
            </div>
          </div>
        </div>
      </section>

      {/* Fan Identity */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-[#1B2A4A]">
              Fan Identity Signaling
            </h3>
            <p className="mt-0.5 text-xs text-gray-500">How strong is the artist's fan community and tribal identity?</p>
          </div>
          <ScoreBadge score={p2?.sub_scores.FanID ?? null} size="md" />
        </div>
        <div className="mt-4">
          <ScoreSelector
            label=""
            required
            value={data.p2_fan_identity}
            onChange={(v) => onChange({ p2_fan_identity: v })}
            descriptions={[
              "1 — No fan culture to speak of",
              "2 — Basic fandom (casual listeners, no rituals)",
              "3 — Emerging identity (growing fandom, some community)",
              "4 — Strong identity (dedicated fanbase, merch culture)",
              "5 — Deep tribal identity (cult following, fan-named, rituals)",
            ]}
            error={errors.p2_fan_identity}
          />
        </div>
      </section>

      {/* Instagram */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-[#1B2A4A]">Instagram</h3>
          <ScoreBadge score={p2?.sub_scores.IG_ER ?? null} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Followers"
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
            label="Engagement Rate %"
            type="number"
            min={0}
            value={data.ig_er_pct}
            onChange={set("ig_er_pct")}
            placeholder="e.g. 3.2"
            hint="Enter as 3.2, not 0.032"
          />
        </div>
        {parseFloat(data.ig_followers) < 10_000 && data.ig_followers && (
          <p className="mt-2 text-xs text-[#C0392B]">⚠ Under 10K followers — IG score capped at 1</p>
        )}
        {parseFloat(data.ig_followers) >= 10_000 && parseFloat(data.ig_followers) < 50_000 && (
          <p className="mt-2 text-xs text-gray-500">⚠ 10–50K followers — IG score capped at 3</p>
        )}
      </section>

      {/* Reddit */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-[#1B2A4A]">Reddit</h3>
          <ScoreBadge score={p2?.sub_scores.Reddit ?? null} />
        </div>
        <Input
          label="Subreddit Members"
          required
          type="number"
          min={0}
          value={data.reddit_members}
          onChange={set("reddit_members")}
          placeholder="e.g. 5000"
          hint="Total members in dedicated subreddit (0 if none exists)"
          error={errors.reddit_members}
        />
      </section>

      {/* Discord */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-[#1B2A4A]">Discord</h3>
          <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
            {data.discord_members ? discordBonusLabel(data.discord_members) : "Bonus metric"}
          </span>
        </div>
        <Input
          label="Server Members"
          type="number"
          min={0}
          value={data.discord_members}
          onChange={set("discord_members")}
          placeholder="e.g. 2500"
          hint="Total Discord server members (0 or leave blank if none)"
        />
        <p className="mt-2 text-xs text-gray-500">
          Discord is a bonus-only metric — it adds to the P2 score but doesn't replace any weight.
        </p>
      </section>

      {/* Merch Sentiment */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-[#1B2A4A]">Merch Sentiment</h3>
          <ScoreBadge score={p2?.sub_scores.MerchSent ?? null} />
        </div>
        <ScoreSelector
          label="Online Merch Sentiment"
          required
          value={data.merch_sentiment}
          onChange={(v) => onChange({ merch_sentiment: v })}
          descriptions={[
            "1 — Negative or absent sentiment",
            "2 — Neutral / no strong opinions",
            "3 — Generally positive",
            "4 — Enthusiastic, fans proud to wear",
            "5 — Highly coveted, drops generate demand",
          ]}
          error={errors.merch_sentiment}
        />
      </section>

      {/* TikTok */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-[#1B2A4A]">TikTok</h3>
          <ScoreBadge score={p2?.sub_scores.TikTok ?? null} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Followers"
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
              label="Average Views per Video"
              type="number"
              min={0}
              value={data.tiktok_avg_views}
              onChange={set("tiktok_avg_views")}
              placeholder="e.g. 8500"
            />
            {ttEr && (
              <p className="mt-1 text-xs text-gray-500">Calculated ER: <span className="font-semibold text-[#1B2A4A]">{ttEr}</span></p>
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
            Age-adjusted TikTok weight: <span className="font-medium">{(p2.tiktok_age_adjusted_weight * 100).toFixed(1)}%</span>
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
            label="Subscribers"
            required
            type="number"
            min={0}
            value={data.youtube_subscribers}
            onChange={set("youtube_subscribers")}
            placeholder="e.g. 80000"
            error={errors.youtube_subscribers}
            csvFilled={csvFilled.has("youtube_subscribers")}
          />
          <div>
            <Input
              label="Average Views per Video"
              type="number"
              min={0}
              value={data.youtube_avg_views}
              onChange={set("youtube_avg_views")}
              placeholder="e.g. 2400"
            />
            {ytEr && (
              <p className="mt-1 text-xs text-gray-500">Calculated ER: <span className="font-semibold text-[#1B2A4A]">{ytEr}</span></p>
            )}
          </div>
        </div>
        <p className="mt-2 text-xs text-gray-500">
          Semi-optional: if score is 0–1, YouTube is excluded from the weighted average and its weight is redistributed.
        </p>
      </section>

      {/* P2 live summary */}
      {p2 && (
        <section className="rounded-xl border border-[#1B2A4A]/20 bg-[#1B2A4A]/5 p-6">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[#1B2A4A]">
            P2 Live Preview
          </h3>
          <div className="grid grid-cols-4 gap-2 text-sm sm:grid-cols-7">
            {Object.entries(p2.sub_scores).map(([k, v]) => (
              <div key={k} className="text-center">
                <p className="truncate text-xs text-gray-500">{k}</p>
                <ScoreBadge score={v} size="md" />
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-[#1B2A4A]/10 pt-3">
            <span className="text-sm font-medium text-gray-600">
              Weighted P2 Score
              {(p2.bonus ?? 0) > 0 && (
                <span className="ml-1 text-xs text-emerald-600">
                  +{(p2.bonus ?? 0).toFixed(2)} bonus
                </span>
              )}
            </span>
            <span className="text-lg font-bold text-[#1B2A4A]">
              {p2.final_score.toFixed(2)}
            </span>
          </div>
        </section>
      )}
    </div>
  );
}
