"use client";

import { useState, useRef, useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import { INITIAL_FORM_DATA } from "@/app/evaluations/new/types";
import type { EvalFormData, VipLevel, ResaleSituation } from "@/app/evaluations/new/types";
import { saveEvaluation } from "@/app/evaluations/new/actions";

// ── Cell parsers ──────────────────────────────────────────────

function cellStr(sheet: Record<string, any>, ref: string): string {
  const c = sheet[ref];
  if (!c || c.v == null) return "";
  return String(c.v).trim();
}

function cellNum(sheet: Record<string, any>, ref: string): string {
  const c = sheet[ref];
  if (!c || c.v == null) return "";
  if (typeof c.v === "number") return String(c.v);
  const s = String(c.v).trim().replace(/[^0-9.\-]/g, "");
  return s;
}

// ── Enum mappers ──────────────────────────────────────────────

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
  if (l.includes("same") || l.includes("same size")) return "same";
  // fallback: try raw value for already-canonical strings
  if (["smaller","same","slight_step_up","major_jump","tier_change"].includes(l.replace(/\s+/g,"_"))) {
    return l.replace(/\s+/g,"_");
  }
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

// ── Parser ────────────────────────────────────────────────────

async function parseScorecard(file: File): Promise<EvalFormData> {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });

  const s = wb.Sheets["Artist Scoring"];
  if (!s) throw new Error('Required sheet "Artist Scoring" not found. Please upload an A3 Artist Scoring Template v8 file.');

  const d = wb.Sheets["Audience Demographics"];

  const albumCycleRaw = mapAlbumCycle(cellStr(s, "B53"));

  const fd: EvalFormData = {
    ...INITIAL_FORM_DATA,
    // ── Artist Info ──
    artist_name:        cellStr(s, "B3"),
    genre:              cellStr(s, "B4"),
    management_company: cellStr(s, "B5"),
    manager_names:      cellStr(s, "B6"),
    other_mgmt_artists: cellStr(s, "B7"),
    booking_agent:      cellStr(s, "B8"),
    other_agent_artists:cellStr(s, "B9"),
    merch_provider:     cellStr(s, "B10"),
    vip_level:          mapVipLevel(cellStr(s, "B12")),
    // ── Touring ──
    venue_capacity:     cellNum(s, "B16"),
    sell_through_pct:   cellNum(s, "B17"),
    num_dates:          cellNum(s, "B18"),
    market_coverage:    cellNum(s, "C19"),
    resale_situation:   mapResale(cellStr(s, "B20")),
    face_value:         cellNum(s, "B21"),
    resale_price:       cellNum(s, "B22"),
    // ── Fan Engagement ──
    fan_concentration_ratio: cellNum(s, "B28"),
    p2_fan_identity:    cellNum(s, "C29"),
    ig_er_pct:          cellNum(s, "B30"),
    reddit_members:     cellNum(s, "B31"),
    discord_members:    cellNum(s, "B32"),
    merch_sentiment:    cellNum(s, "C33"),
    tiktok_followers:   cellNum(s, "B34"),
    tiktok_avg_views:   cellNum(s, "B35"),
    youtube_subscribers:cellNum(s, "B37"),
    youtube_er_pct:     cellNum(s, "B38"),
    // ── E-Commerce ──
    store_quality:      cellNum(s, "C43"),
    merch_range:        cellNum(s, "B44"),
    price_point_highest:cellNum(s, "B45"),
    d2c_level:          cellNum(s, "B46"),
    // ── Growth ──
    spotify_monthly_listeners: cellNum(s, "B51"),
    spotify_yoy_pct:    cellNum(s, "B52"),
    album_cycle_override: albumCycleRaw,
    show_album_cycle:   !!albumCycleRaw,
    venue_progression:  mapVenueProgression(cellStr(s, "B54")),
    ig_followers:       cellNum(s, "B55"),
    ig_30day_gain:      cellNum(s, "B56"),
    press_score:        cellNum(s, "C58"),
    playlist_score:     cellNum(s, "C59"),
  };

  // ── Demographics (optional sheet) ──
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

  return fd;
}

// ── Confirmation field definitions ────────────────────────────

type FieldDef = { label: string; key: keyof EvalFormData; group: string };

