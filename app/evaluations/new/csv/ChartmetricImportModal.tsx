"use client";

import { useState, useCallback, useEffect } from "react";
import type { EvalFormData } from "../types";
import { readFileText, parseCSV, detectCSVType, extractMultiCSV } from "./parser";
import type { CSVType, MultiCSVExtract } from "./parser";

interface Props {
  onApply: (values: Partial<EvalFormData>) => void;
  onClose: () => void;
}

type ModalStep = "upload" | "preview";

interface FileSlot {
  type: CSVType;
  label: string;
  description: string;
  required: boolean;
}

const FILE_SLOTS: FileSlot[] = [
  { type: "engagement",        label: "Engagement CSV",         description: "Contains Spotify Monthly Listeners + FCR",  required: true  },
  { type: "ig_followers",      label: "Instagram Followers CSV", description: "Filename includes 'Instagram'",             required: true  },
  { type: "tiktok_followers",  label: "TikTok Followers CSV",   description: "Filename includes 'TikTok'",                required: false },
  { type: "youtube_followers", label: "YouTube Subscribers CSV", description: "Filename includes 'YouTube'",               required: false },
  { type: "spotify_followers", label: "Spotify Followers CSV",  description: "Filename includes 'Spotify' + Followers",   required: false },
];

const FIELD_META: Array<{
  key: keyof EvalFormData;
  label: string;
  step: string;
  unit?: string;
}> = [
  { key: "spotify_monthly_listeners", label: "Spotify Monthly Listeners", step: "Step 4 — Spotify" },
  { key: "fan_concentration_ratio",   label: "Spotify FCR %",             step: "Step 4 — Spotify",   unit: "%" },
  { key: "spotify_yoy_pct",           label: "Spotify YoY Change",        step: "Step 4 — Spotify",   unit: "%" },
  { key: "ig_followers",              label: "Instagram Followers",        step: "Step 5 — Instagram" },
  { key: "ig_30day_gain",             label: "Instagram 30-Day Gain",      step: "Step 5 — Instagram" },
  { key: "tiktok_followers",          label: "TikTok Followers",           step: "Step 6 — TikTok & YouTube" },
  { key: "youtube_subscribers",       label: "YouTube Subscribers",        step: "Step 6 — TikTok & YouTube" },
];

