"use client";

import React from "react";

// ── Chartmetric source badge ──────────────────────────────────
export function ChartmetricBadge() {
  return (
    <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold bg-[#1B2A4A]/10 text-[#1B2A4A] leading-none">
      Chartmetric
    </span>
  );
}

// ── Labeled text/number input ─────────────────────────────────
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  required?: boolean;
  error?: string;
  csvFilled?: boolean;
}
export function Input({ label, hint, required, error, csvFilled, className, ...rest }: InputProps) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <label className="text-sm font-medium text-gray-700">
          {label}{required && <span className="ml-0.5 text-[#C0392B]">*</span>}
        </label>
        {csvFilled && <ChartmetricBadge />}
      </div>
      <input
        {...rest}
        className={`rounded-md border px-3 py-2 text-sm shadow-sm outline-none transition focus:border-[#C0392B] focus:ring-1 focus:ring-[#C0392B] disabled:bg-gray-50 ${
          csvFilled ? "border-[#1B2A4A]/30 bg-[#1B2A4A]/5" : error ? "border-[#C0392B]" : "border-gray-300"
        } ${className ?? ""}`}
      />
      {hint && !error && <p className="text-xs text-gray-400">{hint}</p>}
      {error && <p className="text-xs text-[#C0392B]">{error}</p>}
    </div>
  );
}

// ── Labeled select ────────────────────────────────────────────
interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  hint?: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}
export function Select({ label, hint, required, error, children, className, ...rest }: SelectProps) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-gray-700">
        {label}{required && <span className="ml-0.5 text-[#C0392B]">*</span>}
      </label>
      <select
        {...rest}
        className={`rounded-md border px-3 py-2 text-sm shadow-sm outline-none transition focus:border-[#C0392B] focus:ring-1 focus:ring-[#C0392B] ${
          error ? "border-red-400" : "border-gray-300"
        } ${className ?? ""}`}
      >
        {children}
      </select>
      {hint && !error && <p className="text-xs text-gray-400">{hint}</p>}
      {error && <p className="text-xs text-[#C0392B]">{error}</p>}
    </div>
  );
}

// ── 1-5 score selector ────────────────────────────────────────
interface ScoreSelectorProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  descriptions?: string[];
  required?: boolean;
  error?: string;
  max?: number;
  csvFilled?: boolean;
}
export function ScoreSelector({
  label, value, onChange, descriptions, required, error, max = 5, csvFilled,
}: ScoreSelectorProps) {
  const options = Array.from({ length: max }, (_, i) => i + 1);
  const selected = parseInt(value);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <label className="text-sm font-medium text-gray-700">
          {label}{required && <span className="ml-0.5 text-[#C0392B]">*</span>}
        </label>
        {csvFilled && <ChartmetricBadge />}
      </div>
      <div className="flex gap-2">
        {options.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(String(n))}
            className={`h-10 w-10 rounded-md border text-sm font-semibold transition ${
              selected === n
                ? "border-[#C0392B] bg-[#C0392B] text-white shadow-sm"
                : "border-gray-300 text-gray-600 hover:border-[#C0392B] hover:text-[#C0392B]"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
      {descriptions && selected >= 1 && selected <= descriptions.length && (
        <p className="text-xs text-gray-500 italic">{descriptions[selected - 1]}</p>
      )}
      {error && <p className="text-xs text-[#C0392B]">{error}</p>}
    </div>
  );
}

// ── Radio card selector (all options always visible) ──────────
interface RadioCardOption {
  value: string;
  title: string;
  detail?: string;
}
interface RadioCardSelectorProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: RadioCardOption[];
  required?: boolean;
  error?: string;
}
export function RadioCardSelector({
  label, value, onChange, options, required, error,
}: RadioCardSelectorProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-gray-700">
        {label}{required && <span className="ml-0.5 text-[#C0392B]">*</span>}
      </label>
      <div className="flex flex-col gap-2">
        {options.map((opt) => {
          const selected = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={`flex items-start gap-3 rounded-lg border p-3 text-left transition ${
                selected
                  ? "border-[#C0392B] bg-[#C0392B]/5"
                  : "border-gray-200 bg-white hover:border-[#1B2A4A]/30 hover:bg-gray-50"
              }`}
            >
              <span
                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                  selected ? "border-[#C0392B]" : "border-gray-300"
                }`}
              >
                {selected && <span className="h-2 w-2 rounded-full bg-[#C0392B]" />}
              </span>
              <span
                className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-bold ${
                  selected ? "bg-[#C0392B] text-white" : "bg-[#1B2A4A]/10 text-[#1B2A4A]"
                }`}
              >
                {opt.value}
              </span>
              <span className="flex flex-col">
                <span className={`text-sm font-medium ${selected ? "text-[#1B2A4A]" : "text-gray-700"}`}>
                  {opt.title}
                </span>
                {opt.detail && (
                  <span className="text-xs text-gray-500">{opt.detail}</span>
                )}
              </span>
            </button>
          );
        })}
      </div>
      {error && <p className="text-xs text-[#C0392B]">{error}</p>}
    </div>
  );
}

// ── Real-time score badge ─────────────────────────────────────
export function ScoreBadge({ score, size = "sm" }: { score: number | null; size?: "sm" | "md" }) {
  if (score === null || isNaN(score)) {
    return (
      <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold bg-gray-100 text-gray-400">
        —
      </span>
    );
  }
  const color =
    score >= 4 ? "bg-[#1B2A4A]/10 text-[#1B2A4A]"
    : score >= 3 ? "bg-[#1B2A4A]/5 text-[#1B2A4A]/70"
    : score >= 2 ? "bg-gray-100 text-gray-600"
    : "bg-[#C0392B]/10 text-[#C0392B]";
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 font-semibold ${color} ${size === "md" ? "text-sm" : "text-xs"}`}>
      {Number.isInteger(score) ? score : score.toFixed(1)}
    </span>
  );
}

// ── Section header ────────────────────────────────────────────
export function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-5 border-b border-gray-200 pb-3">
      <h3 className="text-base font-semibold text-[#1B2A4A]">{title}</h3>
      {subtitle && <p className="mt-0.5 text-sm text-gray-500">{subtitle}</p>}
    </div>
  );
}

// ── Callout box ───────────────────────────────────────────────
export function Callout({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-[#1B2A4A]/20 bg-[#1B2A4A]/5 px-4 py-3 text-sm text-[#1B2A4A]">
      {children}
    </div>
  );
}

// ── Metric row for real-time score display ────────────────────
export function MetricRow({
  label, score, weight, children,
}: {
  label: string; score: number | null; weight?: string; children?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex-1">{children}</div>
      <div className="flex shrink-0 flex-col items-end gap-1 pt-7">
        <ScoreBadge score={score} />
        {weight && <span className="text-xs text-gray-400">{weight}</span>}
      </div>
    </div>
  );
}
