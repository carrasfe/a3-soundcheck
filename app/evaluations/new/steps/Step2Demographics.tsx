"use client";

import { useMemo, useState } from "react";
import { Callout, ChartmetricBadge } from "../ui";
import type { EvalFormData, StepProps } from "../types";
import { buildDemographics, getAgeProfileLabel } from "../types";
import DemographicsImportModal from "../csv/DemographicsImportModal";

const AGE_BRACKETS = [
  { label: "13–17",  m: "d_13_17_m", f: "d_13_17_f" },
  { label: "18–24",  m: "d_18_24_m", f: "d_18_24_f" },
  { label: "25–34",  m: "d_25_34_m", f: "d_25_34_f" },
  { label: "35–44",  m: "d_35_44_m", f: "d_35_44_f" },
  { label: "45–64",  m: "d_45_64_m", f: "d_45_64_f" },
  { label: "65+",    m: "d_65_m",    f: "d_65_f"    },
] as const;

function pct(s: string): number { return parseFloat(s) || 0; }

export default function Step2Demographics({ data, onChange, onCsvFill, csvFilled }: StepProps) {
  const [showImportModal, setShowImportModal] = useState(false);
  const set = (key: keyof EvalFormData) =>
    (e: React.ChangeEvent<HTMLInputElement>) => onChange({ [key]: e.target.value });

  const derived = useMemo(() => {
    const demo = buildDemographics(data);
    if (!demo) return null;

    const brackets = [
      demo.age_13_17 ?? 0, demo.age_18_24 ?? 0, demo.age_25_34 ?? 0,
      demo.age_35_44 ?? 0, demo.age_45_64 ?? 0, demo.age_65_plus ?? 0,
    ];
    const under35 = brackets[0] + brackets[1] + brackets[2];
    const over35  = brackets[3] + brackets[4] + brackets[5];

    // Total male / female
    const totalM = AGE_BRACKETS.reduce((s, b) => s + pct(data[b.m]), 0);
    const totalF = AGE_BRACKETS.reduce((s, b) => s + pct(data[b.f]), 0);
    const totalAll = totalM + totalF;

    const LABELS = ["13–17", "18–24", "25–34", "35–44", "45–64", "65+"];
    const domIdx = brackets.indexOf(Math.max(...brackets));
    const dominant = brackets[domIdx] > 0 ? LABELS[domIdx] : "—";

    const ageProfileLabel = getAgeProfileLabel(data);

    return { under35, over35, dominant, totalM, totalF, totalAll, ageProfileLabel };
  }, [data]);

  const rowTotal = (b: (typeof AGE_BRACKETS)[number]) => {
    const t = pct(data[b.m]) + pct(data[b.f]);
    return t > 0 ? `${t.toFixed(1)}%` : "—";
  };

  const numInput = (key: keyof EvalFormData) => {
    const filled = csvFilled.has(key);
    return (
      <div className="relative">
        <input
          type="number"
          min={0}
          max={100}
          step={0.1}
          value={data[key] as string}
          onChange={set(key)}
          placeholder="0"
          className={`w-20 rounded-md border px-2 py-1.5 text-center text-sm outline-none transition focus:border-[#C0392B] focus:ring-1 focus:ring-[#C0392B] ${
            filled ? "border-[#1B2A4A]/30 bg-[#1B2A4A]/5" : "border-gray-300"
          }`}
        />
        {filled && (
          <span className="absolute -top-3 left-0 text-[9px] font-semibold text-[#1B2A4A]">CM</span>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {showImportModal && (
        <DemographicsImportModal
          onApply={onCsvFill}
          onClose={() => setShowImportModal(false)}
        />
      )}

      <div className="flex items-start justify-between gap-4">
        <Callout>
          <strong>Optional step.</strong> Leave blank to use default demographic weights (Young × Moderate touring).
          Filling this in improves platform affinity scoring and pillar weight selection.
        </Callout>
        <button
          type="button"
          onClick={() => setShowImportModal(true)}
          className="shrink-0 flex items-center gap-1.5 rounded-lg border border-[#1B2A4A]/20 bg-[#1B2A4A]/5 px-3 py-2 text-sm font-medium text-[#1B2A4A] transition hover:bg-[#1B2A4A]/10"
        >
          <span>📊</span>
          Import from Chartmetric
        </button>
      </div>

      {/* Age grid */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-[#1B2A4A]">
            Age & Gender Distribution
          </h3>
          <span className="text-xs text-gray-400">Enter as 75, not 0.75</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="pb-2 text-left font-medium text-gray-500">Age Bracket</th>
                <th className="pb-2 text-center font-medium text-gray-500">Male %</th>
                <th className="pb-2 text-center font-medium text-gray-500">Female %</th>
                <th className="pb-2 text-center font-medium text-gray-500">Total %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {AGE_BRACKETS.map((b) => (
                <tr key={b.label}>
                  <td className="py-3 font-medium text-gray-700">{b.label}</td>
                  <td className="py-3 text-center">{numInput(b.m)}</td>
                  <td className="py-3 text-center">{numInput(b.f)}</td>
                  <td className="py-3 text-center font-semibold text-gray-700">
                    {rowTotal(b)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {derived && (
          <div className="mt-5 grid grid-cols-2 gap-3 rounded-lg bg-gray-50 p-4 sm:grid-cols-4">
            <Stat label="% Under 35" value={`${derived.under35.toFixed(1)}%`} />
            <Stat label="% Over 35"  value={`${derived.over35.toFixed(1)}%`} />
            <Stat label="Dominant Bracket" value={derived.dominant} />
            <Stat
              label="Gender Split"
              value={
                derived.totalAll > 0
                  ? `${Math.round((derived.totalM / derived.totalAll) * 100)}% M / ${Math.round((derived.totalF / derived.totalAll) * 100)}% F`
                  : "—"
              }
            />
            <div className="col-span-2 sm:col-span-4">
              <Stat label="Age Profile" value={derived.ageProfileLabel} highlight />
            </div>
          </div>
        )}
      </section>

      {/* Ethnicity */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="mb-1 text-sm font-semibold uppercase tracking-wider text-[#1B2A4A]">
          Ethnicity
        </h3>
        <p className="mb-4 text-xs text-gray-500">
          Enter approximate percentages. Modifiers activate when a group exceeds 15%.
        </p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { key: "eth_white" as keyof EvalFormData,    label: "White / Caucasian" },
            { key: "eth_aa" as keyof EvalFormData,       label: "African American" },
            { key: "eth_hispanic" as keyof EvalFormData, label: "Hispanic / Latino" },
            { key: "eth_asian" as keyof EvalFormData,    label: "Asian" },
          ].map(({ key, label }) => {
            const filled = csvFilled.has(key);
            return (
              <div key={key} className="flex flex-col gap-1">
                <div className="flex items-center gap-1.5">
                  <label className="text-xs font-medium text-gray-600">{label}</label>
                  {filled && <ChartmetricBadge />}
                </div>
                <div className="relative">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={data[key] as string}
                    onChange={set(key)}
                    placeholder="0"
                    className={`w-full rounded-md border px-3 py-2 pr-7 text-sm outline-none transition focus:border-[#C0392B] focus:ring-1 focus:ring-[#C0392B] ${
                      filled ? "border-blue-300 bg-blue-50/40" : "border-gray-300"
                    }`}
                  />
                  <span className="pointer-events-none absolute right-2.5 top-2.5 text-xs text-gray-400">%</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`font-semibold ${highlight ? "text-[#C0392B]" : "text-gray-800"}`}>{value}</p>
    </div>
  );
}
