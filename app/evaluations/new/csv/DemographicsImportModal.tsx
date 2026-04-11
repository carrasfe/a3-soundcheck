"use client";

import { useState, useCallback } from "react";
import type { EvalFormData } from "../types";
import { readFileText, parseCSV, extractDemographics, detectCSVType } from "./parser";
import type { SuggestedMapping, DemographicsExtract, ParsedCSV } from "./parser";

interface Props {
  onApply: (values: Partial<EvalFormData>) => void;
  onClose: () => void;
}

type ModalStep = "upload" | "mapping" | "preview";

const DEMO_FIELDS: { key: keyof EvalFormData; label: string }[] = [
  { key: "d_13_17_m", label: "13–17 Male %" },  { key: "d_13_17_f", label: "13–17 Female %" },
  { key: "d_18_24_m", label: "18–24 Male %" },  { key: "d_18_24_f", label: "18–24 Female %" },
  { key: "d_25_34_m", label: "25–34 Male %" },  { key: "d_25_34_f", label: "25–34 Female %" },
  { key: "d_35_44_m", label: "35–44 Male %" },  { key: "d_35_44_f", label: "35–44 Female %" },
  { key: "d_45_64_m", label: "45–64 Male %" },  { key: "d_45_64_f", label: "45–64 Female %" },
  { key: "d_65_m",    label: "65+ Male %" },     { key: "d_65_f",    label: "65+ Female %" },
  { key: "eth_white", label: "White/Caucasian %" },
  { key: "eth_aa",    label: "African American %" },
  { key: "eth_hispanic", label: "Hispanic %" },
  { key: "eth_asian",    label: "Asian %" },
];

const MAPPING_OPTIONS = [
  { value: "",               label: "— Skip —" },
  { value: "ageCol",         label: "Age Bracket column" },
  { value: "maleCol",        label: "Male % column" },
  { value: "femaleCol",      label: "Female % column" },
  { value: "genderCol",      label: "Gender column" },
  { value: "percentageCol",  label: "Percentage column" },
  { value: "ethnicityCol",   label: "Ethnicity column" },
];

