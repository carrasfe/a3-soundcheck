"use client";

import { useState, useEffect, useCallback } from "react";
import type { EvalFormData } from "./types";
import { INITIAL_FORM_DATA } from "./types";
import { saveEvaluation, loadEvaluationInputs } from "./actions";
import Step1ArtistInfo    from "./steps/Step1ArtistInfo";
import Step2Demographics  from "./steps/Step2Demographics";
import Step3Touring       from "./steps/Step3Touring";
import Step4FanEngagement from "./steps/Step4FanEngagement";
import Step5Ecommerce     from "./steps/Step5Ecommerce";
import Step6Growth        from "./steps/Step6Growth";
import Step7Results       from "./steps/Step7Results";

const STEPS = [
  "Artist Info",
  "Demographics",
  "P1 — Touring",
  "P2 — Fan Engagement",
  "P3 — E-Commerce",
  "P4 — Growth",
  "Results",
];

const DRAFT_KEY = "a3_evaluation_draft";

// ── Validation ────────────────────────────────────────────────

type Errors = Partial<Record<keyof EvalFormData, string>>;

function validateStep(step: number, data: EvalFormData): Errors {
  const e: Errors = {};

  const pct = (val: string, key: keyof EvalFormData) => {
    if (!val) { e[key] = "Required"; return; }
    const n = parseFloat(val);
    if (isNaN(n) || n < 0 || n > 100) e[key] = "Must be 0–100";
  };

  const pos = (val: string, key: keyof EvalFormData, label = "Must be greater than 0") => {
    if (!val) { e[key] = "Required"; return; }
    const n = parseFloat(val);
    if (isNaN(n) || n <= 0) e[key] = label;
  };

  if (step === 1) {
    if (!data.artist_name.trim()) e.artist_name = "Required";
    if (!data.genre)              e.genre        = "Required";
  }

  if (step === 3) {
    pos(data.venue_capacity, "venue_capacity");
    pct(data.sell_through_pct, "sell_through_pct");
    pos(data.num_dates, "num_dates");
    if (!data.market_coverage) e.market_coverage = "Required";
    if (data.resale_situation !== "not_sold_out") {
      if (!data.face_value)   e.face_value   = "Required when sold out";
      else if (parseFloat(data.face_value) <= 0) e.face_value = "Must be greater than 0";
      if (!data.resale_price) e.resale_price = "Required when sold out";
      else if (parseFloat(data.resale_price) <= 0) e.resale_price = "Must be greater than 0";
    }
  }

  if (step === 4) {
    if (!data.spotify_monthly_listeners) e.spotify_monthly_listeners = "Required";
    else if (parseFloat(data.spotify_monthly_listeners) < 0) e.spotify_monthly_listeners = "Must be 0 or greater";
    pct(data.fan_concentration_ratio, "fan_concentration_ratio");
    if (!data.p2_fan_identity) e.p2_fan_identity = "Required";
    if (!data.ig_followers) e.ig_followers = "Required";
    else if (parseFloat(data.ig_followers) < 0) e.ig_followers = "Must be 0 or greater";
    if (data.ig_er_pct) {
      const er = parseFloat(data.ig_er_pct);
      if (er < 0 || er > 100) e.ig_er_pct = "Must be 0–100 (e.g. 3.2 for 3.2%)";
    }
    if (!data.reddit_members && data.reddit_members !== "0") e.reddit_members = "Required (enter 0 if none)";
    if (!data.merch_sentiment)  e.merch_sentiment  = "Required";
    if (!data.tiktok_followers) e.tiktok_followers = "Required";
    else if (parseFloat(data.tiktok_followers) < 0) e.tiktok_followers = "Must be 0 or greater";
    if (!data.youtube_subscribers) e.youtube_subscribers = "Required";
    else if (parseFloat(data.youtube_subscribers) < 0) e.youtube_subscribers = "Must be 0 or greater";
  }

  if (step === 5) {
    if (!data.store_quality) e.store_quality = "Required";
    if (!data.merch_range)   e.merch_range   = "Required";
    if (!data.d2c_level)     e.d2c_level     = "Required";
  }

  if (step === 6) {
    if (!data.venue_progression) e.venue_progression = "Required";
    if (!data.press_score)       e.press_score        = "Required";
    if (!data.playlist_score)    e.playlist_score     = "Required";
    if (data.spotify_yoy_pct) {
      const yoy = parseFloat(data.spotify_yoy_pct);
      if (isNaN(yoy) || yoy < -100 || yoy > 1000)
        e.spotify_yoy_pct = "Enter as a percentage, e.g. 25 for 25% growth";
    }
  }

  return e;
}

