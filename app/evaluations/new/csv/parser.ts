// ============================================================
// Chartmetric CSV parsing utilities — v2 (bulk multi-file)
// ============================================================

import type { EvalFormData } from "../types";

// ─── Core CSV parser ──────────────────────────────────────────

export interface ParsedCSV {
  headers: string[];
  rows: Record<string, string>[];
  raw: string[][];
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

export function parseCSV(text: string): ParsedCSV {
  const cleaned = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = cleaned.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return { headers: [], rows: [], raw: [] };
  const headers = parseCSVLine(lines[0]);
  const raw = lines.slice(1).map(parseCSVLine);
  const rows = raw.map((vals) => {
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = vals[i] ?? ""; });
    return row;
  });
  return { headers, rows, raw };
}

export async function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string ?? "");
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

// ─── CSV type enum ────────────────────────────────────────────

export type CSVType =
  | "engagement"
  | "spotify_listeners_trends"
  | "spotify_fcr_trends"
  | "spotify_followers_trends"
  | "spotify_playlist_evolution"
  | "ig_followers_trends"
  | "tiktok_followers_trends"
  | "tiktok_avg_views_trends"
  | "youtube_subscribers_trends"
  | "demographics"
  | "er_trends"
  | "unknown";

export const CSV_TYPE_INFO: Record<Exclude<CSVType, "unknown">, {
  label: string;
  hint: string;
  platform: "spotify" | "instagram" | "tiktok" | "youtube" | "all" | "legacy";
}> = {
  spotify_listeners_trends:   { label: "Monthly Listeners Trends",       hint: "Fills Spotify listeners + YoY",          platform: "spotify" },
  spotify_fcr_trends:         { label: "Fan Conversion Rate Trends",      hint: "Fills Spotify FCR %",                    platform: "spotify" },
  spotify_followers_trends:   { label: "Spotify Followers Trends",        hint: "Optional reference data",                platform: "spotify" },
  spotify_playlist_evolution: { label: "Playlist Evolution",              hint: "Suggests playlist score (1–5)",          platform: "spotify" },
  ig_followers_trends:        { label: "Instagram Followers Trends",      hint: "Fills IG followers + 30-day gain",       platform: "instagram" },
  er_trends:                  { label: "Engagement Rate Trends",          hint: "IG or YouTube ER % (assign in step 2)",  platform: "all" },
  tiktok_followers_trends:    { label: "TikTok Followers Trends",         hint: "Fills TikTok followers",                 platform: "tiktok" },
  tiktok_avg_views_trends:    { label: "TikTok Average Views Trends",     hint: "Fills TikTok avg views",                 platform: "tiktok" },
  youtube_subscribers_trends: { label: "YouTube Subscribers Trends",      hint: "Fills YouTube subscribers",              platform: "youtube" },
  demographics:               { label: "Audience Demographics",           hint: "Fills age / gender / ethnicity fields",  platform: "all" },
  engagement:                 { label: "Engagement Overview (legacy)",    hint: "Fills listeners, FCR, YoY if no trend CSV", platform: "legacy" },
};

// ─── Detection helpers ────────────────────────────────────────

function norm(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "_");
}