export default function DemographicsImportModal({ onApply, onClose }: Props) {
  const [modalStep, setModalStep] = useState<ModalStep>("upload");
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [parsedCSV, setParsedCSV] = useState<ParsedCSV | null>(null);
  const [extract, setExtract] = useState<DemographicsExtract | null>(null);
  const [mapping, setMapping] = useState<SuggestedMapping | null>(null);

  const processFile = useCallback(async (file: File) => {
    setError(null);
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("Please upload a .csv file.");
      return;
    }
    try {
      const text = await readFileText(file);
      const csv  = parseCSV(text);
      if (!csv.headers.length) {
        setError("Could not parse CSV. Make sure the file has headers in the first row.");
        return;
      }
      const type = detectCSVType(csv.headers, file.name);
      if (type !== "demographics" && type !== "unknown") {
        setError(`This looks like a ${type.replace("_", " ")} file, not a demographics export. Please upload the Audience Demographics CSV.`);
        return;
      }
      setFileName(file.name);
      setParsedCSV(csv);
      const result = extractDemographics(csv);
      setExtract(result);
      setMapping(result.suggestedMapping);

      if (result.confidence === "high") {
        setModalStep("preview");
      } else {
        setModalStep("mapping");
      }
    } catch {
      setError("Failed to read file. Please try again.");
    }
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const applyMapping = () => {
    if (!parsedCSV || !mapping) return;
    const result = extractDemographics(parsedCSV, mapping);
    setExtract(result);
    setModalStep("preview");
  };

  const handleApply = () => {
    if (!extract) return;
    const nonEmpty = Object.fromEntries(
      Object.entries(extract.values).filter(([, v]) => v !== "")
    ) as Partial<EvalFormData>;
    onApply(nonEmpty);
    onClose();
  };

  const filledCount = extract ? Object.values(extract.values).filter((v) => v !== "").length : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between bg-[#1B2A4A] px-6 py-4">
          <div>
            <p className="text-xs font-medium text-white/50 uppercase tracking-wider">Chartmetric Import</p>
            <h2 className="text-base font-semibold text-white">Audience Demographics CSV</h2>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white text-xl leading-none">×</button>
        </div>

        {/* Step indicator */}
        <div className="flex border-b border-gray-100 px-6 py-3 gap-6 text-xs">
          {(["upload", "mapping", "preview"] as ModalStep[]).map((s, i) => (
            <span key={s} className={`font-medium ${modalStep === s ? "text-[#C0392B]" : "text-gray-400"}`}>
              {i + 1}. {s.charAt(0).toUpperCase() + s.slice(1)}
            </span>
          ))}
        </div>

        <div className="p-6">
          {/* ── Upload step ── */}
          {modalStep === "upload" && (
            <div>
              <p className="mb-4 text-sm text-gray-600">
                Export your Audience Demographics from Chartmetric and upload the CSV file below.
              </p>
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={onDrop}
                className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 transition ${
                  isDragging ? "border-[#C0392B] bg-red-50" : "border-gray-300 bg-gray-50 hover:border-gray-400"
                }`}
              >
                <div className="mb-3 text-4xl">📊</div>
                <p className="text-sm font-medium text-gray-700">Drag & drop your CSV here</p>
                <p className="mt-1 text-xs text-gray-400">or</p>
                <label className="mt-3 cursor-pointer rounded-lg bg-[#1B2A4A] px-4 py-2 text-sm font-medium text-white hover:bg-[#1B2A4A]/90">
                  Browse files
                  <input type="file" accept=".csv" className="hidden" onChange={onFileChange} />
                </label>
                <p className="mt-3 text-xs text-gray-400">Chartmetric → Artist → Audience → Export CSV</p>
              </div>
              {error && (
                <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}
            </div>
          )}

          {/* ── Mapping step ── */}
          {modalStep === "mapping" && parsedCSV && (
            <div>
              <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <strong>Column mapping needed.</strong> We couldn't automatically determine the format of <em>{fileName}</em>.
                Please confirm which CSV columns map to which fields.
              </div>
              <div className="mb-4 overflow-hidden rounded-lg border border-gray-200">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">CSV Column</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Maps To</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Preview</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {parsedCSV.headers.map((h) => {
                      const currentRole = Object.entries(mapping ?? {}).find(([, v]) => v === h)?.[0] ?? "";
                      const preview = parsedCSV.rows.slice(0, 2).map((r) => r[h]).filter(Boolean).join(", ");
                      return (
                        <tr key={h}>
                          <td className="px-4 py-2 font-mono text-xs text-gray-700">{h}</td>
                          <td className="px-4 py-2">
                            <select
                              value={currentRole}
                              onChange={(e) => {
                                if (!mapping) return;
                                const newMapping = { ...mapping };
                                // Clear any existing assignment for this role
                                const role = e.target.value as keyof SuggestedMapping;
                                Object.keys(newMapping).forEach((k) => {
                                  if (newMapping[k as keyof SuggestedMapping] === h) {
                                    (newMapping as Record<string, string | null>)[k] = null;
                                  }
                                });
                                if (role) (newMapping as Record<string, string | null>)[role] = h;
                                setMapping(newMapping);
                              }}
                              className="rounded border border-gray-300 px-2 py-1 text-xs outline-none focus:border-[#C0392B]"
                            >
                              {MAPPING_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-2 text-xs text-gray-400 font-mono">{preview || "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setModalStep("upload")}
                  className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  ← Back
                </button>
                <button
                  onClick={applyMapping}
                  className="flex-1 rounded-lg bg-[#C0392B] px-4 py-2 text-sm font-semibold text-white hover:bg-[#a93226]"
                >
                  Apply Mapping →
                </button>
              </div>
            </div>
          )}

          {/* ── Preview step ── */}
          {modalStep === "preview" && extract && (
            <div>
              <div className="mb-4 flex items-center gap-2">
                <span className="rounded-full bg-emerald-100 px-3 py-0.5 text-sm font-semibold text-emerald-800">
                  {filledCount} fields detected
                </span>
                <span className="text-sm text-gray-500">from <em className="font-medium text-gray-700">{fileName}</em></span>
              </div>
              <div className="max-h-64 overflow-y-auto rounded-lg border border-gray-200">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Field</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Value</th>
                      <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {DEMO_FIELDS.map(({ key, label }) => {
                      const val = extract.values[key];
                      return (
                        <tr key={key} className={val ? "" : "opacity-40"}>
                          <td className="px-4 py-2 text-gray-700">{label}</td>
                          <td className="px-4 py-2 font-medium text-[#1B2A4A]">{val ? `${val}%` : "—"}</td>
                          <td className="px-4 py-2 text-center">{val ? "✓" : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {filledCount === 0 && (
                <p className="mt-3 text-sm text-amber-700">
                  No demographic data was recognized. Try the mapping step or check that your CSV is the Audience Demographics export.
                </p>
              )}
              <div className="mt-4 flex gap-3">
                <button
                  onClick={() => setModalStep(extract.confidence === "low" ? "mapping" : "upload")}
                  className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  ← Back
                </button>
                <button
                  onClick={handleApply}
                  disabled={filledCount === 0}
                  className="flex-1 rounded-lg bg-[#C0392B] px-4 py-2 text-sm font-semibold text-white hover:bg-[#a93226] disabled:opacity-50"
                >
                  Apply {filledCount} Fields
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
