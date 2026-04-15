"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { INITIAL_FORM_DATA } from "@/app/evaluations/new/types";
import type { EvalFormData, VipLevel, ResaleSituation } from "@/app/evaluations/new/types";
import { buildScoringInputs } from "@/app/evaluations/new/types";
import { saveEvaluation } from "@/app/evaluations/new/actions";
import { calculateScore } from "@/lib/scoring-engine";

// ── Cell parsers ───────────────────────────────────────────────

function cellStr(sheet: Record<string, any>, ref: string): string {
  const c = sheet[ref];
  if (!c || c.v == null) return "";
  return String(c.v).trim();
}

function cellNum(sheet: Record<string, any>, ref: string): string {
  const c = sheet[ref];
  if (!c || c.v == null) return "";
  if (typeof c.v === "number") return String(c.v);
  return String(c.v).trim().replace(/[^0-9.\-]/g, "");
}

// ── Enum mappers ───────────────────────────────────────────────

function mapVipLevel(s: string): VipLevel {
  const l = s.toLowerCase();
  if (!l || l === "none" || l.includes("no vip") || l.includes("n/a")) return "none";
  if (l.includes("tiered") || l.includes("high")) return "tiered_high";
  if (l.includes("premium") || l.includes("mg")) return "premium_mg";
  if (l.includes("offered") || l.includes("before") || l.includes("prev")) return "offered_before";
  if (l.includes("basic")) return "basic";
  return "none";
}

function mapResale(s: string): ResaleSituation {
  const l = s.toLowerCase();
  if (l.includes("all") || l.includes("every")) return "all_sold_out";
  if (l.includes("some") || l.includes("part") || l.includes("few")) return "some_sold_out";
  return "not_sold_out";
}

function mapVenueProgression(s: string): string {
  const l = s.toLowerCase();
  if (l.includes("smaller") || l.includes("step down")) return "smaller";
  if (l.includes("major") || l.includes("big jump")) return "major_jump";
  if (l.includes("tier") && l.includes("change")) return "tier_change";
  if (l.includes("slight") || l.includes("step up")) return "slight_step_up";
  if (l.includes("same")) return "same";
  if (["smaller","same","slight_step_up","major_jump","tier_change"].includes(l.replace(/\s+/g,"_"))) return l.replace(/\s+/g,"_");
  return "same";
}

function mapAlbumCycle(s: string): string {
  const l = s.toLowerCase();
  if (!l) return "";
  if (l.includes("peak") || l.includes("declin")) return "peak_declining";
  if (l.includes("norm")) return "normalizing";
  if (l.includes("antic")) return "anticipation";
  return "";
}

// ── Parser ─────────────────────────────────────────────────────