export function detectCSVType(headers: string[], filename: string): CSVType {
  const fn = norm(filename);
  const hn = headers.map(norm);

  // Filename-first (Chartmetric naming convention)
  if (fn.includes("monthly_listener")) return "spotify_listeners_trends";
  if (fn.includes("fan_conversion_rate") || (fn.includes("spotify") && fn.includes("_fcr_"))) return "spotify_fcr_trends";
  if (fn.includes("playlist_evolution")) return "spotify_playlist_evolution";
  if (fn.includes("spotify") && fn.includes("follower") && !fn.includes("listener") && !fn.includes("fcr") && !fn.includes("engagement")) return "spotify_followers_trends";
  if ((fn.includes("instagram") || fn.startsWith("ig_")) && fn.includes("follower") && !fn.includes("engagement_rate") && !fn.includes("_er_")) return "ig_followers_trends";
  // ER Trends — platform resolved separately via resolveERPlatformFromFilename
  if (fn.includes("engagement_rate") || (fn.includes("_er_") && !fn.includes("spotify"))) return "er_trends";
  if (fn.includes("tiktok") && (fn.includes("average_view") || fn.includes("avg_view"))) return "tiktok_avg_views_trends";
  if (fn.includes("tiktok") && fn.includes("follower")) return "tiktok_followers_trends";
  if (fn.includes("youtube") && (fn.includes("subscriber") || fn.includes("follower"))) return "youtube_subscribers_trends";
  if (fn.includes("demographic") || fn.includes("audience_demograph")) return "demographics";
  if (fn.includes("engagement") && !fn.includes("rate") && !fn.includes("instagram") && !fn.includes("youtube")) return "engagement";

  // Header-based fallback
  if (hn[0] === "category" && hn.some((h) => h === "group")) return "demographics";
  const hasAge = hn.some((h) => h.includes("age"));
  const hasMF = hn.some((h) => h === "male" || h.includes("male_")) && hn.some((h) => h === "female" || h.includes("female_"));
  if (hasAge || hasMF) return "demographics";
  if (hn.some((h) => h.includes("engagement_rate"))) return "er_trends";
  if (hn.some((h) => h.includes("editorial_playlist") || h.includes("playlist_count"))) return "spotify_playlist_evolution";
  if (hn.some((h) => h.includes("average_view") || h.includes("avg_view"))) return "tiktok_avg_views_trends";
  if (hn.some((h) => h.includes("monthly_listener"))) {
    return hn.some((h) => h.includes("fan_conversion") || h.includes("fcr")) ? "engagement" : "spotify_listeners_trends";
  }
  if (hn.some((h) => h.includes("fan_conversion") || h.includes("fcr"))) return "spotify_fcr_trends";
  if (hn.some((h) => h.includes("follower") || h.includes("subscriber"))) {
    if (fn.includes("instagram")) return "ig_followers_trends";
    if (fn.includes("tiktok"))    return "tiktok_followers_trends";
    if (fn.includes("youtube"))   return "youtube_subscribers_trends";
    if (fn.includes("spotify"))   return "spotify_followers_trends";
  }

  return "unknown";
}

/** Pre-resolve ER platform from filename without waiting for user input. */
export function resolveERPlatformFromFilename(filename: string): "ig" | "youtube" | null {
  const fn = norm(filename);
  if (fn.includes("instagram") || fn.includes("_ig_")) return "ig";
  if (fn.includes("youtube") || fn.includes("_yt_"))   return "youtube";
  return null;
}

// ─── Column finder ─────────────────────────────────────────────

function findCol(headers: string[], ...patterns: string[]): string | null {
  for (const p of patterns) {
    const found = headers.find((h) => norm(h).includes(p));
    if (found) return found;
  }
  return null;
}

function latestNonBlank(rows: Record<string, string>[], col: string): string | null {
  for (let i = rows.length - 1; i >= 0; i--) {
    const v = rows[i][col]?.trim();
    if (v && v !== "" && !isNaN(parseFloat(v))) return v;
  }
  return null;
}

// ─── Date-aware trend utilities ───────────────────────────────

function parseDateCell(raw: string): Date | null {
  if (!raw) return null;
  const d = new Date(raw.trim());
  return isNaN(d.getTime()) ? null : d;
}

interface TrendRow { date: Date; value: number; }

function buildTrendRows(rows: Record<string, string>[], dateCol: string, valueCol: string): TrendRow[] {
  const result: TrendRow[] = [];
  for (const row of rows) {
    const d = parseDateCell(row[dateCol] ?? "");
    const v = parseFloat((row[valueCol] ?? "").replace(/,/g, ""));
    if (d && !isNaN(v)) result.push({ date: d, value: v });
  }
  result.sort((a, b) => a.date.getTime() - b.date.getTime());
  return result;
}

function findClosest(trend: TrendRow[], targetMs: number): TrendRow | null {
  let best: TrendRow | null = null;
  let bestDiff = Infinity;
  for (const row of trend) {
    const diff = Math.abs(row.date.getTime() - targetMs);
    if (diff < bestDiff) { bestDiff = diff; best = row; }
  }
  return best;
}

