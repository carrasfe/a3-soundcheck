"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import type { EvalFormData } from "../types";
import {
  readFileText, parseCSV, detectCSVType,
  extractMultiCSV, applyERDisambiguation,
  CSV_TYPE_INFO,
} from "./parser";
import type { CSVType, MultiCSVExtract, ERTrendsEntry } from "./parser";

interface Props {
  onApply: (values: Partial<EvalFormData>) => void;
  onClose: () => void;
}

type ModalStep = "upload" | "disambiguate" | "confirm";

// ─── Field meta for confirm screen ───────────────────────────

type FieldEntry =
  | { kind: "single"; key: keyof EvalFormData; label: string; unit?: string }
  | { kind: "pair"; mKey: keyof EvalFormData; fKey: keyof EvalFormData; label: string };

interface FieldGroup {
  group: string;
  fields: FieldEntry[];
}

const FIELD_GROUPS: FieldGroup[] = [
  {
    group: "Step 2 — Demographics",
    fields: [
      { kind: "pair", mKey: "d_13_17_m", fKey: "d_13_17_f", label: "Age 13–17" },
      { kind: "pair", mKey: "d_18_24_m", fKey: "d_18_24_f", label: "Age 18–24" },
      { kind: "pair", mKey: "d_25_34_m", fKey: "d_25_34_f", label: "Age 25–34" },
      { kind: "pair", mKey: "d_35_44_m", fKey: "d_35_44_f", label: "Age 35–44" },
      { kind: "pair", mKey: "d_45_64_m", fKey: "d_45_64_f", label: "Age 45–64" },
      { kind: "pair", mKey: "d_65_m",    fKey: "d_65_f",    label: "Age 65+" },
      { kind: "single", key: "eth_white",    label: "White / Caucasian",  unit: "%" },
      { kind: "single", key: "eth_aa",       label: "African American",   unit: "%" },
      { kind: "single", key: "eth_hispanic", label: "Hispanic / Latino",  unit: "%" },
      { kind: "single", key: "eth_asian",    label: "Asian",              unit: "%" },
    ],
  },
  {
    group: "Step 4 — Fan Engagement",
    fields: [
      { kind: "single", key: "spotify_monthly_listeners", label: "Spotify Monthly Listeners" },
      { kind: "single", key: "fan_concentration_ratio",   label: "Fan Concentration Ratio", unit: "%" },
      { kind: "single", key: "ig_followers",              label: "Instagram Followers" },
      { kind: "single", key: "ig_er_pct",                 label: "Instagram ER", unit: "%" },
      { kind: "single", key: "tiktok_followers",          label: "TikTok Followers" },
      { kind: "single", key: "tiktok_avg_views",          label: "TikTok Avg Views" },
      { kind: "single", key: "youtube_subscribers",       label: "YouTube Subscribers" },
      { kind: "single", key: "youtube_er_pct",            label: "YouTube ER", unit: "%" },
    ],
  },
  {
    group: "Step 6 — Growth",
    fields: [
      { kind: "single", key: "spotify_yoy_pct",  label: "Spotify YoY Change", unit: "%" },
      { kind: "single", key: "ig_30day_gain",    label: "IG 30-Day Gain" },
      { kind: "single", key: "playlist_score",   label: "Playlist Score (1–5)" },
    ],
  },
];

// ─── Platform colour helpers ──────────────────────────────────

const PLATFORM_COLOR: Record<string, string> = {
  spotify:   "bg-green-100 text-green-800",
  instagram: "bg-pink-100 text-pink-800",
  tiktok:    "bg-slate-100 text-slate-800",
  youtube:   "bg-red-100 text-red-800",
  all:       "bg-blue-100 text-blue-800",
  legacy:    "bg-gray-100 text-gray-600",
};

const PLATFORM_LABEL: Record<string, string> = {
  spotify: "Spotify", instagram: "Instagram", tiktok: "TikTok",
  youtube: "YouTube", all: "All", legacy: "Legacy",
};

// ─── Accepted types list for upload step ─────────────────────