export default function ChartmetricImportModal({ onApply, onClose }: Props) {
  const [modalStep, setModalStep] = useState<ModalStep>("upload");
  const [isDragging, setIsDragging] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [extract, setExtract] = useState<MultiCSVExtract | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processError, setProcessError] = useState<string | null>(null);

  // Re-process whenever files change
  useEffect(() => {
    if (!uploadedFiles.length) { setExtract(null); return; }
    setIsProcessing(true);
    setProcessError(null);
    extractMultiCSV(uploadedFiles)
      .then(setExtract)
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
      return combined.slice(0, 5);
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
  };

  const handleApply = () => {
    if (!extract) return;
    const nonEmpty = Object.fromEntries(
      Object.entries(extract.fields).filter(([, v]) => v !== "" && v !== null && v !== undefined)
    ) as Partial<EvalFormData>;
    onApply(nonEmpty);
    onClose();
  };

  const fieldCount = extract ? Object.keys(extract.fields).length : 0;

  // Determine which slot each uploaded file fills
  const fileSlotMap = uploadedFiles.reduce<Record<string, CSVType>>((acc, f) => {
    const csv = parseCSV(""); // headers unknown until async; use filename only for display
    const type = detectCSVType([], f.name);
    acc[f.name] = type;
    return acc;
  }, {});

  // Override with actual detected types from extract
  if (extract) {
    for (const [type, entry] of Object.entries(extract.detected)) {
      if (entry) fileSlotMap[entry.file.name] = type as CSVType;
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between bg-[#1B2A4A] px-6 py-4">
          <div>
            <p className="text-xs font-medium text-white/50 uppercase tracking-wider">Chartmetric Import</p>
            <h2 className="text-base font-semibold text-white">Import Platform Data CSVs</h2>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white text-xl leading-none">×</button>
        </div>

        {/* Step tabs */}
        <div className="flex border-b border-gray-100 px-6 gap-6 text-xs">
          {(["upload", "preview"] as ModalStep[]).map((s, i) => (
            <button
              key={s}
              onClick={() => extract && setModalStep(s)}
              className={`py-3 font-medium border-b-2 transition ${
                modalStep === s
                  ? "border-[#C0392B] text-[#C0392B]"
                  : "border-transparent text-gray-400 hover:text-gray-600"
              }`}
            >
              {i + 1}. {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        <div className="p-6">
          {/* ── Upload step ── */}
          {modalStep === "upload" && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Upload up to 5 Chartmetric CSV exports. Files are auto-detected by their column headers and filenames.
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
                <p className="text-sm font-medium text-gray-700">Drop CSV files here (up to 5)</p>
                <label className="mt-3 cursor-pointer rounded-lg bg-[#1B2A4A] px-4 py-1.5 text-sm font-medium text-white hover:bg-[#1B2A4A]/90">
                  Browse files
                  <input type="file" accept=".csv" multiple className="hidden" onChange={onFileChange} />
                </label>
              </div>

              {/* Uploaded files list */}
              {uploadedFiles.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Uploaded files</p>
                  {uploadedFiles.map((f) => {
                    const detectedType = fileSlotMap[f.name] ?? "unknown";
                    const slot = FILE_SLOTS.find((s) => s.type === detectedType);
                    return (
                      <div key={f.name} className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-lg">📄</span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-gray-700">{f.name}</p>
                            {slot ? (
                              <p className="text-xs text-blue-600">{slot.label}</p>
                            ) : (
                              <p className="text-xs text-amber-600">Type not detected yet</p>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => removeFile(f.name)}
                          className="ml-2 shrink-0 text-gray-400 hover:text-red-500 text-sm"
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Expected files grid */}
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">Expected files</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {FILE_SLOTS.map((slot) => {
                    const filled = extract?.detected[slot.type] != null;
                    return (
                      <div
                        key={slot.type}
                        className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm ${
                          filled
                            ? "border-emerald-200 bg-emerald-50"
                            : "border-gray-200 bg-white"
                        }`}
                      >
                        <span className="mt-0.5 text-base">{filled ? "✅" : slot.required ? "⬜" : "🔲"}</span>
                        <div>
                          <p className={`font-medium ${filled ? "text-emerald-800" : "text-gray-700"}`}>
                            {slot.label}
                            {!slot.required && <span className="ml-1 text-xs text-gray-400">(optional)</span>}
                          </p>
                          <p className="text-xs text-gray-400">{slot.description}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {processError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {processError}
                </div>
              )}

              <div className="flex justify-end">
                <button
                  onClick={() => setModalStep("preview")}
                  disabled={!extract || fieldCount === 0 || isProcessing}
                  className="rounded-lg bg-[#C0392B] px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#a93226] disabled:opacity-40"
                >
                  {isProcessing ? "Processing…" : `Review ${fieldCount} fields →`}
                </button>
              </div>
            </div>
          )}

          {/* ── Preview step ── */}
          {modalStep === "preview" && extract && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Review the extracted values below. Click <strong>Apply to Form</strong> to populate all fields at once.
                You can still edit any value after applying.
              </p>

              <div className="overflow-hidden rounded-xl border border-gray-200">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Field</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Value</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Step</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Source</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {FIELD_META.map(({ key, label, step, unit }) => {
                      const val = extract.fields[key];
                      const src = extract.fieldSources[key];
                      const found = val !== undefined && val !== "";
                      return (
                        <tr key={key} className={found ? "" : "opacity-40"}>
                          <td className="px-4 py-2.5 font-medium text-gray-700">{label}</td>
                          <td className="px-4 py-2.5">
                            {found ? (
                              <span className="font-semibold text-[#1B2A4A]">
                                {parseFloat(val as string) < 0 ? "" : ""}
                                {typeof val === "string" && parseFloat(val) > 0 &&
                                  (key === "spotify_yoy_pct" || key === "fan_concentration_ratio" || key === "ig_30day_gain") && key === "spotify_yoy_pct"
                                  ? `${parseFloat(val as string) > 0 ? "+" : ""}${val}${unit ?? ""}`
                                  : `${Number(val).toLocaleString()}${unit ?? ""}`
                                }
                              </span>
                            ) : (
                              <span className="text-gray-400">Not found</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-gray-500">{step}</td>
                          <td className="px-4 py-2.5 text-xs text-gray-400 truncate max-w-[120px]" title={src}>
                            {src ? <span className="text-blue-600">{src}</span> : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Detected files summary */}
              <div className="flex flex-wrap gap-2">
                {FILE_SLOTS.filter((s) => extract.detected[s.type]).map((slot) => (
                  <span key={slot.type} className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-3 py-0.5 text-xs font-medium text-blue-800">
                    ✓ {slot.label}
                  </span>
                ))}
                {FILE_SLOTS.filter((s) => !extract.detected[s.type] && s.required).map((slot) => (
                  <span key={slot.type} className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-0.5 text-xs font-medium text-amber-800">
                    ⚠ {slot.label} missing
                  </span>
                ))}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setModalStep("upload")}
                  className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  ← Back
                </button>
                <button
                  onClick={handleApply}
                  disabled={fieldCount === 0}
                  className="flex-1 rounded-lg bg-[#C0392B] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#a93226] disabled:opacity-50"
                >
                  Apply {fieldCount} Fields to Form
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