// ── Component ─────────────────────────────────────────────────

interface Props {
  evaluatorName: string;
  prefillId?: string;
  editId?: string;
}

export default function EvaluationWizard({ evaluatorName, prefillId, editId }: Props) {
  const [step, setStep]         = useState(1);
  const [data, setData]         = useState<EvalFormData>(INITIAL_FORM_DATA);
  const [errors, setErrors]     = useState<Errors>({});
  const [savedId, setSavedId]   = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [draftNote, setDraftNote] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [draftRestorePrompt, setDraftRestorePrompt] = useState(false);
  const [csvFilled, setCsvFilled] = useState<Set<string>>(new Set());

  // Load prefill/edit data from DB, or draft from localStorage
  useEffect(() => {
    const loadId = editId ?? prefillId;
    if (loadId) {
      loadEvaluationInputs(loadId).then(({ data }) => {
        if (data) {
          setData(data);
          if (editId) setSavedId(editId);
        }
      });
    } else {
      try {
        const raw = localStorage.getItem(DRAFT_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as EvalFormData;
          if (parsed.artist_name || parsed.genre) setDraftRestorePrompt(true);
        }
      } catch { /* ignore */ }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-save to localStorage on every change
  useEffect(() => {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(data)); } catch { /* ignore */ }
  }, [data]);

  const update = useCallback((updates: Partial<EvalFormData>) => {
    setData((prev) => ({ ...prev, ...updates }));
    // Clear errors and CSV badges for manually edited fields
    const keys = Object.keys(updates) as Array<keyof EvalFormData>;
    if (keys.some((k) => errors[k])) {
      setErrors((prev) => {
        const next = { ...prev };
        keys.forEach((k) => delete next[k]);
        return next;
      });
    }
    setCsvFilled((prev) => {
      if (!keys.some((k) => prev.has(k))) return prev;
      const next = new Set(prev);
      keys.forEach((k) => next.delete(k));
      return next;
    });
  }, [errors]);

  const handleCsvFill = useCallback((updates: Partial<EvalFormData>) => {
    setData((prev) => ({ ...prev, ...updates }));
    setCsvFilled((prev) => {
      const next = new Set(prev);
      Object.keys(updates).forEach((k) => next.add(k));
      return next;
    });
  }, []);

  const goTo = (target: number) => {
    if (target > step) {
      const e = validateStep(step, data);
      if (Object.keys(e).length) { setErrors(e); return; }
      setErrors({});
    }
    setStep(target);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSaveDraft = async () => {
    setIsSaving(true);
    setSaveError(null);
    try {
      const result = await saveEvaluation(data, "draft", savedId ?? undefined);
      if (result.error) {
        // DB might not be set up yet — draft is still in localStorage
        setDraftNote("Draft saved locally");
      } else {
        setSavedId(result.id);
        setDraftNote("Draft saved");
      }
      setTimeout(() => setDraftNote(null), 3000);
    } catch {
      setDraftNote("Draft saved locally");
      setTimeout(() => setDraftNote(null), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveError(null);
    try {
      const result = await saveEvaluation(data, "complete", savedId ?? undefined);
      if (result.error) {
        setSaveError(result.error);
      } else {
        setSavedId(result.id);
        // Clear local draft
        try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
      }
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopyLink = async () => {
    if (!savedId) return;
    const url = `${window.location.origin}/evaluations/${savedId}`;
    try {
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2500);
    } catch {
      prompt("Copy this link:", url);
    }
  };

  const restoreDraft = () => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) setData(JSON.parse(raw));
    } catch { /* ignore */ }
    setDraftRestorePrompt(false);
  };

  const renderStep = () => {
    const props = { data, onChange: update, onCsvFill: handleCsvFill, csvFilled, errors };
    switch (step) {
      case 1: return <Step1ArtistInfo    {...props} />;
      case 2: return <Step2Demographics  {...props} />;
      case 3: return <Step3Touring       {...props} />;
      case 4: return <Step4FanEngagement {...props} />;
      case 5: return <Step5Ecommerce     {...props} />;
      case 6: return <Step6Growth        {...props} />;
      case 7: return (
        <Step7Results
          data={data}
          savedId={savedId}
          isSaving={isSaving}
          saveError={saveError}
          evaluatorName={evaluatorName}
          onSave={handleSave}
          onCopyLink={handleCopyLink}
          linkCopied={linkCopied}
        />
      );
    }
  };

  return (
    <div className="flex min-h-full flex-col print:block">
      {/* ── Sticky header ── */}
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#1B2A4A] print:hidden">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-3">
          {/* Breadcrumb */}
          <div className="shrink-0">
            <p className="text-[10px] font-medium uppercase tracking-wider text-white/40">A3 Soundcheck</p>
            <p className="text-sm font-semibold text-white">New Evaluation</p>
          </div>

          {/* Stepper */}
          <nav className="hidden overflow-x-auto md:flex">
            <ol className="flex items-center gap-0">
              {STEPS.map((label, i) => {
                const n = i + 1;
                const isActive    = n === step;
                const isCompleted = n < step;
                return (
                  <li key={n} className="flex items-center">
                    <button
                      onClick={() => goTo(n)}
                      className="flex flex-col items-center px-2 py-1"
                    >
                      <span
                        className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold transition ${
                          isActive    ? "bg-[#C0392B] text-white"
                          : isCompleted ? "bg-white/20 text-white"
                          : "bg-white/10 text-white/40"
                        }`}
                      >
                        {isCompleted ? "✓" : n}
                      </span>
                      <span className={`mt-0.5 whitespace-nowrap text-[10px] ${
                        isActive ? "text-white font-medium" : isCompleted ? "text-white/60" : "text-white/30"
                      }`}>
                        {label}
                      </span>
                    </button>
                    {i < STEPS.length - 1 && (
                      <div className={`h-px w-4 transition ${n < step ? "bg-white/30" : "bg-white/10"}`} />
                    )}
                  </li>
                );
              })}
            </ol>
          </nav>

          {/* Mobile step indicator */}
          <p className="text-sm text-white/70 md:hidden">
            Step {step} of {STEPS.length}: <strong className="text-white">{STEPS[step - 1]}</strong>
          </p>

          {/* Save Draft */}
          <div className="flex shrink-0 items-center gap-3">
            {draftNote && (
              <span className="text-xs text-emerald-400">{draftNote}</span>
            )}
            <button
              onClick={handleSaveDraft}
              disabled={isSaving}
              className="rounded-md border border-white/20 px-3 py-1.5 text-xs font-medium text-white/80 transition hover:bg-white/10 disabled:opacity-50"
            >
              {isSaving ? "Saving…" : "Save Draft"}
            </button>
          </div>
        </div>
      </header>

      {/* Draft restore banner */}
      {draftRestorePrompt && (
        <div className="border-b border-amber-200 bg-amber-50 px-6 py-3 print:hidden">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
            <p className="text-sm text-amber-800">
              <strong>Draft found.</strong> Continue where you left off?
            </p>
            <div className="flex gap-2">
              <button
                onClick={restoreDraft}
                className="rounded bg-amber-600 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-700"
              >
                Restore Draft
              </button>
              <button
                onClick={() => setDraftRestorePrompt(false)}
                className="rounded border border-amber-300 px-3 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-100"
              >
                Start Fresh
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Scrollable content ── */}
      <div className="flex-1 bg-gray-50 print:bg-white">
        <div className="mx-auto max-w-3xl px-4 py-8 print:max-w-full print:px-8 print:py-4">
          {/* Step title */}
          <div className="mb-6 print:hidden">
            <h1 className="text-xl font-bold text-[#1B2A4A]">{STEPS[step - 1]}</h1>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-gray-200">
              <div
                className="h-full rounded-full bg-[#C0392B] transition-all duration-500"
                style={{ width: `${(step / STEPS.length) * 100}%` }}
              />
            </div>
          </div>

          {renderStep()}
        </div>
      </div>

      {/* ── Sticky footer ── */}
      {step < 7 && (
        <footer className="sticky bottom-0 z-10 border-t border-gray-200 bg-white print:hidden">
          <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
            <button
              onClick={() => goTo(step - 1)}
              disabled={step === 1}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-0"
            >
              ← Back
            </button>
            <button
              onClick={() => goTo(step + 1)}
              className="rounded-lg bg-[#C0392B] px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#a93226]"
            >
              {step === 6 ? "View Results →" : "Next →"}
            </button>
          </div>
        </footer>
      )}
      {step === 7 && (
        <footer className="sticky bottom-0 z-10 border-t border-gray-200 bg-white print:hidden">
          <div className="mx-auto flex max-w-3xl items-center px-4 py-3">
            <button
              onClick={() => goTo(6)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
            >
              ← Back to Growth
            </button>
          </div>
        </footer>
      )}
    </div>
  );
}