const ACCEPTED_TYPES: Array<Exclude<CSVType, "unknown">> = [
  "spotify_listeners_trends",
  "spotify_fcr_trends",
  "spotify_playlist_evolution",
  "spotify_followers_trends",
  "ig_followers_trends",
  "er_trends",
  "tiktok_followers_trends",
  "tiktok_avg_views_trends",
  "youtube_subscribers_trends",
  "demographics",
  "engagement",
];

// ─── Filename truncation ──────────────────────────────────────

function shortName(name: string, max = 36): string {
  if (name.length <= max) return name;
  return name.slice(0, max - 3) + "…";
}

// ─── Main component ───────────────────────────────────────────

export default function ChartmetricImportModal({ onApply, onClose }: Props) {
  const [modalStep, setModalStep] = useState<ModalStep>("upload");
  const [isDragging, setIsDragging] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [extract, setExtract] = useState<MultiCSVExtract | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processError, setProcessError] = useState<string | null>(null);

  // erAssignments: file.name → "ig" | "youtube" | ""
  const [erAssignments, setErAssignments] = useState<Record<string, "ig" | "youtube" | "">>({});

  // Re-process whenever files change
  useEffect(() => {
    if (!uploadedFiles.length) { setExtract(null); return; }
    setIsProcessing(true);
    setProcessError(null);
    extractMultiCSV(uploadedFiles)
      .then((result) => {
        setExtract(result);
        // Seed erAssignments from auto-resolved platforms
        const initial: Record<string, "ig" | "youtube" | ""> = {};
        for (const entry of result.erTrends) {
          initial[entry.file.name] = entry.resolvedPlatform ?? "";
        }
        setErAssignments(initial);
      })
      .catch(() => setProcessError("Failed to parse one or more files."))
      .finally(() => setIsProcessing(false));
  }, [uploadedFiles]);

  const addFiles = useCallback((incoming: File[]) => {
    setUploadedFiles((prev) => {
      const combined = [...prev];
      for (const f of incoming) {
        if (!f.name.toLowerCase().endsWith(".csv")) continue;
        if (!combined.find((e) => e.name === f.name)) combined.push(f);
      }
      return combined.slice(0, 12);
    });
  }, []);

  const removeFile = (name: string) => {
    setUploadedFiles((prev) => prev.filter((f) => f.name !== name));
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    addFiles(Array.from(e.dataTransfer.files));
  }, [addFiles]);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(Array.from(e.target.files));
    e.target.value = "";
  };

  // Detected type for each file (sync, filename-only pass for UI)
  const fileTypeMap = useMemo(() => {
    const map: Record<string, CSVType> = {};
    for (const f of uploadedFiles) {
      map[f.name] = detectCSVType([], f.name);
    }
    // Override with parser's accurate detection if available
    if (extract) {
      for (const [type, entry] of Object.entries(extract.detected)) {
        if (entry) map[(entry as { file: File }).file.name] = type as CSVType;
      }
      for (const entry of extract.erTrends) {
        map[entry.file.name] = "er_trends";
      }
    }
    return map;
  }, [uploadedFiles, extract]);

  // Final fields after applying ER disambiguation
  const { finalFields, finalSources, totalFound } = useMemo(() => {
    if (!extract) return { finalFields: {}, finalSources: {}, totalFound: 0 };

    const resolvedER: ERTrendsEntry[] = extract.erTrends.map((e) => ({
      ...e,
      resolvedPlatform: (erAssignments[e.file.name] as "ig" | "youtube" | null) || e.resolvedPlatform,
    }));

    const { fields, fieldSources } = applyERDisambiguation(
      resolvedER,
      extract.fields,
      extract.fieldSources,
    );

    // Count all filled fields (including demographics pairs)
    let count = 0;
    for (const group of FIELD_GROUPS) {
      for (const fe of group.fields) {
        if (fe.kind === "single") {
          if (fields[fe.key] !== undefined && fields[fe.key] !== "") count++;
        } else {
          if (fields[fe.mKey] !== undefined && fields[fe.mKey] !== "") count++;
          if (fields[fe.fKey] !== undefined && fields[fe.fKey] !== "") count++;
        }
      }
    }

    return { finalFields: fields, finalSources: fieldSources, totalFound: count };
  }, [extract, erAssignments]);

  // Total possible fields (for "X of Y" display)
  const totalPossible = useMemo(() => {
    let n = 0;
    for (const g of FIELD_GROUPS) {
      for (const fe of g.fields) {
        n += fe.kind === "pair" ? 2 : 1;
      }
    }
    return n;
  }, []);

  const needsDisambiguation = extract?.needsDisambiguation ?? false;
  const unresolvedCount = extract?.erTrends.filter((e) => !erAssignments[e.file.name]).length ?? 0;

  const handleNext = () => {
    if (needsDisambiguation) {
      setModalStep("disambiguate");
    } else {
      setModalStep("confirm");
    }
  };

  const handleApply = () => {
    const nonEmpty = Object.fromEntries(
      Object.entries(finalFields).filter(([, v]) => v !== "" && v !== null && v !== undefined)
    ) as Partial<EvalFormData>;
    onApply(nonEmpty);
    onClose();
  };

  const STEPS: ModalStep[] = ["upload", "disambiguate", "confirm"];
  const STEP_LABELS = ["Upload", "Assign ER", "Confirm"];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" style={{ maxHeight: "90vh" }}>
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between bg-[#1B2A4A] px-6 py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-white/50">Chartmetric Import</p>
            <h2 className="text-base font-semibold text-white">Import Platform Data CSVs</h2>
          </div>
          <button onClick={onClose} className="text-xl leading-none text-white/60 hover:text-white">×</button>
        </div>

        {/* Step tabs */}
        <div className="flex shrink-0 gap-6 border-b border-gray-100 px-6 text-xs">
          {STEPS.map((s, i) => {
            const isActive = modalStep === s;
            const isDisabled = s === "disambiguate" && !needsDisambiguation;
            return (
              <button
                key={s}
                onClick={() => {
                  if (!isDisabled && extract) setModalStep(s);
                }}
                disabled={isDisabled || !extract}
                className={`border-b-2 py-3 font-medium transition ${
                  isActive
                    ? "border-[#C0392B] text-[#C0392B]"
                    : isDisabled
                    ? "cursor-default border-transparent text-gray-300"
                    : "border-transparent text-gray-400 hover:text-gray-600"
                }`}
              >
                {i + 1}. {STEP_LABELS[i]}
                {s === "disambiguate" && needsDisambiguation && unresolvedCount > 0 && (
                  <span className="ml-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[9px] font-bold text-white">
                    {unresolvedCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* ─── Upload step ─────────────────────────────────── */}
          {modalStep === "upload" && (
            <div className="space-y-5">
              <p className="text-sm text-gray-600">
                Drop up to 12 Chartmetric CSVs. Files are auto-detected by filename and column headers.
                If you upload Engagement Rate files for both Instagram and YouTube, you&apos;ll assign them in the next step.
              </p>

              {/* Drop zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={onDrop}
                className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-8 transition ${
                  isDragging ? "border-[#C0392B] bg-red-50" : "border-gray-300 bg-gray-50 hover:border-gray-400"
                }`}
              >
                <div className="mb-2 text-3xl">📁</div>
                <p className="text-sm font-medium text-gray-700">Drop CSV files here (up to 12)</p>
                <label className="mt-3 cursor-pointer rounded-lg bg-[#1B2A4A] px-4 py-1.5 text-sm font-medium text-white hover:bg-[#1B2A4A]/90">
                  Browse files
                  <input type="file" accept=".csv" multiple className="hidden" onChange={onFileChange} />
                </label>
              </div>

              {/* Uploaded file list */}
              {uploadedFiles.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Uploaded ({uploadedFiles.length})
                  </p>
                  {uploadedFiles.map((f) => {
                    const detectedType = fileTypeMap[f.name] ?? "unknown";
                    const info = detectedType !== "unknown" ? CSV_TYPE_INFO[detectedType as Exclude<CSVType, "unknown">] : null;
                    return (
                      <div key={f.name} className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="text-base">📄</span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-gray-700" title={f.name}>
                              {shortName(f.name)}
                            </p>
                            {info ? (
                              <p className="text-xs text-blue-600">
                                <span className={`mr-1 inline-block rounded px-1 py-0.5 text-[10px] font-semibold ${PLATFORM_COLOR[info.platform]}`}>
                                  {PLATFORM_LABEL[info.platform]}
                                </span>
                                {info.label}
                              </p>
                            ) : (
                              <p className="text-xs text-amber-600">Type not detected</p>
                            )}
                          </div>
                        </div>
                        <button onClick={() => removeFile(f.name)} className="ml-2 shrink-0 text-gray-400 hover:text-red-500">×</button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Accepted types reference */}
              <details className="rounded-lg border border-gray-200">
                <summary className="cursor-pointer px-4 py-2.5 text-xs font-medium text-gray-600 hover:bg-gray-50">
                  Accepted file types ({ACCEPTED_TYPES.length})
                </summary>
                <div className="grid grid-cols-1 gap-1 px-4 pb-3 pt-1 sm:grid-cols-2">
                  {ACCEPTED_TYPES.map((type) => {
                    const info = CSV_TYPE_INFO[type];
                    const detected = type === "er_trends"
                      ? (extract?.erTrends.length ?? 0) > 0
                      : !!extract?.detected[type as Exclude<typeof type, "er_trends">];
                    return (
                      <div key={type} className={`flex items-start gap-2 rounded-md px-2 py-1.5 ${detected ? "bg-emerald-50" : ""}`}>
                        <span className="mt-0.5 text-xs">{detected ? "✅" : "⬜"}</span>
                        <div>
                          <p className={`text-xs font-medium ${detected ? "text-emerald-800" : "text-gray-700"}`}>
                            <span className={`mr-1 inline-block rounded px-1 py-0.5 text-[9px] font-semibold ${PLATFORM_COLOR[info.platform]}`}>
                              {PLATFORM_LABEL[info.platform]}
                            </span>
                            {info.label}
                          </p>
                          <p className="text-[10px] text-gray-400">{info.hint}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </details>

              {processError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {processError}
                </div>
              )}

              <div className="flex justify-end">
                <button
                  onClick={handleNext}
                  disabled={!extract || totalFound === 0 || isProcessing}
                  className="rounded-lg bg-[#C0392B] px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#a93226] disabled:opacity-40"
                >
                  {isProcessing
                    ? "Processing…"
                    : needsDisambiguation
                    ? `Assign ER Files →`
                    : `Review ${totalFound} fields →`}
                </button>
              </div>
            </div>
          )}

          {/* ─── Disambiguate step ────────────────────────────── */}
          {modalStep === "disambiguate" && extract && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                The files below contain Engagement Rate data but could not be auto-assigned to a platform.
                Choose whether each file should fill Instagram ER or YouTube ER.
              </p>

              <div className="space-y-3">
                {extract.erTrends.map((entry) => {
                  const assignment = erAssignments[entry.file.name] ?? "";
                  const autoResolved = entry.resolvedPlatform !== null;
                  return (
                    <div key={entry.file.name} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                      <div className="mb-3 flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-gray-800" title={entry.file.name}>
                            {shortName(entry.file.name, 44)}
                          </p>
                          <p className="mt-0.5 text-xs text-gray-500">
                            Latest ER:{" "}
                            <span className="font-semibold text-gray-800">
                              {entry.latestER ? `${entry.latestER}%` : "—"}
                            </span>
                            {autoResolved && (
                              <span className="ml-2 text-emerald-600">
                                (auto-detected as {entry.resolvedPlatform === "ig" ? "Instagram" : "YouTube"})
                              </span>
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {(["ig", "youtube"] as const).map((platform) => {
                          const active = assignment === platform;
                          return (
                            <button
                              key={platform}
                              onClick={() => setErAssignments((prev) => ({ ...prev, [entry.file.name]: platform }))}
                              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition ${
                                active
                                  ? platform === "ig"
                                    ? "border-pink-400 bg-pink-100 text-pink-800"
                                    : "border-red-400 bg-red-100 text-red-800"
                                  : "border-gray-300 bg-white text-gray-600 hover:border-gray-400"
                              }`}
                            >
                              {platform === "ig" ? "📸 Instagram ER" : "▶️ YouTube ER"}
                            </button>
                          );
                        })}
                        {assignment && (
                          <button
                            onClick={() => setErAssignments((prev) => ({ ...prev, [entry.file.name]: "" }))}
                            className="rounded-lg border border-gray-200 px-2 py-2 text-xs text-gray-400 hover:text-red-500"
                            title="Clear assignment"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setModalStep("upload")}
                  className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  ← Back
                </button>
                <button
                  onClick={() => setModalStep("confirm")}
                  disabled={unresolvedCount > 0}
                  className="flex-1 rounded-lg bg-[#C0392B] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#a93226] disabled:opacity-40"
                >
                  {unresolvedCount > 0 ? `${unresolvedCount} unassigned` : `Review ${totalFound} fields →`}
                </button>
              </div>
            </div>
          )}

          {/* ─── Confirm step ─────────────────────────────────── */}
          {modalStep === "confirm" && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-600">
                  Review the fields below, then click <strong>Apply to Form</strong>.
                  You can edit any value after applying.
                </p>
                <span className="shrink-0 rounded-full bg-[#1B2A4A] px-3 py-0.5 text-xs font-semibold text-white">
                  {totalFound} / {totalPossible} filled
                </span>
              </div>

              {FIELD_GROUPS.map((group) => {
                return (
                  <div key={group.group} className="overflow-hidden rounded-xl border border-gray-200">
                    <div className="bg-gray-50 px-4 py-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{group.group}</p>
                    </div>
                    <div className="divide-y divide-gray-100">
                      {group.fields.map((fe) => {
                        if (fe.kind === "pair") {
                          const mVal = finalFields[fe.mKey] as string | undefined;
                          const fVal = finalFields[fe.fKey] as string | undefined;
                          const found = !!mVal || !!fVal;
                          const src = finalSources[fe.mKey] || finalSources[fe.fKey];
                          return (
                            <div key={fe.mKey} className="flex items-center gap-3 px-4 py-2.5">
                              <span className={`h-2 w-2 shrink-0 rounded-full ${found ? "bg-emerald-500" : "bg-amber-300"}`} />
                              <span className="w-28 text-xs font-medium text-gray-700">{fe.label}</span>
                              <span className="flex-1 text-xs text-gray-800">
                                {found
                                  ? `M: ${mVal ?? "—"}%  /  F: ${fVal ?? "—"}%`
                                  : <span className="text-gray-400">Not found</span>}
                              </span>
                              {src && (
                                <span className="max-w-[120px] truncate text-[10px] text-blue-500" title={src}>
                                  {shortName(src, 22)}
                                </span>
                              )}
                            </div>
                          );
                        }

                        const val = finalFields[fe.key] as string | undefined;
                        const found = !!val;
                        const src = finalSources[fe.key as string];
                        let display = "";
                        if (found && val) {
                          const n = parseFloat(val);
                          if (!isNaN(n)) {
                            display = (fe.unit ? n.toFixed(1) : Math.round(n).toLocaleString()) + (fe.unit ?? "");
                          } else {
                            display = val;
                          }
                        }
                        return (
                          <div key={fe.key} className="flex items-center gap-3 px-4 py-2.5">
                            <span className={`h-2 w-2 shrink-0 rounded-full ${found ? "bg-emerald-500" : "bg-amber-300"}`} />
                            <span className="w-40 text-xs font-medium text-gray-700">{fe.label}</span>
                            <span className="flex-1 text-xs font-semibold text-[#1B2A4A]">
                              {found ? display : <span className="font-normal text-gray-400">Not found</span>}
                            </span>
                            {src && (
                              <span className="max-w-[120px] truncate text-[10px] text-blue-500" title={src}>
                                {shortName(src, 22)}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              <div className="flex gap-3">
                <button
                  onClick={() => setModalStep(needsDisambiguation ? "disambiguate" : "upload")}
                  className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  ← Back
                </button>
                <button
                  onClick={handleApply}
                  disabled={totalFound === 0}
                  className="flex-1 rounded-lg bg-[#C0392B] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#a93226] disabled:opacity-50"
                >
                  Apply {totalFound} Fields to Form
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