const FIELD_DEFS: FieldDef[] = [
  // Artist Info
  { label: "Artist Name", key: "artist_name", group: "Artist Info" },
  { label: "Genre", key: "genre", group: "Artist Info" },
  { label: "Management Company", key: "management_company", group: "Artist Info" },
  { label: "Manager Names", key: "manager_names", group: "Artist Info" },
  { label: "Booking Agent", key: "booking_agent", group: "Artist Info" },
  { label: "Merch Provider", key: "merch_provider", group: "Artist Info" },
  { label: "VIP Level", key: "vip_level", group: "Artist Info" },
  // Touring
  { label: "Venue Capacity", key: "venue_capacity", group: "Touring" },
  { label: "Sell-Through %", key: "sell_through_pct", group: "Touring" },
  { label: "# Dates", key: "num_dates", group: "Touring" },
  { label: "Market Coverage", key: "market_coverage", group: "Touring" },
  { label: "Resale Situation", key: "resale_situation", group: "Touring" },
  { label: "Face Value ($)", key: "face_value", group: "Touring" },
  { label: "Resale Price ($)", key: "resale_price", group: "Touring" },
  // Fan Engagement
  { label: "Spotify Listeners", key: "spotify_monthly_listeners", group: "Fan Engagement" },
  { label: "Fan Concentration Ratio", key: "fan_concentration_ratio", group: "Fan Engagement" },
  { label: "Fan Identity Score", key: "p2_fan_identity", group: "Fan Engagement" },
  { label: "IG Followers", key: "ig_followers", group: "Fan Engagement" },
  { label: "IG ER %", key: "ig_er_pct", group: "Fan Engagement" },
  { label: "TikTok Followers", key: "tiktok_followers", group: "Fan Engagement" },
  { label: "TikTok Avg Views", key: "tiktok_avg_views", group: "Fan Engagement" },
  { label: "YouTube Subscribers", key: "youtube_subscribers", group: "Fan Engagement" },
  { label: "YouTube ER %", key: "youtube_er_pct", group: "Fan Engagement" },
  { label: "Reddit Members", key: "reddit_members", group: "Fan Engagement" },
  { label: "Discord Members", key: "discord_members", group: "Fan Engagement" },
  { label: "Merch Sentiment", key: "merch_sentiment", group: "Fan Engagement" },
  // E-Commerce
  { label: "Store Quality", key: "store_quality", group: "E-Commerce" },
  { label: "Merch Range", key: "merch_range", group: "E-Commerce" },
  { label: "Price Point High", key: "price_point_highest", group: "E-Commerce" },
  { label: "D2C Level", key: "d2c_level", group: "E-Commerce" },
  // Growth
  { label: "Spotify YoY %", key: "spotify_yoy_pct", group: "Growth" },
  { label: "Venue Progression", key: "venue_progression", group: "Growth" },
  { label: "Album Cycle Override", key: "album_cycle_override", group: "Growth" },
  { label: "IG 30-Day Gain", key: "ig_30day_gain", group: "Growth" },
  { label: "Press Score", key: "press_score", group: "Growth" },
  { label: "Playlist Score", key: "playlist_score", group: "Growth" },
  // Demographics
  { label: "Ages 13–17", key: "d_13_17_m", group: "Demographics" },
  { label: "Ages 18–24", key: "d_18_24_m", group: "Demographics" },
  { label: "Ages 25–34", key: "d_25_34_m", group: "Demographics" },
  { label: "Ages 35–44", key: "d_35_44_m", group: "Demographics" },
  { label: "Ages 45–64", key: "d_45_64_m", group: "Demographics" },
  { label: "Ages 65+", key: "d_65_m", group: "Demographics" },
  { label: "Ethnicity Data", key: "eth_white", group: "Demographics" },
];

function displayValue(key: keyof EvalFormData, fd: EvalFormData): string {
  const raw = fd[key];
  if (typeof raw === "boolean") return raw ? "Yes" : "No";
  if (raw == null || raw === "") return "";
  // Humanize some enum values
  if (key === "resale_situation") {
    const map: Record<string, string> = { not_sold_out: "Not Sold Out", some_sold_out: "Some Sold Out", all_sold_out: "All Sold Out" };
    return map[String(raw)] ?? String(raw);
  }
  if (key === "vip_level") {
    const map: Record<string, string> = { none: "None", offered_before: "Offered Before", basic: "Basic", premium_mg: "Premium (MG)", tiered_high: "Tiered (High)" };
    return map[String(raw)] ?? String(raw);
  }
  if (key === "venue_progression") {
    const map: Record<string, string> = { smaller: "Smaller", same: "Same", slight_step_up: "Slight Step Up", major_jump: "Major Jump", tier_change: "Tier Change" };
    return map[String(raw)] ?? String(raw);
  }
  if (key === "album_cycle_override") {
    const map: Record<string, string> = { peak_declining: "Peak/Declining", normalizing: "Normalizing", anticipation: "Anticipation" };
    return map[String(raw)] ?? String(raw);
  }
  // Numeric with comma formatting
  if (key === "d_13_17_m" || key === "d_18_24_m" || key === "d_25_34_m" || key === "d_35_44_m" || key === "d_45_64_m" || key === "d_65_m") {
    // Show M+F combined label
    const mVal = fd[key] as string;
    const fKey = key.replace("_m", "_f") as keyof EvalFormData;
    const fVal = fd[fKey] as string;
    if (!mVal && !fVal) return "";
    return `${mVal || "0"}% M / ${fVal || "0"}% F`;
  }
  if (key === "eth_white") {
    const parts = [
      fd.eth_white && `White: ${fd.eth_white}%`,
      fd.eth_aa && `African American: ${fd.eth_aa}%`,
      fd.eth_hispanic && `Hispanic: ${fd.eth_hispanic}%`,
      fd.eth_asian && `Asian: ${fd.eth_asian}%`,
    ].filter(Boolean);
    return parts.join(", ") || "";
  }
  return String(raw);
}