async function parseScorecard(file: File): Promise<EvalFormData> {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });

  const s = wb.Sheets["Artist Scoring"];
  if (!s) throw new Error('Required sheet "Artist Scoring" not found.');

  const d = wb.Sheets["Audience Demographics"];
  const albumCycleRaw = mapAlbumCycle(cellStr(s, "B53"));

  const fd: EvalFormData = {
    ...INITIAL_FORM_DATA,
    artist_name:              cellStr(s, "B3"),
    genre:                    cellStr(s, "B4"),
    management_company:       cellStr(s, "B5"),
    manager_names:            cellStr(s, "B6"),
    other_mgmt_artists:       cellStr(s, "B7"),
    booking_agent:            cellStr(s, "B8"),
    other_agent_artists:      cellStr(s, "B9"),
    merch_provider:           cellStr(s, "B10"),
    vip_level:                mapVipLevel(cellStr(s, "B12")),
    venue_capacity:           cellNum(s, "B16"),
    sell_through_pct:         cellNum(s, "B17"),
    num_dates:                cellNum(s, "B18"),
    market_coverage:          cellNum(s, "C19"),
    resale_situation:         mapResale(cellStr(s, "B20")),
    face_value:               cellNum(s, "B21"),
    resale_price:             cellNum(s, "B22"),
    fan_concentration_ratio:  cellNum(s, "B28"),
    p2_fan_identity:          cellNum(s, "C29"),
    ig_er_pct:                cellNum(s, "B30"),
    reddit_members:           cellNum(s, "B31"),
    discord_members:          cellNum(s, "B32"),
    merch_sentiment:          cellNum(s, "C33"),
    tiktok_followers:         cellNum(s, "B34"),
    tiktok_avg_views:         cellNum(s, "B35"),
    youtube_subscribers:      cellNum(s, "B37"),
    youtube_er_pct:           cellNum(s, "B38"),
    store_quality:            cellNum(s, "C43"),
    merch_range:              cellNum(s, "B44"),
    price_point_highest:      cellNum(s, "B45"),
    d2c_level:                cellNum(s, "B46"),
    spotify_monthly_listeners:cellNum(s, "B51"),
    spotify_yoy_pct:          cellNum(s, "B52"),
    album_cycle_override:     albumCycleRaw,
    show_album_cycle:         !!albumCycleRaw,
    venue_progression:        mapVenueProgression(cellStr(s, "B54")),
    ig_followers:             cellNum(s, "B55"),
    ig_30day_gain:            cellNum(s, "B56"),
    press_score:              cellNum(s, "C58"),
    playlist_score:           cellNum(s, "C59"),
  };

  if (d) {
    fd.d_13_17_m = cellNum(d, "B5");  fd.d_13_17_f = cellNum(d, "C5");
    fd.d_18_24_m = cellNum(d, "B6");  fd.d_18_24_f = cellNum(d, "C6");
    fd.d_25_34_m = cellNum(d, "B7");  fd.d_25_34_f = cellNum(d, "C7");
    fd.d_35_44_m = cellNum(d, "B8");  fd.d_35_44_f = cellNum(d, "C8");
    fd.d_45_64_m = cellNum(d, "B9");  fd.d_45_64_f = cellNum(d, "C9");
    fd.d_65_m    = cellNum(d, "B10"); fd.d_65_f    = cellNum(d, "C10");
    fd.eth_white    = cellNum(d, "B13");
    fd.eth_aa       = cellNum(d, "B14");
    fd.eth_hispanic = cellNum(d, "B15");
    fd.eth_asian    = cellNum(d, "B16");
  }

  if (!fd.artist_name) throw new Error("Artist name missing — check cell B3 in 'Artist Scoring' sheet.");
  if (!fd.genre)       throw new Error("Genre missing — check cell B4 in 'Artist Scoring' sheet.");

  return fd;
}

// ── FIELD_DEFS ─────────────────────────────────────────────────

type FieldDef = { label: string; key: keyof EvalFormData; group: string };

const FIELD_DEFS: FieldDef[] = [
  { label: "Artist Name",           key: "artist_name",            group: "Artist Info" },
  { label: "Genre",                 key: "genre",                  group: "Artist Info" },
  { label: "Management Company",    key: "management_company",     group: "Artist Info" },
  { label: "Manager Names",         key: "manager_names",          group: "Artist Info" },
  { label: "Booking Agent",         key: "booking_agent",          group: "Artist Info" },
  { label: "Merch Provider",        key: "merch_provider",         group: "Artist Info" },
  { label: "VIP Level",             key: "vip_level",              group: "Artist Info" },
  { label: "Venue Capacity",        key: "venue_capacity",         group: "Touring" },
  { label: "Sell-Through %",        key: "sell_through_pct",       group: "Touring" },
  { label: "# Dates",               key: "num_dates",              group: "Touring" },
  { label: "Market Coverage",       key: "market_coverage",        group: "Touring" },
  { label: "Resale Situation",      key: "resale_situation",       group: "Touring" },
  { label: "Face Value ($)",        key: "face_value",             group: "Touring" },
  { label: "Resale Price ($)",      key: "resale_price",           group: "Touring" },
  { label: "Spotify Listeners",     key: "spotify_monthly_listeners", group: "Fan Engagement" },
  { label: "Fan Conversion Ratio",    key: "fan_concentration_ratio", group: "Fan Engagement" },
  { label: "Fan Identity Score",    key: "p2_fan_identity",        group: "Fan Engagement" },
  { label: "IG Followers",          key: "ig_followers",           group: "Fan Engagement" },
  { label: "IG ER %",               key: "ig_er_pct",              group: "Fan Engagement" },
  { label: "TikTok Followers",      key: "tiktok_followers",       group: "Fan Engagement" },
  { label: "TikTok Avg Views",      key: "tiktok_avg_views",       group: "Fan Engagement" },
  { label: "YouTube Subscribers",   key: "youtube_subscribers",    group: "Fan Engagement" },
  { label: "YouTube ER %",          key: "youtube_er_pct",         group: "Fan Engagement" },
  { label: "Reddit Members",        key: "reddit_members",         group: "Fan Engagement" },
  { label: "Discord Members",       key: "discord_members",        group: "Fan Engagement" },
  { label: "Merch Sentiment",       key: "merch_sentiment",        group: "Fan Engagement" },
  { label: "Store Quality",         key: "store_quality",          group: "E-Commerce" },
  { label: "Merch Range",           key: "merch_range",            group: "E-Commerce" },
  { label: "Price Point High",      key: "price_point_highest",    group: "E-Commerce" },
  { label: "D2C Level",             key: "d2c_level",              group: "E-Commerce" },
  { label: "Spotify YoY %",         key: "spotify_yoy_pct",        group: "Growth" },
  { label: "Venue Progression",     key: "venue_progression",      group: "Growth" },
  { label: "Album Cycle Override",  key: "album_cycle_override",   group: "Growth" },
  { label: "IG 30-Day Gain",        key: "ig_30day_gain",          group: "Growth" },
  { label: "Press Score",           key: "press_score",            group: "Growth" },
  { label: "Playlist Score",        key: "playlist_score",         group: "Growth" },
  { label: "Ages 13–17",            key: "d_13_17_m",              group: "Demographics" },
  { label: "Ages 18–24",            key: "d_18_24_m",              group: "Demographics" },
  { label: "Ages 25–34",            key: "d_25_34_m",              group: "Demographics" },
  { label: "Ages 35–44",            key: "d_35_44_m",              group: "Demographics" },
  { label: "Ages 45–64",            key: "d_45_64_m",              group: "Demographics" },
  { label: "Ages 65+",              key: "d_65_m",                 group: "Demographics" },
  { label: "Ethnicity Data",        key: "eth_white",              group: "Demographics" },
];

