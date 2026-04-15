import type {
  Genre,
  VipLevel,
  ResaleSituation,
  VenueProgressionOption,
  MerchRangeOption,
  D2CLevel,
  AlbumCycleOverride,
  DemographicsInput,
  ScoringInputs,
} from "@/lib/scoring-engine";

export type { Genre, VipLevel, ResaleSituation, VenueProgressionOption };

// Shared props interface for all step components
export interface StepProps {
  data: EvalFormData;
  onChange: (u: Partial<EvalFormData>) => void;
  onCsvFill: (u: Partial<EvalFormData>) => void;
  csvFilled: Set<string>;
  errors: Partial<Record<keyof EvalFormData, string>>;
}

// All form values as strings so <input> works naturally.
// Numeric fields get converted to numbers only when scoring or saving.
export interface EvalFormData {
  // ── Step 1: Artist Info ──
  artist_name: string;
  genre: string;
  management_company: string;
  manager_names: string;
  other_mgmt_artists: string;
  booking_agent: string;
  other_agent_artists: string;
  merch_provider: string;
  vip_level: VipLevel;

  // ── Step 2: Demographics ──
  // Stored as Male % / Female % per bracket; scoring engine gets m+f sum
  d_13_17_m: string; d_13_17_f: string;
  d_18_24_m: string; d_18_24_f: string;
  d_25_34_m: string; d_25_34_f: string;
  d_35_44_m: string; d_35_44_f: string;
  d_45_64_m: string; d_45_64_f: string;
  d_65_m: string;    d_65_f: string;
  eth_white: string; eth_aa: string; eth_hispanic: string; eth_asian: string;

  // ── Step 3: Touring ──
  venue_capacity: string;
  sell_through_pct: string;
  num_dates: string;
  market_coverage: string;
  resale_situation: ResaleSituation;
  face_value: string;
  resale_price: string;

  // ── Step 4: Fan Engagement ──
  spotify_monthly_listeners: string;
  fan_concentration_ratio: string;
  p2_fan_identity: string;
  ig_followers: string;
  ig_er_pct: string;
  reddit_members: string;
  discord_members: string;
  merch_sentiment: string;
  tiktok_followers: string;
  tiktok_avg_views: string;
  youtube_subscribers: string;
  youtube_er_pct: string;

  // ── Step 5: E-Commerce ──
  store_quality: string;
  merch_range: string;
  price_point_highest: string;
  d2c_level: string;

  // ── Step 6: Growth ──
  spotify_yoy_pct: string;
  show_album_cycle: boolean;
  album_cycle_override: string;
  venue_progression: string;
  ig_30day_gain: string;
  press_score: string;
  playlist_score: string;
}

export const INITIAL_FORM_DATA: EvalFormData = {
  artist_name: "", genre: "",
  management_company: "", manager_names: "", other_mgmt_artists: "",
  booking_agent: "", other_agent_artists: "",
  merch_provider: "", vip_level: "none",
  d_13_17_m: "", d_13_17_f: "",
  d_18_24_m: "", d_18_24_f: "",
  d_25_34_m: "", d_25_34_f: "",
  d_35_44_m: "", d_35_44_f: "",
  d_45_64_m: "", d_45_64_f: "",
  d_65_m: "",    d_65_f: "",
  eth_white: "", eth_aa: "", eth_hispanic: "", eth_asian: "",
  venue_capacity: "", sell_through_pct: "", num_dates: "", market_coverage: "",
  resale_situation: "not_sold_out", face_value: "", resale_price: "",
  spotify_monthly_listeners: "", fan_concentration_ratio: "", p2_fan_identity: "",
  ig_followers: "", ig_er_pct: "", reddit_members: "", discord_members: "",
  merch_sentiment: "", tiktok_followers: "", tiktok_avg_views: "",
  youtube_subscribers: "", youtube_er_pct: "",
  store_quality: "", merch_range: "", price_point_highest: "", d2c_level: "",
  spotify_yoy_pct: "", show_album_cycle: false, album_cycle_override: "",
  venue_progression: "", ig_30day_gain: "", press_score: "", playlist_score: "",
};

// ─── Conversion helpers ───────────────────────────────────────

function n(s: string): number | undefined {
  if (!s || s.trim() === "") return undefined;
  const v = parseFloat(s);
  return isNaN(v) ? undefined : v;
}

function nOr(s: string, fallback: number): number {
  return n(s) ?? fallback;
}

export function buildDemographics(fd: EvalFormData): DemographicsInput | undefined {
  const any = [
    fd.d_13_17_m, fd.d_13_17_f, fd.d_18_24_m, fd.d_18_24_f,
    fd.d_25_34_m, fd.d_25_34_f, fd.d_35_44_m, fd.d_35_44_f,
    fd.d_45_64_m, fd.d_45_64_f, fd.d_65_m, fd.d_65_f,
  ].some((v) => v !== "");
  if (!any) return undefined;
  return {
    age_13_17:  nOr(fd.d_13_17_m, 0) + nOr(fd.d_13_17_f, 0),
    age_18_24:  nOr(fd.d_18_24_m, 0) + nOr(fd.d_18_24_f, 0),
    age_25_34:  nOr(fd.d_25_34_m, 0) + nOr(fd.d_25_34_f, 0),
    age_35_44:  nOr(fd.d_35_44_m, 0) + nOr(fd.d_35_44_f, 0),
    age_45_64:  nOr(fd.d_45_64_m, 0) + nOr(fd.d_45_64_f, 0),
    age_65_plus: nOr(fd.d_65_m, 0)  + nOr(fd.d_65_f, 0),
    hispanic:     n(fd.eth_hispanic),
    african_american: n(fd.eth_aa),
    asian:        n(fd.eth_asian),
  };
}