// ─── Spotify Monthly Listeners Trends ────────────────────────

export function extractSpotifyListenersTrend(csv: ParsedCSV): {
  spotify_monthly_listeners: string | null;
  spotify_yoy_pct: string | null;
} {
  const { headers, rows } = csv;
  const dateCol = findCol(headers, "date");
  const valCol  = findCol(headers, "monthly_listener");
  if (!valCol) return { spotify_monthly_listeners: null, spotify_yoy_pct: null };

  if (dateCol) {
    const trend = buildTrendRows(rows, dateCol, valCol);
    if (!trend.length) return { spotify_monthly_listeners: null, spotify_yoy_pct: null };
    const latest = trend[trend.length - 1];
    const priorTarget = latest.date.getTime() - 365 * 86400000;
    const prior = findClosest(trend.slice(0, -1), priorTarget);
    const yoy = prior && prior.value > 0
      ? (((latest.value - prior.value) / prior.value) * 100).toFixed(1)
      : null;
    return { spotify_monthly_listeners: String(Math.round(latest.value)), spotify_yoy_pct: yoy };
  }

  const raw = latestNonBlank(rows, valCol);
  return { spotify_monthly_listeners: raw ? String(Math.round(parseFloat(raw))) : null, spotify_yoy_pct: null };
}

// ─── Spotify FCR Trends ───────────────────────────────────────

export function extractSpotifyFCRTrend(csv: ParsedCSV): { fan_concentration_ratio: string | null } {
  const { headers, rows } = csv;
  const dateCol = findCol(headers, "date");
  const valCol  = findCol(headers, "fan_conversion", "fcr", "conversion_rate");
  if (!valCol) return { fan_concentration_ratio: null };

  let raw: string | null;
  if (dateCol) {
    const trend = buildTrendRows(rows, dateCol, valCol);
    raw = trend.length ? String(trend[trend.length - 1].value) : null;
  } else {
    raw = latestNonBlank(rows, valCol);
  }

  if (!raw) return { fan_concentration_ratio: null };
  const v = parseFloat(raw);
  return { fan_concentration_ratio: (v <= 1 ? v * 100 : v).toFixed(1) };
}

// ─── Instagram Followers Trends ───────────────────────────────

export function extractIGFollowersTrend(csv: ParsedCSV): {
  ig_followers: string | null;
  ig_30day_gain: string | null;
} {
  const { headers, rows } = csv;
  const dateCol = findCol(headers, "date");
  const valCol  = findCol(headers, "follower", "subscriber");
  if (!valCol) return { ig_followers: null, ig_30day_gain: null };

  if (dateCol) {
    const trend = buildTrendRows(rows, dateCol, valCol);
    if (!trend.length) return { ig_followers: null, ig_30day_gain: null };
    const latest = trend[trend.length - 1];
    const priorTarget = latest.date.getTime() - 30 * 86400000;
    const prior = findClosest(trend.slice(0, -1), priorTarget);
    return {
      ig_followers:  String(Math.round(latest.value)),
      ig_30day_gain: prior != null ? String(Math.round(latest.value - prior.value)) : null,
    };
  }

  const nonBlank = rows.filter((r) => { const v = r[valCol]?.trim(); return v && !isNaN(parseFloat(v)); });
  if (!nonBlank.length) return { ig_followers: null, ig_30day_gain: null };
  const latestVal = parseFloat(nonBlank[nonBlank.length - 1][valCol]);
  const priorIdx  = Math.max(0, nonBlank.length - 31);
  const priorVal  = parseFloat(nonBlank[priorIdx][valCol]);
  return { ig_followers: String(Math.round(latestVal)), ig_30day_gain: String(Math.round(latestVal - priorVal)) };
}

// ─── Generic latest-value trend ───────────────────────────────