const GROUPS = ["Artist Info", "Touring", "Fan Engagement", "E-Commerce", "Growth", "Demographics"] as const;

// ── Display helpers ────────────────────────────────────────────

function displayValue(key: keyof EvalFormData, fd: EvalFormData): string {
  const raw = fd[key];
  if (typeof raw === "boolean") return raw ? "Yes" : "No";
  if (raw == null || raw === "") return "";
  if (key === "resale_situation") {
    return ({ not_sold_out: "Not Sold Out", some_sold_out: "Some Sold Out", all_sold_out: "All Sold Out" } as Record<string,string>)[String(raw)] ?? String(raw);
  }
  if (key === "vip_level") {
    return ({ none: "None", offered_before: "Offered Before", basic: "Basic", premium_mg: "Premium (MG)", tiered_high: "Tiered (High)" } as Record<string,string>)[String(raw)] ?? String(raw);
  }
  if (key === "venue_progression") {
    return ({ smaller: "Smaller", same: "Same", slight_step_up: "Slight Step Up", major_jump: "Major Jump", tier_change: "Tier Change" } as Record<string,string>)[String(raw)] ?? String(raw);
  }
  if (key === "album_cycle_override") {
    return ({ peak_declining: "Peak/Declining", normalizing: "Normalizing", anticipation: "Anticipation" } as Record<string,string>)[String(raw)] ?? String(raw);
  }
  if (["d_13_17_m","d_18_24_m","d_25_34_m","d_35_44_m","d_45_64_m","d_65_m"].includes(key as string)) {
    const mVal = fd[key] as string;
    const fKey = (key as string).replace("_m", "_f") as keyof EvalFormData;
    const fVal = fd[fKey] as string;
    if (!mVal && !fVal) return "";
    return `${mVal || "0"}% M / ${fVal || "0"}% F`;
  }
  if (key === "eth_white") {
    return [
      fd.eth_white    && `White: ${fd.eth_white}%`,
      fd.eth_aa       && `AA: ${fd.eth_aa}%`,
      fd.eth_hispanic && `Hispanic: ${fd.eth_hispanic}%`,
      fd.eth_asian    && `Asian: ${fd.eth_asian}%`,
    ].filter(Boolean).join(", ") || "";
  }
  return String(raw);
}

function hasValue(key: keyof EvalFormData, fd: EvalFormData): boolean {
  if (key === "vip_level" || key === "resale_situation" || key === "venue_progression") return true;
  return !!displayValue(key, fd);
}

function countFilled(fd: EvalFormData): number {
  return FIELD_DEFS.filter((f) => hasValue(f.key, fd)).length;
}

