"use client";

import { useMemo } from "react";
import { Select, ScoreSelector, ScoreBadge } from "../ui";
import type { StepProps } from "../types";
import { buildScoringInputs } from "../types";
import { calculateScore } from "@/lib/scoring-engine";

const MERCH_RANGE_OPTIONS = [
  { value: "1", label: "1 — Music only (vinyl / CDs, no apparel)" },
  { value: "2", label: "2 — Music + 1–2 basic apparel items" },
  { value: "3", label: "3 — Music + multiple apparel (tees, hoodie, hat, accessories)" },
  { value: "4", label: "4 — Full apparel range + music" },
  { value: "5", label: "5 — Full store with high-priced items and seasonal drops" },
];

const D2C_DESCRIPTIONS = [
  "1 — No email or SMS list",
  "2 — Basic email list",
  "3 — Email + SMS",
  "4 — Email + SMS + fan club or Patreon",
];

const STORE_DESCRIPTIONS = [
  "1 — Non-existent or very basic (Linktree to third-party)",
  "2 — Functional but generic (basic Shopify, no brand identity)",
  "3 — Solid store with some brand elements",
  "4 — Well-branded, easy to navigate, good UX",
  "5 — Exceptional — premium feel, seasonal, storytelling",
];

export default function Step5Ecommerce({ data, onChange, errors }: StepProps) {
  const p3 = useMemo(() => {
    const inputs = buildScoringInputs(data);
    if (!inputs || !data.genre) return null;
    try { return calculateScore(inputs).p3; } catch { return null; }
  }, [data]);

  const genreGroup = useMemo(() => {
    if (!data.genre) return null;
    const PREMIUM = ["Pop", "Hip-Hop / Rap", "K-Pop / J-Pop / J-Rock", "EDM / Dance / Electronic", "Broadway / Theater"];
    const VALUE   = ["Punk / Hardcore / Pop-Punk / Emo", "Reggae / Ska", "Jazz / Blues (Traditional)"];
    if (PREMIUM.includes(data.genre)) return "PREMIUM";
    if (VALUE.includes(data.genre))   return "VALUE";
    return "STANDARD";
  }, [data.genre]);

  const priceTierHint: Record<string, string> = {
    PREMIUM:  "Thresholds: <$30 / <$50 / <$70 / <$100 / $100+",
    STANDARD: "Thresholds: <$25 / <$40 / <$60 / <$80 / $100+",
    VALUE:    "Thresholds: <$20 / <$30 / <$50 / <$65 / $80+",
  };

  return (
    <div className="space-y-6">
      {/* Store Quality */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-[#1B2A4A]">Store Quality</h3>
            <p className="text-xs text-gray-500">35% weight</p>
          </div>
          <ScoreBadge score={p3?.sub_scores.store_quality ?? null} />
        </div>
        <ScoreSelector
          label="Overall store quality rating"
          required
          value={data.store_quality}
          onChange={(v) => onChange({ store_quality: v })}
          descriptions={STORE_DESCRIPTIONS}
          error={errors.store_quality}
        />
      </section>

      {/* Merch Range */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-[#1B2A4A]">Merch Range</h3>
            <p className="text-xs text-gray-500">30% weight</p>
          </div>
          <ScoreBadge score={p3?.sub_scores.merch_range ?? null} />
        </div>
        <Select
          label="Merch assortment breadth"
          required
          value={data.merch_range}
          onChange={(e) => onChange({ merch_range: e.target.value })}
          error={errors.merch_range}
        >
          <option value="">Select…</option>
          {MERCH_RANGE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </Select>
      </section>

      {/* Price Point */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-[#1B2A4A]">Price Point</h3>
            <p className="text-xs text-gray-500">25% weight</p>
          </div>
          <ScoreBadge score={p3?.sub_scores.price_point ?? null} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">
            Highest-priced non-music item ($)
          </label>
          <div className="relative max-w-xs">
            <span className="pointer-events-none absolute left-3 top-2.5 text-gray-400">$</span>
            <input
              type="number"
              min={0}
              value={data.price_point_highest}
              onChange={(e) => onChange({ price_point_highest: e.target.value })}
              placeholder="e.g. 65"
              className="w-full rounded-md border border-gray-300 py-2 pl-7 pr-3 text-sm outline-none transition focus:border-[#C0392B] focus:ring-1 focus:ring-[#C0392B]"
            />
          </div>
          {genreGroup && (
            <p className="text-xs text-gray-400">
              Genre tier: <span className="font-medium text-gray-600">{genreGroup}</span> — {priceTierHint[genreGroup]}
            </p>
          )}
        </div>
      </section>

      {/* D2C Infrastructure */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-[#1B2A4A]">D2C Infrastructure</h3>
            <p className="text-xs text-gray-500">10% weight</p>
          </div>
          <ScoreBadge score={p3?.sub_scores.d2c ?? null} />
        </div>
        <ScoreSelector
          label="Direct-to-consumer capabilities"
          required
          value={data.d2c_level}
          onChange={(v) => onChange({ d2c_level: v })}
          descriptions={D2C_DESCRIPTIONS}
          max={4}
          error={errors.d2c_level}
        />
      </section>

      {/* P3 Summary */}
      {p3 && (
        <section className="rounded-xl border border-[#1B2A4A]/20 bg-[#1B2A4A]/5 p-6">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[#1B2A4A]">P3 Live Preview</h3>
          <div className="grid grid-cols-4 gap-3 text-sm">
            {[
              { label: "Store Quality", score: p3.sub_scores.store_quality, weight: "35%" },
              { label: "Merch Range",   score: p3.sub_scores.merch_range,   weight: "30%" },
              { label: "Price Point",   score: p3.sub_scores.price_point,   weight: "25%" },
              { label: "D2C",           score: p3.sub_scores.d2c,           weight: "10%" },
            ].map(({ label, score, weight }) => (
              <div key={label} className="text-center">
                <p className="text-xs text-gray-500">{label}</p>
                <ScoreBadge score={score} size="md" />
                <p className="mt-0.5 text-xs text-gray-400">{weight}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-[#1B2A4A]/10 pt-3">
            <span className="text-sm font-medium text-gray-600">P3 Score</span>
            <span className="text-lg font-bold text-[#1B2A4A]">{p3.final_score.toFixed(2)}</span>
          </div>
        </section>
      )}
    </div>
  );
}
