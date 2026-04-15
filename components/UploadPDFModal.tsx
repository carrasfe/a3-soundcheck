"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { INITIAL_FORM_DATA } from "@/app/evaluations/new/types";
import type { EvalFormData } from "@/app/evaluations/new/types";
import { buildScoringInputs } from "@/app/evaluations/new/types";
import { saveEvaluation } from "@/app/evaluations/new/actions";
import { calculateScore } from "@/lib/scoring-engine";

// ─── Field definitions (mirrors UploadScorecardModal) ────────────────────────

type FieldDef = { label: string; key: keyof EvalFormData; group: string };

const FIELD_DEFS: FieldDef[] = [
  { label: "Artist Name",              key: "artist_name",               group: "Artist Info" },
  { label: "Genre",                    key: "genre",                     group: "Artist Info" },
  { label: "Management Company",       key: "management_company",        group: "Artist Info" },
  { label: "Manager Names",            key: "manager_names",             group: "Artist Info" },
  { label: "Booking Agent",            key: "booking_agent",             group: "Artist Info" },
  { label: "Merch Provider",           key: "merch_provider",            group: "Artist Info" },
  { label: "VIP Level",                key: "vip_level",                 group: "Artist Info" },
  { label: "Venue Capacity",           key: "venue_capacity",            group: "Touring" },
  { label: "Sell-Through %",           key: "sell_through_pct",          group: "Touring" },
  { label: "# Tour Dates",             key: "num_dates",                 group: "Touring" },
  { label: "Market Coverage",          key: "market_coverage",           group: "Touring" },
  { label: "Resale Situation",         key: "resale_situation",          group: "Touring" },
  { label: "Face Value ($)",           key: "face_value",                group: "Touring" },
  { label: "Resale Price ($)",         key: "resale_price",              group: "Touring" },
  { label: "Spotify Monthly Listeners",key: "spotify_monthly_listeners", group: "Fan Engagement" },
  { label: "Fan Conversion Ratio",      key: "fan_concentration_ratio",   group: "Fan Engagement" },
  { label: "Fan Identity Score",       key: "p2_fan_identity",           group: "Fan Engagement" },
  { label: "IG Followers",             key: "ig_followers",              group: "Fan Engagement" },
  { label: "IG ER %",                  key: "ig_er_pct",                 group: "Fan Engagement" },
  { label: "TikTok Followers",         key: "tiktok_followers",          group: "Fan Engagement" },
  { label: "TikTok Avg Views",         key: "tiktok_avg_views",          group: "Fan Engagement" },
  { label: "YouTube Subscribers",      key: "youtube_subscribers",       group: "Fan Engagement" },
  { label: "YouTube ER %",             key: "youtube_er_pct",            group: "Fan Engagement" },
  { label: "Reddit Members",           key: "reddit_members",            group: "Fan Engagement" },
  { label: "Discord Members",          key: "discord_members",           group: "Fan Engagement" },
  { label: "Merch Sentiment",          key: "merch_sentiment",           group: "Fan Engagement" },
  { label: "Store Quality",            key: "store_quality",             group: "E-Commerce" },
  { label: "Merch Range",              key: "merch_range",               group: "E-Commerce" },
  { label: "Price Point High ($)",     key: "price_point_highest",       group: "E-Commerce" },
  { label: "D2C Level",                key: "d2c_level",                 group: "E-Commerce" },
  { label: "Spotify YoY %",            key: "spotify_yoy_pct",           group: "Growth" },
  { label: "Venue Progression",        key: "venue_progression",         group: "Growth" },
  { label: "IG 30-Day Gain",           key: "ig_30day_gain",             group: "Growth" },
  { label: "Press Score",              key: "press_score",               group: "Growth" },
  { label: "Playlist Score",           key: "playlist_score",            group: "Growth" },
  { label: "Ages 13–17 (%)",           key: "d_13_17_m",                 group: "Demographics" },
  { label: "Ages 18–24 (%)",           key: "d_18_24_m",                 group: "Demographics" },
  { label: "Ages 25–34 (%)",           key: "d_25_34_m",                 group: "Demographics" },
  { label: "Ages 35–44 (%)",           key: "d_35_44_m",                 group: "Demographics" },
  { label: "Ages 45–64 (%)",           key: "d_45_64_m",                 group: "Demographics" },
  { label: "Ages 65+ (%)",             key: "d_65_m",                    group: "Demographics" },
  { label: "White (%)",                key: "eth_white",                 group: "Demographics" },
  { label: "Hispanic (%)",             key: "eth_hispanic",              group: "Demographics" },
  { label: "African American (%)",     key: "eth_aa",                    group: "Demographics" },
  { label: "Asian (%)",                key: "eth_asian",                 group: "Demographics" },
];