function getWarnings(fd: EvalFormData): string[] {
  const w: string[] = [];
  const hasDemographics = [
    fd.d_13_17_m, fd.d_18_24_m, fd.d_25_34_m, fd.d_35_44_m,
    fd.d_45_64_m, fd.d_65_m, fd.eth_white, fd.eth_aa, fd.eth_hispanic, fd.eth_asian,
  ].some((v) => v !== "");
  if (!hasDemographics) w.push("No demographics");
  if (!fd.spotify_monthly_listeners && !fd.ig_followers && !fd.tiktok_followers && !fd.youtube_subscribers)
    w.push("No streaming data");
  if (!fd.fan_concentration_ratio) w.push("No FCR");
  if (!fd.venue_capacity) w.push("No touring data");
  return w;
}

// ── Tier badge helper ──────────────────────────────────────────

const TIER_STYLES: Record<string, string> = {
  Priority: "bg-[#C0392B] text-white",
  Active:   "bg-[#1B2A4A] text-white",
  Watch:    "bg-gray-200 text-gray-700",
  Pass:     "bg-gray-100 text-gray-500",
};

// ── Types ──────────────────────────────────────────────────────

type ModalStep = "upload" | "review" | "processing" | "complete";

interface FileItem {
  uid: string;
  file: File;
  status: "parsing" | "ok" | "error";
  fd: EvalFormData | null;
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
}

interface Props {
  onClose: () => void;
}

// ── SVG icons ──────────────────────────────────────────────────

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

// ── Component ──────────────────────────────────────────────────