export function extractTrendLatest(csv: ParsedCSV, colPatterns: string[]): string | null {
  const { headers, rows } = csv;
  const dateCol = findCol(headers, "date");
  const valCol  = findCol(headers, ...colPatterns);
  if (!valCol) return null;

  if (dateCol) {
    const trend = buildTrendRows(rows, dateCol, valCol);
    const latest = trend[trend.length - 1];
    return latest ? String(Math.round(latest.value)) : null;
  }
  const raw = latestNonBlank(rows, valCol);
  return raw ? String(Math.round(parseFloat(raw))) : null;
}

// ─── ER Trends ────────────────────────────────────────────────

export function extractERTrend(csv: ParsedCSV): { er_pct: string | null } {
  const { headers, rows } = csv;
  const dateCol = findCol(headers, "date");
  const valCol  = findCol(headers, "engagement_rate", "er_pct", "engagement");
  if (!valCol) return { er_pct: null };

  let raw: string | null;
  if (dateCol) {
    const trend = buildTrendRows(rows, dateCol, valCol);
    raw = trend.length ? String(trend[trend.length - 1].value) : null;
  } else {
    raw = latestNonBlank(rows, valCol);
  }

  if (!raw) return { er_pct: null };
  const v = parseFloat(raw);
  return { er_pct: (v <= 1 ? v * 100 : v).toFixed(2) };
}

// ─── Spotify Playlist Evolution ───────────────────────────────

function playlistCountToScore(count: number): string {
  if (count === 0) return "1";
  if (count <= 5)  return "2";
  if (count <= 15) return "3";
  if (count <= 30) return "4";
  return "5";
}

export function extractPlaylistEvolution(csv: ParsedCSV): { playlist_score: string | null } {
  const { headers, rows } = csv;
  const dateCol  = findCol(headers, "date");
  const countCol = findCol(headers, "editorial_playlist_count", "playlist_count");
  if (!countCol) return { playlist_score: null };

  let raw: string | null;
  if (dateCol) {
    const trend = buildTrendRows(rows, dateCol, countCol);
    raw = trend.length ? String(trend[trend.length - 1].value) : null;
  } else {
    raw = latestNonBlank(rows, countCol);
  }

  if (!raw) return { playlist_score: null };
  return { playlist_score: playlistCountToScore(Math.round(parseFloat(raw))) };
}

// ─── Legacy Engagement CSV (old Chartmetric combined export) ──

export interface EngagementExtract {
  spotify_monthly_listeners: string | null;
  fan_concentration_ratio: string | null;
  spotify_yoy_pct: string | null;
}

export function extractEngagement(csv: ParsedCSV): EngagementExtract {
  const { headers, rows } = csv;
  const mlCol  = findCol(headers, "monthly_listener");
  const fcrCol = findCol(headers, "fan_conversion", "conversion_rate", "fcr");

  let spotify_monthly_listeners: string | null = null;
  let fan_concentration_ratio: string | null = null;
  let spotify_yoy_pct: string | null = null;

  if (mlCol) {
    const latest = latestNonBlank(rows, mlCol);
    if (latest) spotify_monthly_listeners = String(Math.round(parseFloat(latest)));
    let earliest: string | null = null;
    for (const row of rows) {
      const v = row[mlCol]?.trim();
      if (v && !isNaN(parseFloat(v))) { earliest = v; break; }
    }
    if (latest && earliest) {
      const pct = ((parseFloat(latest) - parseFloat(earliest)) / parseFloat(earliest)) * 100;
      spotify_yoy_pct = pct.toFixed(1);
    }
  }

  if (fcrCol) {
    const raw = latestNonBlank(rows, fcrCol);
    if (raw) {
      const v = parseFloat(raw);
      fan_concentration_ratio = (v <= 1 ? v * 100 : v).toFixed(1);
    }
  }

  return { spotify_monthly_listeners, fan_concentration_ratio, spotify_yoy_pct };
}

// ─── Demographics CSV extraction ─────────────────────────────

export interface DemographicsExtract {
  values: Partial<EvalFormData>;
  confidence: "high" | "low";
  detectedFormat: "wide" | "long" | "unknown";
  suggestedMapping: SuggestedMapping | null;
}

export interface SuggestedMapping {
  ageCol: string | null;
  maleCol: string | null;
  femaleCol: string | null;
  genderCol: string | null;
  percentageCol: string | null;
  ethnicityCol: string | null;
}