const GROUPS = [
  "Artist Info", "Touring", "Fan Engagement", "E-Commerce", "Growth", "Demographics",
] as const;

// Fields that are enum-typed get a <select> when edited
const ENUM_OPTIONS: Partial<Record<keyof EvalFormData, Array<{ value: string; label: string }>>> = {
  vip_level: [
    { value: "none",           label: "None" },
    { value: "offered_before", label: "Offered Before" },
    { value: "basic",          label: "Basic" },
    { value: "premium_mg",     label: "Premium (MG)" },
    { value: "tiered_high",    label: "Tiered (High)" },
  ],
  resale_situation: [
    { value: "not_sold_out",  label: "Not Sold Out" },
    { value: "some_sold_out", label: "Some Sold Out" },
    { value: "all_sold_out",  label: "All Sold Out" },
  ],
  venue_progression: [
    { value: "smaller",       label: "Smaller" },
    { value: "same",          label: "Same" },
    { value: "slight_step_up",label: "Slight Step Up" },
    { value: "major_jump",    label: "Major Jump" },
    { value: "tier_change",   label: "Tier Change" },
  ],
};

function displayValue(key: keyof EvalFormData, fd: EvalFormData): string {
  const raw = fd[key];
  if (typeof raw === "boolean") return raw ? "Yes" : "No";
  if (raw == null || raw === "") return "";
  const opts = ENUM_OPTIONS[key];
  if (opts) return opts.find((o) => o.value === raw)?.label ?? String(raw);
  return String(raw);
}

function hasValue(key: keyof EvalFormData, fd: EvalFormData): boolean {
  // Enum fields always have a value (they have defaults)
  if (ENUM_OPTIONS[key]) return true;
  const raw = fd[key];
  return typeof raw === "boolean" ? false : (raw !== "" && raw != null);
}

function countFilled(fd: EvalFormData): number {
  return FIELD_DEFS.filter((f) => hasValue(f.key, fd)).length;
}

// ─── Score helpers ────────────────────────────────────────────────────────────

function recalcScore(fd: EvalFormData): { score: number; tier: string } | null {
  try {
    const inputs = buildScoringInputs(fd);
    if (!inputs) return null;
    const r = calculateScore(inputs);
    return { score: r.total_score, tier: r.tier_label };
  } catch {
    return null;
  }
}

// ─── Tier badge styles ────────────────────────────────────────────────────────

const TIER_STYLES: Record<string, string> = {
  Priority: "bg-[#C0392B] text-white",
  Active:   "bg-[#1B2A4A] text-white",
  Watch:    "bg-gray-200 text-gray-700",
  Pass:     "bg-gray-100 text-gray-500",
};

// ─── Types ────────────────────────────────────────────────────────────────────

type ModalStep = "upload" | "review" | "processing" | "complete";

interface FileItem {
  uid: string;
  file: File;
  status: "parsing" | "ok" | "error";
  fd: EvalFormData | null;
  pdfScore: number | null;
  pdfTier: string | null;
  recalc: { score: number; tier: string } | null;
  parseWarnings: string[];
  error: string | null;
}

interface ProcessItem {
  uid: string;
  artistName: string;
  fd: EvalFormData;
  status: "pending" | "saving" | "done" | "error";
  evalId: string | null;
  score: number | null;
  tier: string | null;
  error: string | null;
  debugInfo: string | null;
}

interface Props { onClose: () => void; }

// ─── SVG icons ────────────────────────────────────────────────────────────────

function IconCheck({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
    </svg>
  );
}

function IconX({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
    </svg>
  );
}

function Spinner({ className }: { className?: string }) {
  return <div className={`animate-spin rounded-full border-2 border-[#C0392B] border-t-transparent ${className}`} />;
}

// ─── Inline field editor ──────────────────────────────────────────────────────

interface FieldRowProps {
  def: FieldDef;
  fd: EvalFormData;
  isEditing: boolean;
  onStartEdit: () => void;
  onCommit: (val: string) => void;
}

