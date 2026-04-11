"use client";

import { useState, useCallback, useRef } from "react";
import type { ModelConfig } from "@/lib/model-defaults";
import { REDDIT_GENRE_TIERS, YOUTUBE_GENRE_TIERS, PRICE_GENRE_TIERS } from "@/lib/model-defaults";
import { saveModelConfig, getVersionHistory } from "./actions";
import type { ConfigVersion } from "./actions";

// ─── Shared sub-components ────────────────────────────────────

function NumInput({
  value,
  onChange,
  step = 1,
  min = 0,
  max,
  decimals = 0,
  className = "",
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  decimals?: number;
  className?: string;
}) {
  const [raw, setRaw] = useState<string | null>(null);
  return (
    <input
      type="number"
      value={raw ?? (decimals > 0 ? value.toFixed(decimals) : String(value))}
      step={step}
      min={min}
      max={max}
      onFocus={(e) => setRaw(e.target.value)}
      onChange={(e) => setRaw(e.target.value)}
      onBlur={(e) => {
        const v = parseFloat(e.target.value);
        if (!isNaN(v)) onChange(v);
        setRaw(null);
      }}
      className={`w-full rounded border border-gray-200 bg-white px-2 py-1 text-center text-sm font-mono focus:border-[#1B2A4A] focus:outline-none focus:ring-1 focus:ring-[#1B2A4A]/30 ${className}`}
    />
  );
}

interface SectionProps {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function Section({ title, subtitle, defaultOpen = false, children }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors"
      >
        <div>
          <span className="font-semibold text-[#1B2A4A]">{title}</span>
          {subtitle && (
            <span className="ml-2 text-xs text-gray-400">{subtitle}</span>
          )}
        </div>
        <span className="text-gray-400 text-sm select-none">{open ? "▲" : "▼"}</span>
      </button>
      {open && <div className="border-t border-gray-100 px-5 py-4">{children}</div>}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide text-gray-500">
      {children}
    </th>
  );
}
function ThLeft({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
      {children}
    </th>
  );
}

// ─── Version History Panel ────────────────────────────────────