// ─── Age profile display label (Fix 3) ───────────────────────
// Returns "18-24 Core (47.6%) × 60% Female" from raw form inputs.
// Falls back to "No demographics — default weights applied" when blank.

const _AGE_DEMO_BRACKETS = [
  { label: "13-17", m: "d_13_17_m", f: "d_13_17_f" },
  { label: "18-24", m: "d_18_24_m", f: "d_18_24_f" },
  { label: "25-34", m: "d_25_34_m", f: "d_25_34_f" },
  { label: "35-44", m: "d_35_44_m", f: "d_35_44_f" },
  { label: "45-64", m: "d_45_64_m", f: "d_45_64_f" },
  { label: "65+",   m: "d_65_m",    f: "d_65_f"    },
];

export function getAgeProfileLabel(
  inputs: EvalFormData | Record<string, string> | null | undefined
): string {
  if (!inputs) return "No demographics — default weights applied";
  const p = (k: string): number => parseFloat((inputs as Record<string, string>)[k] ?? "") || 0;
  const brackets = _AGE_DEMO_BRACKETS.map((b) => ({
    label: b.label,
    mVal: p(b.m),
    fVal: p(b.f),
    total: p(b.m) + p(b.f),
  }));
  const grandTotal = brackets.reduce((s, b) => s + b.total, 0);
  if (grandTotal === 0) return "No demographics — default weights applied";
  const dom = brackets.reduce((best, cur) => (cur.total > best.total ? cur : best), brackets[0]);
  const totalM = brackets.reduce((s, b) => s + b.mVal, 0);
  const totalF = brackets.reduce((s, b) => s + b.fVal, 0);
  const totalMF = totalM + totalF;
  const genderLabel = totalM >= totalF ? "Male" : "Female";
  const genderPct = totalMF > 0 ? Math.round((Math.max(totalM, totalF) / totalMF) * 100) : 0;
  return `${dom.label} Core (${dom.total.toFixed(1)}%) × ${genderPct}% ${genderLabel}`;
}

const VALID_GENRES: Genre[] = [
  "Rock / Alt / Indie",
  "Country / Americana",
  "Metal / Hard Rock",
  "Pop",
  "Punk / Hardcore / Pop-Punk / Emo",
  "Southern Rock / Blues Rock",
  "Progressive Rock / Prog Metal",
  "EDM / Dance / Electronic",
  "Hip-Hop / Rap",
  "R&B / Soul",
  "Latin / Regional Mexican",
  "Christian / Gospel / Worship",
  "Folk / Singer-Songwriter",
  "Bluegrass / Roots",
  "Jam Band / Jam Rock",
  "K-Pop / J-Pop / J-Rock",
  "Reggae / Ska",
  "Jazz / Blues (Traditional)",
  "Broadway / Theater",
];

function normalizeGenre(raw: string): Genre {
  const exact = VALID_GENRES.find((g) => g === raw);
  if (exact) return exact;
  const lower = raw.toLowerCase().trim();
  return VALID_GENRES.find((g) => g.toLowerCase() === lower) ?? "Rock / Alt / Indie";
}

export function buildScoringInputs(fd: EvalFormData): ScoringInputs | null {
  if (!fd.genre) return null;
  const fv = n(fd.face_value);
  const rp = n(fd.resale_price);
  return {
    genre: normalizeGenre(fd.genre),
    demographics: buildDemographics(fd),
    venue_capacity: nOr(fd.venue_capacity, 0),
    sell_through_pct: nOr(fd.sell_through_pct, 0),
    num_dates: nOr(fd.num_dates, 0),
    market_coverage: nOr(fd.market_coverage, 1),
    resale_situation: fd.resale_situation,
    resale_to_face_ratio: fv && rp && fv > 0 ? rp / fv : undefined,
    vip_level: fd.vip_level,
    spotify_monthly_listeners: nOr(fd.spotify_monthly_listeners, 0),
    fan_concentration_ratio: nOr(fd.fan_concentration_ratio, 0),
    p2_fan_identity: nOr(fd.p2_fan_identity, 1),
    ig_followers: nOr(fd.ig_followers, 0),
    ig_er_pct: n(fd.ig_er_pct),
    reddit_members: nOr(fd.reddit_members, 0),
    discord_members: n(fd.discord_members),
    merch_sentiment: nOr(fd.merch_sentiment, 1),
    tiktok_followers: nOr(fd.tiktok_followers, 0),
    tiktok_avg_views: n(fd.tiktok_avg_views),
    youtube_subscribers: nOr(fd.youtube_subscribers, 0),
    youtube_er_pct: n(fd.youtube_er_pct),
    store_quality: nOr(fd.store_quality, 1),
    merch_range: (nOr(fd.merch_range, 1) as MerchRangeOption),
    price_point_highest: n(fd.price_point_highest),
    d2c_level: (nOr(fd.d2c_level, 1) as D2CLevel),
    spotify_yoy_pct: n(fd.spotify_yoy_pct),
    album_cycle_override: fd.show_album_cycle && fd.album_cycle_override
      ? (fd.album_cycle_override as AlbumCycleOverride)
      : null,
    venue_progression: (fd.venue_progression as VenueProgressionOption) || "same",
    ig_30day_gain: n(fd.ig_30day_gain),
    press_score: nOr(fd.press_score, 1),
    playlist_score: nOr(fd.playlist_score, 1),
  };
}

export function fmt(n: number): string {
  return n.toLocaleString();
}

export function fmtScore(n: number): string {
  return n.toFixed(2);
}