function matchAgeBracket(raw: string): { mKey: keyof EvalFormData; fKey: keyof EvalFormData } | null {
  const clean = raw.trim().replace(/\s+/g, "-").replace(/[^0-9\-+]/g, "");
  const map: Record<string, [keyof EvalFormData, keyof EvalFormData]> = {
    "13-17": ["d_13_17_m", "d_13_17_f"],
    "18-24": ["d_18_24_m", "d_18_24_f"],
    "25-34": ["d_25_34_m", "d_25_34_f"],
    "35-44": ["d_35_44_m", "d_35_44_f"],
    "45-64": ["d_45_64_m", "d_45_64_f"],
    "65+":   ["d_65_m",    "d_65_f"],
    "65":    ["d_65_m",    "d_65_f"],
  };
  const match = map[clean];
  if (!match) return null;
  return { mKey: match[0], fKey: match[1] };
}

function matchEthnicity(raw: string): keyof EvalFormData | null {
  const s = raw.toLowerCase();
  if (s.includes("white") || s.includes("caucasian")) return "eth_white";
  if (s.includes("african") || s.includes("black"))   return "eth_aa";
  if (s.includes("hispanic") || s.includes("latino")) return "eth_hispanic";
  if (s.includes("asian"))                             return "eth_asian";
  return null;
}

function normPct(raw: string): string {
  const v = parseFloat(raw.replace(/[%$,]/g, ""));
  if (isNaN(v)) return "";
  return v <= 1 ? (v * 100).toFixed(1) : v.toFixed(1);
}

function normChartmetricPct(raw: string): string {
  if (!raw || raw.trim() === "-") return "";
  const v = parseFloat(raw.replace(/[%$,]/g, ""));
  if (isNaN(v)) return "";
  return v.toFixed(1);
}