function VersionHistoryPanel({ onClose, onRestore }: {
  onClose: () => void;
  onRestore: (id: string, config: ModelConfig) => void;
}) {
  const [versions, setVersions] = useState<ConfigVersion[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const vs = await getVersionHistory();
    setVersions(vs);
    setLoading(false);
  }, []);

  // Kick off load on mount
  useState(() => { load(); });

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end bg-black/30" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-lg flex-col bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 bg-[#1B2A4A] px-6 py-4">
          <h2 className="font-semibold text-white">Version History</h2>
          <button onClick={onClose} className="text-white/60 hover:text-white text-xl leading-none">×</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {loading && (
            <p className="py-8 text-center text-sm text-gray-400">Loading…</p>
          )}
          {!loading && versions?.length === 0 && (
            <p className="py-8 text-center text-sm text-gray-400">
              No saved versions yet. Save the model to create the first version.
            </p>
          )}
          {versions && versions.length > 0 && (
            <div className="space-y-2">
              {versions.map((v, i) => (
                <div
                  key={v.id}
                  className="rounded-lg border border-gray-200 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-[#1B2A4A] px-2 py-0.5 text-xs font-bold text-white">
                          v{v.version}
                        </span>
                        {i === 0 && (
                          <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                            Current
                          </span>
                        )}
                      </div>
                      <p className="mt-1.5 text-sm font-medium text-gray-800 truncate">
                        {v.change_summary || "No description"}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-400">
                        {v.changer_name} · {new Date(v.created_at).toLocaleString()}
                      </p>
                    </div>
                    {i > 0 && (
                      <button
                        disabled={restoring === v.id}
                        onClick={async () => {
                          setRestoring(v.id);
                          onRestore(v.id, v.config);
                          setRestoring(null);
                        }}
                        className="shrink-0 rounded border border-gray-200 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 transition disabled:opacity-50"
                      >
                        {restoring === v.id ? "Restoring…" : "Restore"}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────

const AGE_LABELS: Record<number, string> = {
  1: "Very Young (≥70%)",
  2: "Young (55–70%)",
  3: "Mixed (45–55%)",
  4: "Mature (30–45%)",
  5: "Very Mature (<30%)",
};
const TOURING_LABELS: Record<number, string> = {
  1: "Light",
  2: "Moderate",
  3: "Heavy",
  4: "Massive",
};
const P2_METRICS = ["FCR", "FanID", "IG_ER", "Reddit", "MerchSent", "TikTok", "YouTube"];
const GENRE_GROUPS = ["ROCK", "COUNTRY", "PUNK", "POP", "HIPHOP", "EDM", "KPOP", "RBL", "JAM"];
const GENRES = [
  "Rock / Alt / Indie", "Country / Americana", "Metal / Hard Rock", "Pop",
  "Punk / Hardcore / Pop-Punk / Emo", "Southern Rock / Blues Rock",
  "Progressive Rock / Prog Metal", "EDM / Dance / Electronic",
  "Hip-Hop / Rap", "R&B / Soul", "Latin / Regional Mexican",
  "Christian / Gospel / Worship", "Folk / Singer-Songwriter", "Bluegrass / Roots",
  "Jam Band / Jam Rock", "K-Pop / J-Pop / J-Rock", "Reggae / Ska",
  "Jazz / Blues (Traditional)", "Broadway / Theater",
];

export default function ScoringModelTab({ initialConfig }: { initialConfig: ModelConfig }) {
  const [config, setConfig] = useState<ModelConfig>(initialConfig);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const summaryRef = useRef<HTMLInputElement>(null);
  const [showSummaryDialog, setShowSummaryDialog] = useState(false);

  // ── Updaters ──────────────────────────────────────────────

  const setDirty = useCallback(() => setIsDirty(true), []);

  const updateFCR = useCallback((genre: string, idx: number, val: number) => {
    setConfig((prev) => ({
      ...prev,
      fcr_thresholds: {
        ...prev.fcr_thresholds,
        [genre]: prev.fcr_thresholds[genre].map((v, i) => (i === idx ? val : v)) as [number, number, number, number],
      },
    }));
    setDirty();
  }, [setDirty]);

  const updateReddit = useCallback((tier: "HIGH" | "MEDIUM" | "LOW", idx: number, val: number) => {
    setConfig((prev) => ({
      ...prev,
      reddit_thresholds: {
        ...prev.reddit_thresholds,
        [tier]: prev.reddit_thresholds[tier].map((v, i) => (i === idx ? val : v)) as [number, number, number, number],
      },
    }));
    setDirty();
  }, [setDirty]);

  const updateYouTube = useCallback((tier: "HIGH" | "MEDIUM" | "LOW", idx: number, val: number) => {
    setConfig((prev) => ({
      ...prev,
      youtube_thresholds: {
        ...prev.youtube_thresholds,
        [tier]: prev.youtube_thresholds[tier].map((v, i) => (i === idx ? val : v)) as [number, number, number, number],
      },
    }));
    setDirty();
  }, [setDirty]);

  const updatePrice = useCallback((tier: "PREMIUM" | "STANDARD" | "VALUE", idx: number, val: number) => {
    setConfig((prev) => ({
      ...prev,
      price_thresholds: {
        ...prev.price_thresholds,
        [tier]: prev.price_thresholds[tier].map((v, i) => (i === idx ? val : v)) as [number, number, number, number],
      },
    }));
    setDirty();
  }, [setDirty]);

  const updateTierThreshold = useCallback((
    revTier: "PREMIUM" | "HIGH" | "STANDARD" | "LOW",
    key: "priority" | "active" | "watch",
    val: number
  ) => {
    setConfig((prev) => ({
      ...prev,
      tier_thresholds: {
        ...prev.tier_thresholds,
        [revTier]: { ...prev.tier_thresholds[revTier], [key]: val },
      },
    }));
    setDirty();
  }, [setDirty]);

  const updatePillarWeight = useCallback((key: string, idx: number, val: number) => {
    setConfig((prev) => ({
      ...prev,
      pillar_weight_matrix: {
        ...prev.pillar_weight_matrix,
        [key]: prev.pillar_weight_matrix[key].map((v, i) => (i === idx ? val : v)) as [number, number, number, number],
      },
    }));
    setDirty();
  }, [setDirty]);

  const updateP2Weight = useCallback((group: string, idx: number, val: number) => {
    setConfig((prev) => ({
      ...prev,
      p2_sub_weights: {
        ...prev.p2_sub_weights,
        [group]: prev.p2_sub_weights[group].map((v, i) => (i === idx ? val : v)) as [number, number, number, number, number, number, number],
      },
    }));
    setDirty();
  }, [setDirty]);

  const updateReachThreshold = useCallback((idx: number, val: number) => {
    setConfig((prev) => {
      const next = [...prev.audience_reach_thresholds] as [number, number, number, number];
      next[idx] = val;
      return { ...prev, audience_reach_thresholds: next };
    });
    setDirty();
  }, [setDirty]);

  // ── Save ──────────────────────────────────────────────────

  const handleSave = async (summary: string) => {
    setIsSaving(true);
    setSaveError(null);
    const { error } = await saveModelConfig(config, summary);
    setIsSaving(false);
    if (error) {
      setSaveError(error);
      setSaveStatus("error");
    } else {
      setIsDirty(false);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 3000);
    }
    setShowSummaryDialog(false);
  };

  const handleRestoreVersion = (id: string, restoredConfig: ModelConfig) => {
    setConfig(restoredConfig);
    setIsDirty(true);
    setShowHistory(false);
  };

  // ── Render ────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-800">Scoring Parameters</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Expand any section to edit values. Changes are saved as a new version.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {saveStatus === "saved" && (
            <span className="text-sm text-emerald-600 font-medium">✓ Changes saved</span>
          )}
          {saveStatus === "error" && saveError && (
            <span className="text-sm text-red-600">{saveError}</span>
          )}
          <button
            onClick={() => setShowHistory(true)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 transition"
          >
            Version History
          </button>
          <button
            disabled={!isDirty || isSaving}
            onClick={() => setShowSummaryDialog(true)}
            className="rounded-lg bg-[#C0392B] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#a93226] disabled:opacity-40"
          >
            {isSaving ? "Saving…" : "Save Model Changes"}
          </button>
        </div>
      </div>

      {isDirty && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          You have unsaved changes. Click <strong>Save Model Changes</strong> to create a new version.
        </div>
      )}

      {/* ── Section 1: FCR Thresholds ── */}
      <Section
        title="FCR Thresholds by Genre"
        subtitle="19 genres × 4 score breakpoints (as % of Spotify monthly listeners)"
        defaultOpen={false}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <ThLeft>Genre</ThLeft>
                <Th>Score 1→2</Th>
                <Th>Score 2→3</Th>
                <Th>Score 3→4</Th>
                <Th>Score 4→5</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {GENRES.map((genre) => (
                <tr key={genre} className="hover:bg-gray-50">
                  <td className="px-3 py-1.5 text-sm text-gray-700">{genre}</td>
                  {[0, 1, 2, 3].map((idx) => (
                    <td key={idx} className="px-2 py-1 w-20">
                      <NumInput
                        value={config.fcr_thresholds[genre]?.[idx] ?? 0}
                        onChange={(v) => updateFCR(genre, idx, v)}
                        min={0}
                        max={100}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* ── Section 2: Reddit Thresholds ── */}
      <Section
        title="Reddit Thresholds by Genre Tier"
        subtitle="Member count breakpoints per tier — HIGH / MEDIUM / LOW"
      >
        <GenreTierDisplay tiers={REDDIT_GENRE_TIERS} label="Reddit" />
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <ThLeft>Tier</ThLeft>
                <Th>Score 1→2</Th>
                <Th>Score 2→3</Th>
                <Th>Score 3→4</Th>
                <Th>Score 4→5</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {(["HIGH", "MEDIUM", "LOW"] as const).map((tier) => (
                <tr key={tier} className="hover:bg-gray-50">
                  <td className="px-3 py-1.5 font-semibold text-[#1B2A4A]">{tier}</td>
                  {[0, 1, 2, 3].map((idx) => (
                    <td key={idx} className="px-2 py-1 w-24">
                      <NumInput
                        value={config.reddit_thresholds[tier]?.[idx] ?? 0}
                        onChange={(v) => updateReddit(tier, idx, v)}
                        min={0}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* ── Section 3: YouTube Thresholds ── */}
      <Section
        title="YouTube ER Thresholds by Genre Tier"
        subtitle="Engagement rate % breakpoints (avg views ÷ subscribers × 100)"
      >
        <GenreTierDisplay tiers={YOUTUBE_GENRE_TIERS} label="YouTube" />
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <ThLeft>Tier</ThLeft>
                <Th>Score 1→2</Th>
                <Th>Score 2→3</Th>
                <Th>Score 3→4</Th>
                <Th>Score 4→5</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {(["HIGH", "MEDIUM", "LOW"] as const).map((tier) => (
                <tr key={tier} className="hover:bg-gray-50">
                  <td className="px-3 py-1.5 font-semibold text-[#1B2A4A]">{tier}</td>
                  {[0, 1, 2, 3].map((idx) => (
                    <td key={idx} className="px-2 py-1 w-24">
                      <NumInput
                        value={config.youtube_thresholds[tier]?.[idx] ?? 0}
                        onChange={(v) => updateYouTube(tier, idx, v)}
                        min={0}
                        step={0.25}
                        decimals={2}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* ── Section 4: Price Point Thresholds ── */}
      <Section
        title="Price Point Tiers by Genre Pricing Group"
        subtitle="Highest non-music item price ($) breakpoints per pricing group"
      >
        <GenreTierDisplay tiers={PRICE_GENRE_TIERS} label="Price" />
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <ThLeft>Group</ThLeft>
                <Th>Score 1→2 ($)</Th>
                <Th>Score 2→3 ($)</Th>
                <Th>Score 3→4 ($)</Th>
                <Th>Score 4→5 ($)</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {(["PREMIUM", "STANDARD", "VALUE"] as const).map((tier) => (
                <tr key={tier} className="hover:bg-gray-50">
                  <td className="px-3 py-1.5 font-semibold text-[#1B2A4A]">{tier}</td>
                  {[0, 1, 2, 3].map((idx) => (
                    <td key={idx} className="px-2 py-1 w-24">
                      <NumInput
                        value={config.price_thresholds[tier]?.[idx] ?? 0}
                        onChange={(v) => updatePrice(tier, idx, v)}
                        min={0}
                        step={5}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* ── Section 5: Revenue Tier Thresholds ── */}
      <Section
        title="Revenue Tiers"
        subtitle="Minimum total score required for each action tier, by revenue classification"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <ThLeft>Revenue Group</ThLeft>
                <Th>Priority (≥)</Th>
                <Th>Active (≥)</Th>
                <Th>Watch (≥)</Th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Below (&lt;Watch)
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {(["PREMIUM", "HIGH", "STANDARD", "LOW"] as const).map((rt) => (
                <tr key={rt} className="hover:bg-gray-50">
                  <td className="px-3 py-1.5 font-semibold text-[#1B2A4A]">{rt}</td>
                  {(["priority", "active", "watch"] as const).map((key) => (
                    <td key={key} className="px-2 py-1 w-24">
                      <NumInput
                        value={config.tier_thresholds[rt]?.[key] ?? 0}
                        onChange={(v) => updateTierThreshold(rt, key, v)}
                        min={0}
                        max={5}
                        step={0.1}
                        decimals={1}
                      />
                    </td>
                  ))}
                  <td className="px-3 py-1.5 text-xs text-gray-400 italic">
                    &lt; {config.tier_thresholds[rt]?.watch}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-gray-400">
          Revenue group is assigned per genre: PREMIUM = K-Pop/J-Pop, HIGH = Punk/Hardcore, LOW = R&B/Latin/Reggae/Jazz, STANDARD = all others.
        </p>
      </Section>

      {/* ── Section 6: Pillar Weight Matrix ── */}
      <Section
        title="Pillar Weight Matrix"
        subtitle="20 cells (5 age brackets × 4 touring levels) — values are percentages, must sum to 100"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <ThLeft>Age Bracket</ThLeft>
                <ThLeft>Touring Level</ThLeft>
                <Th>P1 Touring (%)</Th>
                <Th>P2 Fan Eng (%)</Th>
                <Th>P3 E-Comm (%)</Th>
                <Th>P4 Growth (%)</Th>
                <Th>Sum</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {[1, 2, 3, 4, 5].map((age) =>
                [1, 2, 3, 4].map((tour) => {
                  const key = `${age}_${tour}`;
                  const weights = config.pillar_weight_matrix[key] ?? [0, 0, 0, 0];
                  const sum = weights.reduce((a, b) => a + b, 0);
                  return (
                    <tr key={key} className="hover:bg-gray-50">
                      <td className="px-3 py-1.5 text-xs text-gray-600">{AGE_LABELS[age]}</td>
                      <td className="px-3 py-1.5 text-xs text-gray-600">{TOURING_LABELS[tour]}</td>
                      {[0, 1, 2, 3].map((idx) => (
                        <td key={idx} className="px-2 py-1 w-20">
                          <NumInput
                            value={weights[idx]}
                            onChange={(v) => updatePillarWeight(key, idx, v)}
                            min={0}
                            max={100}
                          />
                        </td>
                      ))}
                      <td className={`px-3 py-1.5 text-center text-xs font-semibold ${
                        Math.abs(sum - 100) < 0.01 ? "text-emerald-600" : "text-red-600"
                      }`}>
                        {sum}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Section>

      {/* ── Section 7: P2 Sub-Weight Profiles ── */}
      <Section
        title="Genre P2 Sub-Weight Profiles"
        subtitle="9 genre groups × 7 platform metrics — values are decimals (must sum to 1.0)"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <ThLeft>Genre Group</ThLeft>
                {P2_METRICS.map((m) => <Th key={m}>{m}</Th>)}
                <Th>Sum</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {GENRE_GROUPS.map((group) => {
                const weights = config.p2_sub_weights[group] ?? [0, 0, 0, 0, 0, 0, 0];
                const sum = weights.reduce((a, b) => a + b, 0);
                return (
                  <tr key={group} className="hover:bg-gray-50">
                    <td className="px-3 py-1.5 font-semibold text-[#1B2A4A]">{group}</td>
                    {[0, 1, 2, 3, 4, 5, 6].map((idx) => (
                      <td key={idx} className="px-1 py-1 w-16">
                        <NumInput
                          value={weights[idx]}
                          onChange={(v) => updateP2Weight(group, idx, v)}
                          min={0}
                          max={1}
                          step={0.01}
                          decimals={2}
                        />
                      </td>
                    ))}
                    <td className={`px-3 py-1.5 text-center text-xs font-semibold ${
                      Math.abs(sum - 1) < 0.005 ? "text-emerald-600" : "text-red-600"
                    }`}>
                      {sum.toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      {/* ── Section 8: Audience Reach Thresholds ── */}
      <Section
        title="Total Audience Reach Thresholds"
        subtitle="Capacity × Dates × Sell-Through% breakpoints separating scores 1–5"
        defaultOpen={false}
      >
        <div className="max-w-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <ThLeft>Transition</ThLeft>
                <Th>Audience Size</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {[
                "Score 1 → Score 2",
                "Score 2 → Score 3",
                "Score 3 → Score 4",
                "Score 4 → Score 5",
              ].map((label, idx) => (
                <tr key={idx} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-700">{label}</td>
                  <td className="px-2 py-1 w-32">
                    <NumInput
                      value={config.audience_reach_thresholds[idx]}
                      onChange={(v) => updateReachThreshold(idx, v)}
                      min={0}
                      step={1000}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Change summary dialog */}
      {showSummaryDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
            <h3 className="mb-3 text-base font-semibold text-[#1B2A4A]">Save Model Changes</h3>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Change summary <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <input
              ref={summaryRef}
              type="text"
              autoFocus
              placeholder="e.g. Adjusted FCR thresholds for Pop genre"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#1B2A4A] focus:outline-none focus:ring-2 focus:ring-[#1B2A4A]/20"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setShowSummaryDialog(false)}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleSave(summaryRef.current?.value ?? "")}
                className="rounded-lg bg-[#C0392B] px-4 py-2 text-sm font-semibold text-white hover:bg-[#a93226]"
              >
                Save Version
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Version history panel */}
      {showHistory && (
        <VersionHistoryPanel
          onClose={() => setShowHistory(false)}
          onRestore={handleRestoreVersion}
        />
      )}
    </div>
  );
}

// ─── Genre-tier display helper ────────────────────────────────

function GenreTierDisplay({
  tiers,
  label,
}: {
  tiers: Record<string, string>;
  label: string;
}) {
  const grouped = Object.entries(tiers).reduce<Record<string, string[]>>(
    (acc, [genre, tier]) => {
      acc[tier] = acc[tier] ?? [];
      acc[tier].push(genre);
      return acc;
    },
    {}
  );

  return (
    <div className="rounded-lg bg-gray-50 p-3 text-xs">
      <p className="mb-2 font-semibold text-gray-500 uppercase tracking-wide">
        Genre → Tier assignments for {label}
      </p>
      <div className="flex flex-wrap gap-3">
        {Object.entries(grouped).map(([tier, genres]) => (
          <div key={tier}>
            <span className="font-semibold text-[#1B2A4A]">{tier}: </span>
            <span className="text-gray-600">{genres.join(", ")}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