export default function UploadScorecardModal({ onClose }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<ModalStep>("upload");
  const [fileItems, setFileItems] = useState<FileItem[]>([]);
  const [expandedUids, setExpandedUids] = useState<Set<string>>(new Set());
  const [processItems, setProcessItems] = useState<ProcessItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const dropRef = useRef<HTMLInputElement>(null);
  const addMoreRef = useRef<HTMLInputElement>(null);

  // ── File management ──────────────────────────────────────────

  const addFiles = (files: File[]) => {
    const toAdd: FileItem[] = files
      .filter((f) => f.name.toLowerCase().endsWith(".xlsx"))
      .map((f) => ({
        uid: `${f.name}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file: f,
        status: "parsing" as const,
        fd: null,
        error: null,
      }));
    if (!toAdd.length) return;

    setFileItems((prev) => [...prev, ...toAdd]);

    for (const item of toAdd) {
      parseScorecard(item.file)
        .then((fd) => {
          setFileItems((prev) =>
            prev.map((fi) => fi.uid === item.uid ? { ...fi, status: "ok", fd } : fi)
          );
        })
        .catch((e: unknown) => {
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

  const removeFile = (uid: string) => {
    setFileItems((prev) => prev.filter((fi) => fi.uid !== uid));
    setExpandedUids((prev) => { const next = new Set(prev); next.delete(uid); return next; });
  };

  const toggleExpanded = (uid: string) => {
    setExpandedUids((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  // ── Processing ───────────────────────────────────────────────

  const runProcessing = async () => {
    const validItems = fileItems.filter((fi) => fi.status === "ok" && fi.fd);
    const items: ProcessItem[] = validItems.map((fi) => ({
      uid: fi.uid,
      artistName: fi.fd!.artist_name,
      fd: fi.fd!,
      status: "pending",
      evalId: null,
      score: null,
      tier: null,
      error: null,
    }));

    setProcessItems(items);
    setStep("processing");
    setIsProcessing(true);

    for (let i = 0; i < items.length; i++) {
      setProcessItems((prev) =>
        prev.map((it, idx) => idx === i ? { ...it, status: "saving" } : it)
      );

      // Compute score client-side for display
      let score: number | null = null;
      let tier: string | null = null;
      try {
        const inputs = buildScoringInputs(items[i].fd);
        if (inputs) {
          const r = calculateScore(inputs);
          score = r.total_score;
          tier = r.tier_label;
        }
      } catch { /* ignore — server will also catch this */ }

      const result = await saveEvaluation(items[i].fd, "complete");

      if (result.error || !result.id) {
        setProcessItems((prev) =>
          prev.map((it, idx) =>
            idx === i ? { ...it, status: "error", error: result.error ?? "Unknown error" } : it
          )
        );
      } else {
        setProcessItems((prev) =>
          prev.map((it, idx) =>
            idx === i ? { ...it, status: "done", evalId: result.id, score, tier } : it
          )
        );
      }
    }

    setIsProcessing(false);
    setStep("complete");
  };

  const resetForMore = () => {
    setFileItems([]);
    setProcessItems([]);
    setExpandedUids(new Set());
    setStep("upload");
  };

  // ── Derived ──────────────────────────────────────────────────

  const okItems    = fileItems.filter((fi) => fi.status === "ok");
  const parsingItems = fileItems.filter((fi) => fi.status === "parsing");
  const doneCount  = processItems.filter((p) => p.status === "done").length;
  const failCount  = processItems.filter((p) => p.status === "error").length;
  const savingIdx  = processItems.findIndex((p) => p.status === "saving");

  // ── Render ───────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !isProcessing) onClose(); }}
    >
      <div className="relative flex max-h-[88vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-2xl">

        {/* ── Header ── */}
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-[#1B2A4A]">
              {step === "upload"     ? "Upload Scorecards" :
               step === "review"     ? "Review Batch" :
               step === "processing" ? "Importing…" :
                                       "Import Complete"}
            </h2>
            <p className="mt-0.5 text-xs text-gray-400">
              {step === "upload" && fileItems.length > 0 && (
                parsingItems.length > 0
                  ? `Parsing ${parsingItems.length} file${parsingItems.length !== 1 ? "s" : ""}…`
                  : `${okItems.length} of ${fileItems.length} file${fileItems.length !== 1 ? "s" : ""} parsed successfully`
              )}
              {step === "review" && `${okItems.length} evaluation${okItems.length !== 1 ? "s" : ""} ready to import`}
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
                <svg className="h-10 w-10 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <div className="text-center">
                  <p className="text-sm font-semibold text-gray-700">Drop .xlsx scorecards here</p>
                  <p className="mt-0.5 text-xs text-gray-500">Multiple files supported — or click to browse</p>
                </div>
              </div>
              <input
                ref={dropRef}
                type="file"
                accept=".xlsx"
                multiple
                className="hidden"
                onChange={(e) => { if (e.target.files) { addFiles(Array.from(e.target.files)); e.target.value = ""; } }}
              />

              {/* File list */}
              {fileItems.length > 0 && (
                <div className="space-y-2">
                  {fileItems.map((item) => (
                    <div
                      key={item.uid}
                      className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 ${
                        item.status === "ok"      ? "border-green-200 bg-green-50" :
                        item.status === "error"   ? "border-red-200 bg-red-50" :
                                                    "border-gray-200 bg-gray-50"
                      }`}
                    >
                      {/* Status icon */}
                      <div className="mt-0.5 shrink-0 h-4 w-4 flex items-center justify-center">
                        {item.status === "parsing" && <Spinner className="h-4 w-4" />}
                        {item.status === "ok"      && <IconCheck className="h-4 w-4 text-green-600" />}
                        {item.status === "error"   && <IconX className="h-4 w-4 text-red-500" />}
                      </div>
                      {/* Info */}
                      <div className="min-w-0 flex-1">
                        {item.status === "ok" && item.fd ? (
                          <>
                            <p className="text-sm font-semibold text-gray-900">{item.fd.artist_name}</p>
                            <p className="text-xs text-gray-500">{item.fd.genre} · {item.file.name}</p>
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
                      {/* Remove */}
                      <button
                        onClick={() => removeFile(item.uid)}
                        className="mt-0.5 shrink-0 text-gray-400 hover:text-red-500 leading-none text-base"
                      >
                        ×
                      </button>
                    </div>
                  ))}

                  {/* Add more */}
                  <button
                    onClick={() => addMoreRef.current?.click()}
                    className="w-full rounded-lg border border-dashed border-gray-300 py-2 text-xs font-medium text-gray-500 transition hover:border-[#1B2A4A] hover:text-[#1B2A4A]"
                  >
                    + Add More Files
                  </button>
                  <input
                    ref={addMoreRef}
                    type="file"
                    accept=".xlsx"
                    multiple
                    className="hidden"
                    onChange={(e) => { if (e.target.files) { addFiles(Array.from(e.target.files)); e.target.value = ""; } }}
                  />
                </div>
              )}

              <p className="text-center text-xs text-gray-400">
                Accepts A3 Artist Scoring Template v8 (.xlsx)
              </p>
            </div>
          )}

          {/* ── Step 2: Review ── */}
          {step === "review" && (
            <div className="divide-y divide-gray-100">
              {okItems.map((item) => {
                const fd = item.fd!;
                const filled   = countFilled(fd);
                const warnings = getWarnings(fd);
                const expanded = expandedUids.has(item.uid);
                return (
                  <div key={item.uid}>
                    <div className="flex items-center gap-3 px-6 py-3.5 hover:bg-gray-50">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-[#1B2A4A]">{fd.artist_name}</p>
                        <p className="text-xs text-gray-500">{fd.genre}</p>
                      </div>
                      <div className="shrink-0 text-xs tabular-nums text-gray-500">
                        {filled}/{FIELD_DEFS.length}
                      </div>
                      {warnings.length > 0 && (
                        <div className="flex max-w-[160px] flex-wrap justify-end gap-1">
                          {warnings.map((w) => (
                            <span key={w} className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700">
                              {w}
                            </span>
                          ))}
                        </div>
                      )}
                      <button
                        onClick={() => toggleExpanded(item.uid)}
                        className="shrink-0 text-xs text-gray-400 hover:text-[#1B2A4A]"
                      >
                        {expanded ? "▲ Hide" : "▼ Details"}
                      </button>
                      <button
                        onClick={() => removeFile(item.uid)}
                        className="shrink-0 text-gray-300 hover:text-red-500 text-base leading-none"
                      >
                        ×
                      </button>
                    </div>

                    {/* Expanded field breakdown */}
                    {expanded && (
                      <div className="border-t border-gray-100 bg-gray-50 px-6 py-4">
                        {GROUPS.map((group) => {
                          const gf = FIELD_DEFS.filter((f) => f.group === group);
                          return (
                            <div key={group} className="mb-3">
                              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-[#1B2A4A]">{group}</p>
                              <div className="grid grid-cols-3 gap-x-4 gap-y-1">
                                {gf.map((f) => {
                                  const val   = displayValue(f.key, fd);
                                  const found = hasValue(f.key, fd);
                                  return (
                                    <div key={f.key} className="flex items-baseline gap-1.5">
                                      <span className={`mt-0.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${found ? "bg-green-500" : "bg-amber-400"}`} />
                                      <div className="min-w-0">
                                        <p className="text-[9px] text-gray-400">{f.label}</p>
                                        <p className="truncate text-[10px] font-medium text-gray-700">
                                          {val || <span className="text-gray-300 italic">—</span>}
                                        </p>
                                      </div>
                                    </div>
                                  );
                                })}
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
                <div
                  key={item.uid}
                  className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${
                    item.status === "done"   ? "border-green-200 bg-green-50" :
                    item.status === "error"  ? "border-red-200 bg-red-50" :
                    item.status === "saving" ? "border-[#1B2A4A]/20 bg-[#1B2A4A]/5" :
                                              "border-gray-200 bg-white opacity-50"
                  }`}
                >
                  <div className="h-4 w-4 shrink-0 flex items-center justify-center">
                    {item.status === "pending" && <div className="h-3 w-3 rounded-full border-2 border-gray-300" />}
                    {item.status === "saving"  && <Spinner className="h-4 w-4" />}
                    {item.status === "done"    && <IconCheck className="h-4 w-4 text-green-600" />}
                    {item.status === "error"   && <IconX className="h-4 w-4 text-red-500" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-800">{item.artistName}</p>
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

              <div className="overflow-hidden rounded-xl border border-gray-200">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      {["Artist Name", "Score", "Tier", "Status"].map((h, i) => (
                        <th key={h} className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500 ${i === 0 ? "text-left" : i === 3 ? "text-right" : "text-center"}`}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {processItems.map((item) => (
                      <tr key={item.uid} className={item.status === "error" ? "opacity-60" : ""}>
                        <td className="px-4 py-2.5 font-medium text-gray-800">{item.artistName}</td>
                        <td className="px-4 py-2.5 text-center font-bold text-[#1B2A4A]">
                          {item.score != null ? item.score.toFixed(2) : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          {item.tier ? (
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold ${TIER_STYLES[item.tier] ?? "bg-gray-100 text-gray-500"}`}>
                              {item.tier === "Pass" ? "Below" : item.tier}
                            </span>
                          ) : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-right text-xs">
                          {item.status === "done" ? (
                            <span className="font-medium text-green-600">✓ Saved</span>
                          ) : (
                            <span className="text-red-600" title={item.error ?? undefined}>Failed</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-gray-200 px-6 py-4">
          {/* Upload */}
          {step === "upload" && (
            <>
              <button
                onClick={onClose}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
              >
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

          {/* Review */}
          {step === "review" && (
            <>
              <button
                onClick={() => setStep("upload")}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
              >
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

          {/* Processing */}
          {step === "processing" && (
            <p className="flex-1 text-center text-xs text-gray-400">
              Do not close this window while importing…
            </p>
          )}

          {/* Complete */}
          {step === "complete" && (
            <>
              <button
                onClick={resetForMore}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
              >
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