function FieldRow({ def, fd, isEditing, onStartEdit, onCommit }: FieldRowProps) {
  const raw = fd[def.key];
  const val = displayValue(def.key, fd);
  const found = hasValue(def.key, fd);
  const opts = ENUM_OPTIONS[def.key];

  const [draft, setDraft] = useState(String(raw ?? ""));

  const commit = () => onCommit(draft);

  if (isEditing) {
    if (opts) {
      return (
        <div className="flex items-start gap-1.5">
          <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-green-500" />
          <div className="min-w-0 flex-1">
            <p className="text-[9px] text-gray-400">{def.label}</p>
            <select
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => onCommit(draft)}
              className="mt-0.5 w-full rounded border border-[#1B2A4A] px-1.5 py-0.5 text-[10px] text-gray-800 focus:outline-none"
            >
              {opts.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>
      );
    }
    return (
      <div className="flex items-start gap-1.5">
        <span className={`mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${found ? "bg-green-500" : "bg-amber-400"}`} />
        <div className="min-w-0 flex-1">
          <p className="text-[9px] text-gray-400">{def.label}</p>
          <input
            autoFocus
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") onCommit(String(raw ?? "")); }}
            className="mt-0.5 w-full rounded border border-[#1B2A4A] px-1.5 py-0.5 text-[10px] text-gray-800 focus:outline-none"
          />
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={onStartEdit}
      className="flex w-full items-start gap-1.5 rounded px-0.5 py-0.5 text-left transition hover:bg-white/60"
      title="Click to edit"
    >
      <span className={`mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${found ? "bg-green-500" : "bg-amber-400"}`} />
      <div className="min-w-0">
        <p className="text-[9px] text-gray-400">{def.label}</p>
        <p className="truncate text-[10px] font-medium text-gray-700">
          {val || <span className="italic text-gray-300">—</span>}
        </p>
      </div>
    </button>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function UploadPDFModal({ onClose }: Props) {
  const router = useRouter();
  const [step, setStep]         = useState<ModalStep>("upload");
  const [fileItems, setFileItems] = useState<FileItem[]>([]);
  const [expandedUids, setExpandedUids] = useState<Set<string>>(new Set());
  const [editingField, setEditingField] = useState<{ uid: string; key: keyof EvalFormData } | null>(null);
  const [processItems, setProcessItems] = useState<ProcessItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const dropRef    = useRef<HTMLInputElement>(null);
  const addMoreRef = useRef<HTMLInputElement>(null);

  // ── File management ──────────────────────────────────────────────────────────

  const addFiles = (files: File[]) => {
    const toAdd: FileItem[] = files
      .filter((f) => f.name.toLowerCase().endsWith(".pdf"))
      .map((f) => ({
        uid: `${f.name}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file: f,
        status: "parsing" as const,
        fd: null, pdfScore: null, pdfTier: null, recalc: null,
        parseWarnings: [], error: null,
      }));
    if (!toAdd.length) return;
    setFileItems((prev) => [...prev, ...toAdd]);

    for (const item of toAdd) {
      (async () => {
        const { parsePDFScorecard } = await import("@/lib/parse-scorecard-pdf");
        const result = await parsePDFScorecard(item.file);
        const rc = recalcScore(result.fd);
        setFileItems((prev) =>
          prev.map((fi) =>
            fi.uid === item.uid
              ? { ...fi, status: "ok", fd: result.fd, pdfScore: result.pdfScore,
                  pdfTier: result.pdfTier, recalc: rc, parseWarnings: result.warnings }
              : fi
          )
        );
      })().catch((e: unknown) => {
        setFileItems((prev) =>
          prev.map((fi) =>
            fi.uid === item.uid
              ? { ...fi, status: "error", error: e instanceof Error ? e.message : "Parse failed" }
              : fi
          )
        );
      });
    }
  };

  // Update a single field in one file's fd and recompute score
  const updateField = useCallback((uid: string, key: keyof EvalFormData, value: string) => {
    setFileItems((prev) =>
      prev.map((fi) => {
        if (fi.uid !== uid || !fi.fd) return fi;
        const newFd = { ...fi.fd, [key]: value };
        return { ...fi, fd: newFd, recalc: recalcScore(newFd) };
      })
    );
    setEditingField(null);
  }, []);

  const removeFile = (uid: string) => {
    setFileItems((prev) => prev.filter((fi) => fi.uid !== uid));
    setExpandedUids((prev) => { const s = new Set(prev); s.delete(uid); return s; });
  };

  const toggleExpanded = (uid: string) => {
    setExpandedUids((prev) => {
      const s = new Set(prev);
      s.has(uid) ? s.delete(uid) : s.add(uid);
      return s;
    });
  };

  // ── Processing ───────────────────────────────────────────────────────────────

  const runProcessing = async () => {
    const validItems = fileItems.filter((fi) => fi.status === "ok" && fi.fd);
    const items: ProcessItem[] = validItems.map((fi) => ({
      uid: fi.uid, artistName: fi.fd!.artist_name, fd: fi.fd!,
      status: "pending", evalId: null, score: null, tier: null, error: null, debugInfo: null,
    }));

    setProcessItems(items);
    setStep("processing");
    setIsProcessing(true);

    for (let i = 0; i < items.length; i++) {
      setProcessItems((prev) => prev.map((it, idx) => idx === i ? { ...it, status: "saving" } : it));

      let score: number | null = null;
      let tier: string | null = null;
      try {
        const inputs = buildScoringInputs(items[i].fd);
        if (inputs) { const r = calculateScore(inputs); score = r.total_score; tier = r.tier_label; }
      } catch (scoreErr) {
        console.error(
          `[UploadPDFModal] Pre-save scoring error for "${items[i].artistName}":`,
          scoreErr instanceof Error ? scoreErr.stack ?? scoreErr.message : String(scoreErr),
          "\nForm data genre:", items[i].fd.genre,
        );
      }

      const result = await saveEvaluation(items[i].fd, "complete");

      if (result.error || !result.id) {
        const errMsg = result.error ?? "Unknown error — no ID returned";
        console.error(
          `[UploadPDFModal] Save failed for "${items[i].artistName}":`,
          errMsg,
          result.debugInfo ? `\nDebug info:\n${result.debugInfo}` : ""
        );
      } else {
        console.log(
          `[UploadPDFModal] Saved "${items[i].artistName}" → id=${result.id}`,
          { score, tier }
        );
      }

      setProcessItems((prev) =>
        prev.map((it, idx) =>
          idx !== i ? it
          : result.error || !result.id
            ? {
                ...it,
                status: "error",
                error: result.error ?? "Unknown error — no ID returned",
                debugInfo: result.debugInfo ?? null,
              }
            : { ...it, status: "done", evalId: result.id, score, tier, debugInfo: null }
        )
      );
    }

    setIsProcessing(false);
    setStep("complete");
  };

  const resetForMore = () => {
    setFileItems([]); setProcessItems([]); setExpandedUids(new Set()); setStep("upload");
  };

  // ── Derived ──────────────────────────────────────────────────────────────────

  const okItems      = fileItems.filter((fi) => fi.status === "ok");
  const parsingItems = fileItems.filter((fi) => fi.status === "parsing");
  const doneCount    = processItems.filter((p) => p.status === "done").length;
  const failCount    = processItems.filter((p) => p.status === "error").length;
  const savingIdx    = processItems.findIndex((p) => p.status === "saving");

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !isProcessing) onClose(); }}
    >
      <div className="relative flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl bg-white shadow-2xl">

        {/* ── Modal header ── */}
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-[#1B2A4A]">
              {step === "upload"     ? "Import PDF Scorecards" :
               step === "review"     ? "Review & Edit" :
               step === "processing" ? "Importing…" :
                                       "Import Complete"}
            </h2>
            <p className="mt-0.5 text-xs text-gray-400">
              {step === "upload" && fileItems.length > 0 && (
                parsingItems.length > 0
                  ? `Parsing ${parsingItems.length} file${parsingItems.length !== 1 ? "s" : ""}…`
                  : `${okItems.length} of ${fileItems.length} parsed successfully`
              )}
              {step === "review" && `${okItems.length} evaluation${okItems.length !== 1 ? "s" : ""} ready — review parsed values before saving`}
              {step === "processing" && (
                savingIdx >= 0
                  ? `Saving ${savingIdx + 1} of ${processItems.length}…`
                  : `Processing ${processItems.length} evaluation${processItems.length !== 1 ? "s" : ""}…`
              )}
              {step === "complete" && `${doneCount} saved · ${failCount} failed`}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="rounded-full p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 disabled:opacity-40"
          >
            <IconX className="h-5 w-5" />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto">

          {/* ── Step 1: Upload ── */}
          {step === "upload" && (
            <div className="space-y-4 px-6 py-5">
              {/* Drop zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => { e.preventDefault(); setIsDragging(false); addFiles(Array.from(e.dataTransfer.files)); }}
                onClick={() => dropRef.current?.click()}
                className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed py-10 transition ${
                  isDragging
                    ? "border-[#C0392B] bg-red-50"
                    : "border-gray-300 bg-gray-50 hover:border-[#1B2A4A] hover:bg-gray-100"
                }`}
              >
                {/* PDF icon */}
                <svg className="h-10 w-10 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M9 13h6M9 17h4" />
                </svg>
                <div className="text-center">
                  <p className="text-sm font-semibold text-gray-700">Drop A3 Soundcheck PDFs here</p>
                  <p className="mt-0.5 text-xs text-gray-500">Multiple files supported — or click to browse</p>
                </div>
              </div>
              <input ref={dropRef} type="file" accept=".pdf" multiple className="hidden"
                onChange={(e) => { if (e.target.files) { addFiles(Array.from(e.target.files)); e.target.value = ""; } }} />

              {/* File list */}
              {fileItems.length > 0 && (
                <div className="space-y-2">
                  {fileItems.map((item) => (
                    <div key={item.uid}
                      className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 ${
                        item.status === "ok"    ? "border-green-200 bg-green-50" :
                        item.status === "error" ? "border-red-200 bg-red-50" :
                                                  "border-gray-200 bg-gray-50"
                      }`}
                    >
                      <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
                        {item.status === "parsing" && <Spinner className="h-4 w-4" />}
                        {item.status === "ok"      && <IconCheck className="h-4 w-4 text-green-600" />}
                        {item.status === "error"   && <IconX className="h-4 w-4 text-red-500" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        {item.status === "ok" && item.fd ? (
                          <>
                            <p className="text-sm font-semibold text-gray-900">{item.fd.artist_name || "(unnamed)"}</p>
                            <p className="text-xs text-gray-500">{item.fd.genre || "—"} · {item.file.name}</p>
                          </>
                        ) : (
                          <>
                            <p className="truncate text-sm font-medium text-gray-700" title={item.file.name}>
                              {item.file.name}
                            </p>
                            {item.status === "error"   && <p className="text-xs text-red-600">{item.error}</p>}
                            {item.status === "parsing" && <p className="text-xs text-gray-400">Parsing…</p>}
                          </>
                        )}
                      </div>
                      <button onClick={() => removeFile(item.uid)}
                        className="mt-0.5 shrink-0 text-base leading-none text-gray-400 hover:text-red-500">
                        ×
                      </button>
                    </div>
                  ))}

                  <button onClick={() => addMoreRef.current?.click()}
                    className="w-full rounded-lg border border-dashed border-gray-300 py-2 text-xs font-medium text-gray-500 transition hover:border-[#1B2A4A] hover:text-[#1B2A4A]">
                    + Add More Files
                  </button>
                  <input ref={addMoreRef} type="file" accept=".pdf" multiple className="hidden"
                    onChange={(e) => { if (e.target.files) { addFiles(Array.from(e.target.files)); e.target.value = ""; } }} />
                </div>
              )}

              <p className="text-center text-xs text-gray-400">
                Accepts PDFs generated by A3 Soundcheck only
              </p>
            </div>
          )}

          {/* ── Step 2: Review ── */}
          {step === "review" && (
            <div className="divide-y divide-gray-100">
              {okItems.map((item) => {
                const fd       = item.fd!;
                const filled   = countFilled(fd);
                const expanded = expandedUids.has(item.uid);

                // Score comparison
                const pdfScoreStr   = item.pdfScore != null ? item.pdfScore.toFixed(2) : null;
                const recalcStr     = item.recalc != null ? item.recalc.score.toFixed(2) : null;
                const scoreDiff     = item.pdfScore != null && item.recalc != null
                  ? Math.abs(item.pdfScore - item.recalc.score)
                  : null;
                const showScoreWarn = scoreDiff != null && scoreDiff > 0.1;

                return (
                  <div key={item.uid}>
                    {/* Row header */}
                    <div className="flex items-center gap-3 px-6 py-3.5 hover:bg-gray-50">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-[#1B2A4A]">
                          {fd.artist_name || <span className="italic text-gray-400">Unnamed</span>}
                        </p>
                        <p className="text-xs text-gray-500">{fd.genre || "—"}</p>
                      </div>

                      {/* Score badges */}
                      <div className="shrink-0 flex flex-col items-end gap-1">
                        {item.recalc && (
                          <div className="flex items-center gap-2">
                            <span className="text-xs tabular-nums text-gray-500">
                              {recalcStr}
                            </span>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${TIER_STYLES[item.recalc.tier] ?? "bg-gray-100 text-gray-500"}`}>
                              {item.recalc.tier === "Pass" ? "Below" : item.recalc.tier}
                            </span>
                          </div>
                        )}
                        {showScoreWarn && (
                          <span className="text-[10px] text-amber-600">
                            PDF: {pdfScoreStr} · diff {scoreDiff!.toFixed(2)}
                          </span>
                        )}
                      </div>

                      <div className="shrink-0 text-xs tabular-nums text-gray-400">
                        {filled}/{FIELD_DEFS.length}
                      </div>
                      <button onClick={() => toggleExpanded(item.uid)}
                        className="shrink-0 text-xs text-gray-400 hover:text-[#1B2A4A]">
                        {expanded ? "▲ Hide" : "▼ Edit"}
                      </button>
                      <button onClick={() => removeFile(item.uid)}
                        className="shrink-0 text-base leading-none text-gray-300 hover:text-red-500">
                        ×
                      </button>
                    </div>

                    {/* Expanded detail */}
                    {expanded && (
                      <div className="border-t border-gray-100 bg-gray-50 px-6 py-4 space-y-4">
                        {/* Score comparison banner */}
                        {showScoreWarn && (
                          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                            <strong>Score mismatch:</strong> Recalculated score ({recalcStr}) differs from
                            PDF score ({pdfScoreStr}) by {scoreDiff!.toFixed(2)}. The recalculated
                            score will be saved. This usually means some input fields were not fully
                            recovered — check the fields below.
                          </div>
                        )}

                        {/* Parse warnings */}
                        {item.parseWarnings.length > 0 && (
                          <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
                            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-blue-700">
                              Parser Notes
                            </p>
                            {item.parseWarnings.map((w, i) => (
                              <p key={i} className="text-[10px] text-blue-700">· {w}</p>
                            ))}
                          </div>
                        )}

                        {/* Field grid by section — all fields editable */}
                        {GROUPS.map((group) => {
                          const gFields = FIELD_DEFS.filter((f) => f.group === group);
                          return (
                            <div key={group}>
                              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-[#1B2A4A]">
                                {group}
                              </p>
                              <div className="grid grid-cols-3 gap-x-4 gap-y-0.5">
                                {gFields.map((f) => (
                                  <FieldRow
                                    key={f.key}
                                    def={f}
                                    fd={fd}
                                    isEditing={
                                      editingField?.uid === item.uid &&
                                      editingField?.key === f.key
                                    }
                                    onStartEdit={() =>
                                      setEditingField({ uid: item.uid, key: f.key })
                                    }
                                    onCommit={(val) => updateField(item.uid, f.key, val)}
                                  />
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Step 3: Processing ── */}
          {step === "processing" && (
            <div className="space-y-2.5 px-6 py-5">
              {processItems.map((item, i) => (
                <div key={item.uid}
                  className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${
                    item.status === "done"   ? "border-green-200 bg-green-50" :
                    item.status === "error"  ? "border-red-200 bg-red-50" :
                    item.status === "saving" ? "border-[#1B2A4A]/20 bg-[#1B2A4A]/5" :
                                              "border-gray-200 bg-white opacity-50"
                  }`}
                >
                  <div className="flex h-4 w-4 shrink-0 items-center justify-center">
                    {item.status === "pending" && <div className="h-3 w-3 rounded-full border-2 border-gray-300" />}
                    {item.status === "saving"  && <Spinner className="h-4 w-4" />}
                    {item.status === "done"    && <IconCheck className="h-4 w-4 text-green-600" />}
                    {item.status === "error"   && <IconX className="h-4 w-4 text-red-500" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-800">{item.artistName || `File ${i + 1}`}</p>
                    {item.status === "error"  && <p className="text-xs text-red-600">{item.error}</p>}
                    {item.status === "saving" && <p className="text-xs text-gray-400">Saving…</p>}
                  </div>
                  {item.status === "done" && item.score != null && (
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-bold text-[#1B2A4A]">{item.score.toFixed(2)}</p>
                      {item.tier && (
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${TIER_STYLES[item.tier] ?? "bg-gray-100 text-gray-500"}`}>
                          {item.tier === "Pass" ? "Below" : item.tier}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ── Step 4: Complete ── */}
          {step === "complete" && (
            <div className="px-6 py-5">
              <div className={`mb-4 rounded-lg border px-4 py-3 text-sm font-medium ${
                failCount === 0
                  ? "border-green-200 bg-green-50 text-green-800"
                  : "border-amber-200 bg-amber-50 text-amber-800"
              }`}>
                Successfully imported {doneCount} evaluation{doneCount !== 1 ? "s" : ""}.
                {failCount > 0 && ` ${failCount} failed.`}
              </div>

              <div className="space-y-2">
                {processItems.map((item) => (
                  <div
                    key={item.uid}
                    className={`rounded-lg border px-4 py-3 ${
                      item.status === "done"
                        ? "border-green-200 bg-green-50"
                        : "border-red-200 bg-red-50"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-4 w-4 shrink-0 items-center justify-center">
                        {item.status === "done"
                          ? <IconCheck className="h-4 w-4 text-green-600" />
                          : <IconX className="h-4 w-4 text-red-500" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-gray-800">
                          {item.artistName || "(unnamed)"}
                        </p>
                      </div>
                      {item.status === "done" && item.score != null && (
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-bold text-[#1B2A4A]">{item.score.toFixed(2)}</p>
                          {item.tier && (
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${TIER_STYLES[item.tier] ?? "bg-gray-100 text-gray-500"}`}>
                              {item.tier === "Pass" ? "Below" : item.tier}
                            </span>
                          )}
                        </div>
                      )}
                      <span className={`shrink-0 text-xs font-semibold ${item.status === "done" ? "text-green-700" : "text-red-700"}`}>
                        {item.status === "done" ? "✓ Saved" : "✗ Failed"}
                      </span>
                    </div>

                    {/* Error detail — shown inline for failed items */}
                    {item.status === "error" && item.error && (
                      <div className="mt-2 ml-7">
                        <p className="text-xs font-medium text-red-700">{item.error}</p>
                        {item.debugInfo && (
                          <details className="mt-1">
                            <summary className="cursor-pointer text-[10px] text-red-500 hover:text-red-700">
                              Show debug info
                            </summary>
                            <pre className="mt-1 overflow-x-auto rounded bg-red-100 p-2 text-[9px] leading-relaxed text-red-800 whitespace-pre-wrap">
                              {item.debugInfo}
                            </pre>
                          </details>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-gray-200 px-6 py-4">

          {step === "upload" && (
            <>
              <button onClick={onClose}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50">
                Cancel
              </button>
              <button
                onClick={() => setStep("review")}
                disabled={okItems.length === 0 || parsingItems.length > 0}
                className="rounded-lg bg-[#C0392B] px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#a93226] disabled:opacity-40"
              >
                Review {okItems.length > 0 ? `${okItems.length} ` : ""}
                Evaluation{okItems.length !== 1 ? "s" : ""} →
              </button>
            </>
          )}

          {step === "review" && (
            <>
              <button onClick={() => setStep("upload")}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50">
                ← Back
              </button>
              <button
                onClick={runProcessing}
                disabled={okItems.length === 0}
                className="rounded-lg bg-[#C0392B] px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#a93226] disabled:opacity-40"
              >
                Import {okItems.length} Evaluation{okItems.length !== 1 ? "s" : ""}
              </button>
            </>
          )}

          {step === "processing" && (
            <p className="flex-1 text-center text-xs text-gray-400">
              Do not close this window while importing…
            </p>
          )}

          {step === "complete" && (
            <>
              <button onClick={resetForMore}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50">
                Import More
              </button>
              <button
                onClick={() => { onClose(); router.push("/"); }}
                className="rounded-lg bg-[#1B2A4A] px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#152238]"
              >
                View Dashboard
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
