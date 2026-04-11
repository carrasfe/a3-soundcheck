// ============================================================
// Chartmetric CSV parsing utilities
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

// ─── CSV type detection ───────────────────────────────────────

export type CSVType =
  | "engagement"
  | "spotify_followers"
  | "ig_followers"
  | "tiktok_followers"
  | "youtube_followers"
  | "demographics"
  | "unknown";

function norm(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "_");
}

export function detectCSVType(headers: string[], filename: string): CSVType {
  const hn = headers.map(norm);
  const fn = filename.toLowerCase();

  // Engagement: has monthly listeners AND fan conversion rate
  const hasML  = hn.some((h) => h.includes("monthly_listener") || h.includes("monthly_listener"));
  const hasFCR = hn.some((h) => h.includes("fan_conversion") || h.includes("conversion_rate") || h.includes("fcr"));
  if (hasML && hasFCR) return "engagement";

  // Spotify followers (filename hint or header without FCR)
  if ((fn.includes("spotify") || hn.some((h) => h.includes("spotify"))) && hn.some((h) => h.includes("follower"))) {
    return "spotify_followers";
  }

  // Instagram
  if (fn.includes("instagram") || fn.includes("ig_")) {
    if (hn.some((h) => h.includes("follower"))) return "ig_followers";
  }

  // TikTok
  if (fn.includes("tiktok") || fn.includes("tik_tok")) {
    if (hn.some((h) => h.includes("follower"))) return "tiktok_followers";
  }

  // YouTube
  if (fn.includes("youtube") || fn.includes("yt_")) {
    if (hn.some((h) => h.includes("follower") || h.includes("subscriber"))) return "youtube_followers";
  }

  // Demographics
  const hasAge = hn.some((h) => h.includes("age"));
  const hasMF  = hn.some((h) => h === "male" || h.includes("male_")) && hn.some((h) => h === "female" || h.includes("female_"));
  const hasGender = hn.some((h) => h.includes("gender"));
  if (hasAge || hasMF || hasGender) return "demographics";

  // Fallback: if only filename gives us the hint (with just a Followers/Date structure)
  if (hn.some((h) => h.includes("follower") || h.includes("subscriber"))) {
    if (fn.includes("instagram")) return "ig_followers";
    if (fn.includes("tiktok"))    return "tiktok_followers";
    if (fn.includes("youtube"))   return "youtube_followers";
    if (fn.includes("spotify"))   return "spotify_followers";
  }

  return "unknown";
}

// ─── Engagement CSV extraction ────────────────────────────────

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

    // YoY: find earliest and latest non-blank ML values
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
      // Chartmetric may store FCR as 0.22 or 22 — normalise to percentage
      const v = parseFloat(raw);
      fan_concentration_ratio = v <= 1 ? (v * 100).toFixed(1) : v.toFixed(1);
    }
  }

  return { spotify_monthly_listeners, fan_concentration_ratio, spotify_yoy_pct };
}

// ─── Followers CSV extraction ─────────────────────────────────

export interface FollowersExtract {
  latest: string | null;
  gain30day: string | null;
}