export function extractDemographics(
  csv: ParsedCSV,
  mapping?: SuggestedMapping,
): DemographicsExtract {
  const { headers, rows } = csv;
  const values: Record<string, string> = {};
  const hn = headers.map(norm);

  // Chartmetric Category/Group format
  if (!mapping && hn[0] === "category" && hn.some((h) => h === "group")) {
    const categoryCol = headers[0];
    const groupCol    = headers.find((h) => norm(h) === "group")!;
    const maleCol     = headers.find((h) => norm(h) === "male")   ?? null;
    const femaleCol   = headers.find((h) => norm(h) === "female") ?? null;
    const allCol      = headers.find((h) => norm(h) === "all")    ?? null;

    for (const row of rows) {
      const category = row[categoryCol]?.trim();
      const group    = row[groupCol]?.trim();
      if (!category || !group) continue;
      if (category === "Age" && maleCol && femaleCol) {
        const bracket = matchAgeBracket(group);
        if (bracket) {
          const male   = normChartmetricPct(row[maleCol]   ?? "");
          const female = normChartmetricPct(row[femaleCol] ?? "");
          if (male)   values[bracket.mKey] = male;
          if (female) values[bracket.fKey] = female;
        }
      } else if (category === "Ethnicity" && allCol) {
        const ethKey = matchEthnicity(group);
        if (ethKey) {
          const pct = normChartmetricPct(row[allCol] ?? "");
          if (pct) values[ethKey] = pct;
        }
      }
    }
    return { values: values as Partial<EvalFormData>, confidence: "high", detectedFormat: "wide", suggestedMapping: null };
  }

  const autoMap: SuggestedMapping = {
    ageCol:        findCol(headers, "age_group", "age_range", "age", "bracket"),
    maleCol:       findCol(headers, "male"),
    femaleCol:     findCol(headers, "female"),
    genderCol:     findCol(headers, "gender"),
    percentageCol: findCol(headers, "percentage", "percent", "pct", "value"),
    ethnicityCol:  findCol(headers, "ethnicity", "ethnic", "race"),
  };
  const m = mapping ?? autoMap;
  let detectedFormat: "wide" | "long" | "unknown" = "unknown";
  let confidence: "high" | "low" = "low";

  if (m.ageCol && m.maleCol && m.femaleCol) {
    detectedFormat = "wide"; confidence = "high";
    for (const row of rows) {
      const age = row[m.ageCol]?.trim();
      const male   = row[m.maleCol]?.trim();
      const female = row[m.femaleCol]?.trim();
      if (!age) continue;
      const bracket = matchAgeBracket(age);
      if (bracket) {
        if (male)   values[bracket.mKey] = normPct(male);
        if (female) values[bracket.fKey] = normPct(female);
      }
      const ethKey = matchEthnicity(age);
      if (ethKey && m.percentageCol) {
        const pct = row[m.percentageCol]?.trim() ?? male ?? "";
        if (pct) values[ethKey] = normPct(pct);
      }
    }
  } else if (m.ageCol && m.genderCol && m.percentageCol) {
    detectedFormat = "long"; confidence = "high";
    for (const row of rows) {
      const age    = row[m.ageCol]?.trim();
      const gender = row[m.genderCol]?.trim().toLowerCase();
      const pct    = row[m.percentageCol]?.trim();
      if (!age || !pct) continue;
      const bracket = matchAgeBracket(age);
      if (bracket) {
        if (gender.startsWith("m")) values[bracket.mKey] = normPct(pct);
        if (gender.startsWith("f")) values[bracket.fKey] = normPct(pct);
      }
    }
  }

  if (m.ethnicityCol && m.percentageCol) {
    for (const row of rows) {
      const eth = row[m.ethnicityCol]?.trim();
      const pct = row[m.percentageCol]?.trim();
      if (!eth || !pct) continue;
      const key = matchEthnicity(eth);
      if (key) values[key] = normPct(pct);
    }
  }

  if (detectedFormat === "unknown" && headers.length >= 2) {
    for (const row of rows) {
      const first = row[headers[0]]?.trim();
      if (!first) continue;
      const bracket = matchAgeBracket(first);
      if (bracket && headers[1] && headers[2]) {
        values[bracket.mKey] = normPct(row[headers[1]] ?? "");
        values[bracket.fKey] = normPct(row[headers[2]] ?? "");
        confidence = "low";
      }
      const ethKey = matchEthnicity(first);
      if (ethKey && headers[1]) values[ethKey] = normPct(row[headers[1]] ?? "");
    }
  }

  return { values: values as Partial<EvalFormData>, confidence, detectedFormat, suggestedMapping: autoMap };
}

// ─── ER Trends entry ──────────────────────────────────────────

export interface ERTrendsEntry {
  file: File;
  csv: ParsedCSV;
  resolvedPlatform: "ig" | "youtube" | null;
  latestER: string | null;
}

// ─── Multi-file aggregation ───────────────────────────────────

export type DetectedMap = Partial<Record<Exclude<CSVType, "er_trends" | "unknown">, { file: File; csv: ParsedCSV }>>;

export interface MultiCSVExtract {
  detected: DetectedMap;
  erTrends: ERTrendsEntry[];
  fields: Partial<EvalFormData>;
  fieldSources: Record<string, string>;
  needsDisambiguation: boolean;
}