function hasValue(key: keyof EvalFormData, fd: EvalFormData): boolean {
  const v = displayValue(key, fd);
  // vip_level "none" and resale_situation "not_sold_out" count as filled (they're valid defaults)
  if (key === "vip_level" || key === "resale_situation" || key === "venue_progression") return true;
  return !!v;
}

// ── Groups for display ────────────────────────────────────────

const GROUPS = ["Artist Info", "Touring", "Fan Engagement", "E-Commerce", "Growth", "Demographics"] as const;

// ── Component ─────────────────────────────────────────────────

interface Props {
  onClose: () => void;
}

type Step = "upload" | "confirm" | "submitting";

export default function UploadScorecardModal({ onClose }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("upload");
  const [fd, setFd] = useState<EvalFormData | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(async (file: File) => {
    if (!file.name.endsWith(".xlsx")) {
      setParseError("Please upload an .xlsx file.");
      return;
    }
    setParseError(null);
    setIsParsing(true);
    try {
      const parsed = await parseScorecard(file);
      setFd(parsed);
      setFileName(file.name);
      setStep("confirm");
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "Failed to parse file.");
    } finally {
      setIsParsing(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const handleSubmit = () => {
    if (!fd) return;
    setSubmitError(null);
    startTransition(async () => {
      setStep("submitting");
      const result = await saveEvaluation(fd, "complete");
      if (result.error || !result.id) {
        setSubmitError(result.error ?? "Unknown error saving evaluation.");
        setStep("confirm");
        return;
      }
      router.push(`/evaluations/${result.id}`);
    });
  };

  // ── Compute confirmation stats ────────────────────────────
  const totalFields = FIELD_DEFS.length;
  const foundCount = fd ? FIELD_DEFS.filter((f) => hasValue(f.key, fd)).length : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-[#1B2A4A]">Upload Completed Scorecard</h2>
            {step === "confirm" && fd && (
              <p className="mt-0.5 text-xs text-gray-500">
                {fileName} — {foundCount}/{totalFields} fields parsed
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            disabled={step === "submitting"}
            className="rounded-full p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 disabled:opacity-40"
          >
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {step === "upload" && (
            <div className="px-6 py-8">
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => inputRef.current?.click()}
                className={`flex cursor-pointer flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed py-16 transition ${
                  isDragging
                    ? "border-[#C0392B] bg-red-50"
                    : "border-gray-300 bg-gray-50 hover:border-[#1B2A4A] hover:bg-gray-100"
                }`}
              >
                <svg className="h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <div className="text-center">
                  <p className="text-sm font-semibold text-gray-700">
                    {isParsing ? "Parsing…" : "Drop your scorecard here"}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    or click to browse — .xlsx only
                  </p>
                </div>
                {isParsing && (
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#C0392B] border-t-transparent" />
                )}
              </div>
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={handleFileInput}
              />
              <p className="mt-3 text-center text-xs text-gray-400">
                Accepts A3 Artist Scoring Template v8 (.xlsx)
              </p>
              {parseError && (
                <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {parseError}
                </div>
              )}
            </div>
          )}

          {step === "confirm" && fd && (
            <div className="px-6 py-5">
              <div className="mb-4 flex items-center gap-4 text-xs text-gray-500">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-500" />
                  Field parsed
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-yellow-400" />
                  Not found / empty
                </span>
              </div>

              {GROUPS.map((group) => {
                const groupFields = FIELD_DEFS.filter((f) => f.group === group);
                return (
                  <div key={group} className="mb-5">
                    <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-[#1B2A4A]">
                      {group}
                    </h3>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
                      {groupFields.map((f) => {
                        const val = displayValue(f.key, fd);
                        const found = hasValue(f.key, fd);
                        return (
                          <div key={f.key} className="flex items-baseline gap-2">
                            <span
                              className={`mt-1 inline-block h-2 w-2 shrink-0 rounded-full ${
                                found ? "bg-green-500" : "bg-yellow-400"
                              }`}
                            />
                            <div className="min-w-0">
                              <span className="text-xs text-gray-500">{f.label}</span>
                              <p className="truncate text-xs font-medium text-gray-800">
                                {val || <span className="italic text-gray-400">—</span>}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {submitError && (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {submitError}
                </div>
              )}
            </div>
          )}

          {step === "submitting" && (
            <div className="flex flex-col items-center justify-center py-24 gap-4">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#C0392B] border-t-transparent" />
              <p className="text-sm text-gray-600">Scoring and saving evaluation…</p>
            </div>
          )}
        </div>

        {/* Footer */}
        {step !== "submitting" && (
          <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
            {step === "upload" && (
              <button
                onClick={onClose}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
              >
                Cancel
              </button>
            )}
            {step === "confirm" && (
              <>
                <button
                  onClick={() => { setFd(null); setFileName(""); setSubmitError(null); setStep("upload"); }}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
                >
                  Back
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={isPending}
                  className="rounded-lg bg-[#C0392B] px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#a93226] disabled:opacity-60"
                >
                  {isPending ? "Saving…" : "Save Evaluation"}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