export function extractFollowers(csv: ParsedCSV): FollowersExtract {
  const { headers, rows } = csv;
  const col = findCol(headers, "follower", "subscriber");
  if (!col) return { latest: null, gain30day: null };

  const nonBlank = rows.filter((r) => {
    const v = r[col]?.trim();
    return v && !isNaN(parseFloat(v));
  });
  if (!nonBlank.length) return { latest: null, gain30day: null };

  const latestVal = parseFloat(nonBlank[nonBlank.length - 1][col]);
  const priorIdx  = Math.max(0, nonBlank.length - 31);
  const priorVal  = parseFloat(nonBlank[priorIdx][col]);
  const gain      = latestVal - priorVal;

  return {
    latest:   String(Math.round(latestVal)),
    gain30day: String(Math.round(gain)),
  };
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

const AGE_BRACKET_PATTERNS: Record<string, keyof EvalFormData> = {
  "13": "d_13_17_m", "17": "d_13_17_m",
  "13-17": "d_13_17_m", "13 17": "d_13_17_m",
  "18-24": "d_18_24_m", "18 24": "d_18_24_m",
  "25-34": "d_25_34_m", "25 34": "d_25_34_m",
  "35-44": "d_35_44_m", "35 44": "d_35_44_m",
  "45-64": "d_45_64_m", "45 64": "d_45_64_m",
  "65+":   "d_65_m",    "65":    "d_65_m",
};

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

export function extractDemographics(
  csv: ParsedCSV,
  mapping?: SuggestedMapping
): DemographicsExtract {
  const { headers, rows } = csv;
  const values: Record<string, string> = {};

  const hn = headers.map(norm);

  // Auto-detect mapping if not provided
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

  // ── Wide format: Age Group | Male | Female ──
  if (m.ageCol && m.maleCol && m.femaleCol) {
    detectedFormat = "wide";
    confidence = "high";
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
      // Ethnicity rows sometimes appear below age data in the same file
      const ethKey = matchEthnicity(age);
      if (ethKey && m.percentageCol) {
        const pct = row[m.percentageCol]?.trim() ?? male ?? "";
        if (pct) values[ethKey] = normPct(pct);
      }
    }
  }

  // ── Long format: Age Range | Gender | Percentage ──
  else if (m.ageCol && m.genderCol && m.percentageCol) {
    detectedFormat = "long";
    confidence = "high";
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

  // ── Ethnicity-only rows ──
  if (m.ethnicityCol && m.percentageCol) {
    for (const row of rows) {
      const eth = row[m.ethnicityCol]?.trim();
      const pct = row[m.percentageCol]?.trim();
      if (!eth || !pct) continue;
      const key = matchEthnicity(eth);
      if (key) values[key] = normPct(pct);
    }
  }

  // Fallback: scan first column for age bracket or ethnicity labels
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
      if (ethKey && headers[1]) {
        values[ethKey] = normPct(row[headers[1]] ?? "");
      }
    }
  }

  return {
    values: values as Partial<EvalFormData>,
    confidence,
    detectedFormat,
    suggestedMapping: autoMap,
  };
}

// ─── Multi-file aggregation ───────────────────────────────────

export interface MultiCSVExtract {
  detected: Record<CSVType, { file: File; csv: ParsedCSV } | null>;
  fields: Partial<EvalFormData>;
  fieldSources: Record<string, string>; // field → file name
}

export async function extractMultiCSV(files: File[]): Promise<MultiCSVExtract> {
  const detected: Partial<Record<CSVType, { file: File; csv: ParsedCSV }>> = {};
  const fields: Partial<EvalFormData> = {};
  const fieldSources: Record<string, string> = {};

  for (const file of files) {
    const text = await readFileText(file);
    const csv  = parseCSV(text);
    if (!csv.headers.length) continue;
    const type = detectCSVType(csv.headers, file.name);
    if (type !== "unknown" && !detected[type]) {
      detected[type] = { file, csv };
    }
  }

  // Engagement
  const eng = detected["engagement"];
  if (eng) {
    const ex = extractEngagement(eng.csv);
    if (ex.spotify_monthly_listeners) { fields.spotify_monthly_listeners = ex.spotify_monthly_listeners; fieldSources["spotify_monthly_listeners"] = eng.file.name; }
    if (ex.fan_concentration_ratio)   { fields.fan_concentration_ratio   = ex.fan_concentration_ratio;   fieldSources["fan_concentration_ratio"]   = eng.file.name; }
    if (ex.spotify_yoy_pct)           { fields.spotify_yoy_pct           = ex.spotify_yoy_pct;           fieldSources["spotify_yoy_pct"]           = eng.file.name; }
  }

  // Instagram followers
  const ig = detected["ig_followers"];
  if (ig) {
    const ex = extractFollowers(ig.csv);
    if (ex.latest)   { fields.ig_followers   = ex.latest;   fieldSources["ig_followers"]   = ig.file.name; }
    if (ex.gain30day) { fields.ig_30day_gain = ex.gain30day; fieldSources["ig_30day_gain"] = ig.file.name; }
  }

  // TikTok followers
  const tt = detected["tiktok_followers"];
  if (tt) {
    const ex = extractFollowers(tt.csv);
    if (ex.latest) { fields.tiktok_followers = ex.latest; fieldSources["tiktok_followers"] = tt.file.name; }
  }

  // YouTube
  const yt = detected["youtube_followers"];
  if (yt) {
    const ex = extractFollowers(yt.csv);
    if (ex.latest) { fields.youtube_subscribers = ex.latest; fieldSources["youtube_subscribers"] = yt.file.name; }
  }

  return {
    detected: {
      engagement:         detected["engagement"]         ?? null,
      spotify_followers:  detected["spotify_followers"]  ?? null,
      ig_followers:       detected["ig_followers"]       ?? null,
      tiktok_followers:   detected["tiktok_followers"]   ?? null,
      youtube_followers:  detected["youtube_followers"]  ?? null,
      demographics:       detected["demographics"]       ?? null,
      unknown:            null,
    },
    fields,
    fieldSources,
  };
}