export async function extractMultiCSV(files: File[]): Promise<MultiCSVExtract> {
  const detected: DetectedMap = {};
  const erTrends: ERTrendsEntry[] = [];
  const fields: Partial<EvalFormData> = {};
  const fieldSources: Record<string, string> = {};

  for (const file of files) {
    const text = await readFileText(file);
    const csv  = parseCSV(text);
    if (!csv.headers.length) continue;
    const type = detectCSVType(csv.headers, file.name);

    if (type === "er_trends") {
      const resolvedPlatform = resolveERPlatformFromFilename(file.name);
      const { er_pct } = extractERTrend(csv);
      erTrends.push({ file, csv, resolvedPlatform, latestER: er_pct });
    } else if (type !== "unknown") {
      if (!detected[type]) detected[type] = { file, csv };
    }
  }

  function set(key: keyof EvalFormData, val: string | null, fname: string) {
    if (val !== null && val !== "") {
      (fields as Record<string, string>)[key] = val;
      fieldSources[key as string] = fname;
    }
  }

  const slt = detected["spotify_listeners_trends"];
  if (slt) {
    const ex = extractSpotifyListenersTrend(slt.csv);
    set("spotify_monthly_listeners", ex.spotify_monthly_listeners, slt.file.name);
    set("spotify_yoy_pct",           ex.spotify_yoy_pct,           slt.file.name);
  }

  const sfcr = detected["spotify_fcr_trends"];
  if (sfcr) {
    const ex = extractSpotifyFCRTrend(sfcr.csv);
    set("fan_concentration_ratio", ex.fan_concentration_ratio, sfcr.file.name);
  }

  const spe = detected["spotify_playlist_evolution"];
  if (spe) {
    const ex = extractPlaylistEvolution(spe.csv);
    set("playlist_score", ex.playlist_score, spe.file.name);
  }

  const ig = detected["ig_followers_trends"];
  if (ig) {
    const ex = extractIGFollowersTrend(ig.csv);
    set("ig_followers",  ex.ig_followers,  ig.file.name);
    set("ig_30day_gain", ex.ig_30day_gain, ig.file.name);
  }

  const tt = detected["tiktok_followers_trends"];
  if (tt) set("tiktok_followers", extractTrendLatest(tt.csv, ["follower"]), tt.file.name);

  const ttv = detected["tiktok_avg_views_trends"];
  if (ttv) set("tiktok_avg_views", extractTrendLatest(ttv.csv, ["average_view", "avg_view"]), ttv.file.name);

  const yt = detected["youtube_subscribers_trends"];
  if (yt) set("youtube_subscribers", extractTrendLatest(yt.csv, ["subscriber", "follower"]), yt.file.name);

  const demo = detected["demographics"];
  if (demo) {
    const ex = extractDemographics(demo.csv);
    for (const [k, v] of Object.entries(ex.values)) {
      if (v) { (fields as Record<string, string>)[k] = v as string; fieldSources[k] = demo.file.name; }
    }
  }

  // Legacy engagement — only fills gaps
  const eng = detected["engagement"];
  if (eng) {
    const ex = extractEngagement(eng.csv);
    if (!fields.spotify_monthly_listeners && ex.spotify_monthly_listeners) set("spotify_monthly_listeners", ex.spotify_monthly_listeners, eng.file.name);
    if (!fields.fan_concentration_ratio   && ex.fan_concentration_ratio)   set("fan_concentration_ratio",   ex.fan_concentration_ratio,   eng.file.name);
    if (!fields.spotify_yoy_pct           && ex.spotify_yoy_pct)           set("spotify_yoy_pct",           ex.spotify_yoy_pct,           eng.file.name);
  }

  // Auto-resolved ER files
  for (const entry of erTrends) {
    if (!entry.latestER) continue;
    if (entry.resolvedPlatform === "ig" && !fields.ig_er_pct) set("ig_er_pct", entry.latestER, entry.file.name);
    if (entry.resolvedPlatform === "youtube" && !fields.youtube_er_pct) set("youtube_er_pct", entry.latestER, entry.file.name);
  }

  const needsDisambiguation = erTrends.some((e) => e.resolvedPlatform === null);
  return { detected, erTrends, fields, fieldSources, needsDisambiguation };
}

// ─── Apply user's ER disambiguation ──────────────────────────

export function applyERDisambiguation(
  erTrends: ERTrendsEntry[],
  baseFields: Partial<EvalFormData>,
  baseSources: Record<string, string>,
): { fields: Partial<EvalFormData>; fieldSources: Record<string, string> } {
  const fields = { ...baseFields };
  const fieldSources = { ...baseSources };

  for (const entry of erTrends) {
    if (!entry.latestER) continue;
    if (entry.resolvedPlatform === "ig" && !fields.ig_er_pct) {
      fields.ig_er_pct = entry.latestER;
      fieldSources["ig_er_pct"] = entry.file.name;
    } else if (entry.resolvedPlatform === "youtube" && !fields.youtube_er_pct) {
      fields.youtube_er_pct = entry.latestER;
      fieldSources["youtube_er_pct"] = entry.file.name;
    }
  }

  return { fields, fieldSources };
}
