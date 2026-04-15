"use client";

import { useMemo } from "react";
import { Input, ScoreSelector, ScoreBadge } from "../ui";
import type { EvalFormData, StepProps } from "../types";
import { buildScoringInputs } from "../types";
import { calculateScore } from "@/lib/scoring-engine";

function discordBonusLabel(members: string): string {
  const m = parseFloat(members) || 0;
  if (m === 0)      return "+0.00 bonus";
  if (m < 500)      return "+0.05 bonus";
  if (m < 2_000)    return "+0.10 bonus";
  if (m < 8_000)    return "+0.15 bonus";
  if (m < 25_000)   return "+0.20 bonus";
  return "+0.30 bonus";
}

export default function Step7Community({ data, onChange, errors }: StepProps) {
  const set = (key: keyof EvalFormData) =>
    (e: React.ChangeEvent<HTMLInputElement>) => onChange({ [key]: e.target.value });

  const { p2, p4 } = useMemo(() => {
    const inputs = buildScoringInputs(data);
    if (!inputs || !data.genre) return { p2: null, p4: null };
    try {
      const r = calculateScore(inputs);
      return { p2: r.p2, p4: r.p4 };
    } catch { return { p2: null, p4: null }; }
  }, [data]);

  return (
    <div className="space-y-6">
      {/* Reddit */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-[#1B2A4A]">Reddit</h3>
          <ScoreBadge score={p2?.sub_scores.Reddit ?? null} />
        </div>
        <Input
          label="Weekly Visitors (subreddit)"
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
          label="Member Count"
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

      {/* Fan Identity */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-[#1B2A4A]">Fan Identity Signaling</h3>
            <p className="mt-0.5 text-xs text-gray-500">How strong is the artist's fan community and tribal identity?</p>
          </div>
          <ScoreBadge score={p2?.sub_scores.FanID ?? null} size="md" />
        </div>
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
      </section>

      {/* Merch Sentiment */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-[#1B2A4A]">Merch-Specific Sentiment</h3>
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

      {/* Press / Blog Coverage */}
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

      {/* P2 Live Preview */}
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
                  +{(p2.bonus ?? 0).toFixed(2)} Discord bonus
                </span>
              )}
            </span>
            <span className="text-lg font-bold text-[#1B2A4A]">{p2.final_score.toFixed(2)}</span>
          </div>
        </section>
      )}
    </div>
  );
}
