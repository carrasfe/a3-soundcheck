// ============================================================
// A3 Soundcheck — Scoring Engine
// ============================================================

// ─── Genre definitions ───────────────────────────────────────
export type Genre =
  | "Rock / Alt / Indie"
  | "Country / Americana"
  | "Metal / Hard Rock"
  | "Pop"
  | "Punk / Hardcore / Pop-Punk / Emo"
  | "Southern Rock / Blues Rock"
  | "Progressive Rock / Prog Metal"
  | "EDM / Dance / Electronic"
  | "Hip-Hop / Rap"
  | "R&B / Soul"
  | "Latin / Regional Mexican"
  | "Christian / Gospel / Worship"
  | "Folk / Singer-Songwriter"
  | "Bluegrass / Roots"
  | "Jam Band / Jam Rock"
  | "K-Pop / J-Pop / J-Rock"
  | "Reggae / Ska"
  | "Jazz / Blues (Traditional)"
  | "Broadway / Theater";

export type GenreGroup =
  | "ROCK"
  | "COUNTRY"
  | "PUNK"
  | "POP"
  | "HIPHOP"
  | "EDM"
  | "KPOP"
  | "RBL"
  | "JAM";

// ─── Input types ─────────────────────────────────────────────
export interface DemographicsInput {
  /** Percentages for each age bracket (must sum to ~100) */
  age_13_17?: number;
  age_18_24?: number;
  age_25_34?: number;
  age_35_44?: number;
  age_45_64?: number;
  age_65_plus?: number;
  /** Ethnicity percentages */
  hispanic?: number;
  african_american?: number;
  asian?: number;
}

export type VipLevel =
  | "none"
  | "offered_before"
  | "basic"
  | "premium_mg"
  | "tiered_high";

export type ResaleSituation =
  | "not_sold_out"
  | "some_sold_out"
  | "all_sold_out";

export type VenueProgressionOption =
  | "smaller"
  | "same"
  | "slight_step_up"
  | "major_jump"
  | "tier_change";

export type MerchRangeOption = 1 | 2 | 3 | 4 | 5;

export type D2CLevel = 1 | 2 | 3 | 4;

export type AlbumCycleOverride =
  | "peak_declining"
  | "normalizing"
  | "anticipation"
  | null;

export interface ScoringInputs {
  genre: Genre;
  demographics?: DemographicsInput;

  // ── Pillar 1 ──
  venue_capacity: number;
  sell_through_pct: number;       // 0–100
  num_dates: number;
  market_coverage: number;        // 1–5 manual
  resale_situation: ResaleSituation;
  resale_to_face_ratio?: number;  // e.g. 2.5 means 2.5x face; required for some/all sold out
  vip_level: VipLevel;

  // ── Pillar 2 ──
  spotify_monthly_listeners: number;
  fan_concentration_ratio: number; // FCR as percentage 0–100
  p2_fan_identity: number;         // 1–5 manual: Fan Identity Signaling (1=No fan culture … 5=Deep tribal identity)
  ig_followers: number;
  ig_er_pct?: number;             // if provided directly; else calculated from followers
  reddit_members: number;
  discord_members?: number;
  merch_sentiment: number;        // 1–5 manual
  tiktok_followers: number;
  tiktok_avg_views?: number;      // used to calc TikTok ER
  youtube_subscribers: number;
  youtube_er_pct?: number;        // engagement rate % entered directly (e.g. 2.5 means 2.5%)

  // ── Pillar 3 ──
  store_quality: number;          // 1–5 manual
  merch_range: MerchRangeOption;
  price_point_highest?: number;   // highest-priced non-music item in dollars
  d2c_level: D2CLevel;

  // ── Pillar 4 ──
  spotify_yoy_pct?: number;       // year-over-year % change
  album_cycle_override?: AlbumCycleOverride;
  venue_progression: VenueProgressionOption;
  ig_30day_gain?: number;         // absolute follower gain over 30 days
  press_score: number;            // 1–5 manual
  playlist_score: number;         // 1–5 manual
}

// ─── Output types ────────────────────────────────────────────
export interface PillarBreakdown {
  sub_scores: Record<string, number>;
  weighted_score: number;
  bonus?: number;
  final_score: number;
}

export interface ScoringResult {
  genre: Genre;
  genre_group: GenreGroup;
  age_bracket: number;
  touring_bracket: number;
  pillar_weights: { p1: number; p2: number; p3: number; p4: number };
  p1: PillarBreakdown;
  p2: PillarBreakdown & {
    sub_weights: Record<string, number>;
    tiktok_age_adjusted_weight: number;
    youtube_excluded: boolean;
  };
  p3: PillarBreakdown;
  p4: PillarBreakdown;
  total_score: number;
  revenue_tier: "PREMIUM" | "HIGH" | "STANDARD" | "LOW";
  tier_label: "Priority" | "Active" | "Watch" | "Pass";
  action: string;
}

// ============================================================
// Constants
// ============================================================

const GENRE_GROUP_MAP: Record<Genre, GenreGroup> = {
  "Rock / Alt / Indie": "ROCK",
  "Southern Rock / Blues Rock": "ROCK",
  "Progressive Rock / Prog Metal": "ROCK",
  "Country / Americana": "COUNTRY",
  "Folk / Singer-Songwriter": "COUNTRY",
  "Bluegrass / Roots": "COUNTRY",
  "Punk / Hardcore / Pop-Punk / Emo": "PUNK",
  "Metal / Hard Rock": "PUNK",
  "Pop": "POP",
  "Broadway / Theater": "POP",
  "Hip-Hop / Rap": "HIPHOP",
  "EDM / Dance / Electronic": "EDM",
  "K-Pop / J-Pop / J-Rock": "KPOP",
  "R&B / Soul": "RBL",
  "Latin / Regional Mexican": "RBL",
  "Reggae / Ska": "RBL",
  "Jam Band / Jam Rock": "JAM",
  "Jazz / Blues (Traditional)": "JAM",
  "Christian / Gospel / Worship": "JAM",
};

// P2 sub-weights by genre group: [FCR, FanID, IG_ER, Reddit, MerchSent, TikTok, YouTube]
const P2_SUB_WEIGHTS: Record<GenreGroup, [number, number, number, number, number, number, number]> = {
  ROCK:    [0.22, 0.20, 0.13, 0.12, 0.13, 0.10, 0.10],
  COUNTRY: [0.24, 0.20, 0.14, 0.08, 0.16, 0.12, 0.06],
  PUNK:    [0.20, 0.24, 0.10, 0.14, 0.16, 0.06, 0.10],
  POP:     [0.18, 0.18, 0.16, 0.08, 0.12, 0.14, 0.14],
  HIPHOP:  [0.16, 0.16, 0.14, 0.10, 0.12, 0.20, 0.12],
  EDM:     [0.14, 0.14, 0.14, 0.14, 0.12, 0.18, 0.14],
  KPOP:    [0.16, 0.24, 0.10, 0.08, 0.14, 0.14, 0.14],
  RBL:     [0.18, 0.16, 0.18, 0.06, 0.12, 0.18, 0.12],
  JAM:     [0.24, 0.22, 0.12, 0.10, 0.18, 0.06, 0.08],
};

// Pillar weight matrix [age_bracket][touring_bracket] = [p1, p2, p3, p4]
const PILLAR_WEIGHT_MATRIX: Record<string, [number, number, number, number]> = {
  "1_1": [30, 38, 22, 10],
  "1_2": [35, 35, 20, 10],
  "1_3": [38, 32, 20, 10],
  "1_4": [40, 30, 20, 10],
  "2_1": [35, 33, 22, 10],
  "2_2": [40, 30, 20, 10],
  "2_3": [43, 25, 22, 10],
  "2_4": [45, 22, 23, 10],
  "3_1": [38, 28, 24, 10],
  "3_2": [42, 25, 23, 10],
  "3_3": [45, 20, 25, 10],
  "3_4": [48, 17, 25, 10],
  "4_1": [42, 22, 26, 10],
  "4_2": [45, 18, 27, 10],
  "4_3": [48, 15, 27, 10],
  "4_4": [52, 12, 26, 10],
  "5_1": [45, 18, 27, 10],
  "5_2": [48, 14, 28, 10],
  "5_3": [52, 10, 28, 10],
  "5_4": [55,  8, 27, 10],
};

// VIP level bonus values
const VIP_BONUS: Record<VipLevel, number> = {
  none: 0.00,
  offered_before: 0.05,
  basic: 0.10,
  premium_mg: 0.15,
  tiered_high: 0.20,
};

// Affinity scores [13-17, 18-24, 25-34, 35-44, 45-64, 65+]
const PLATFORM_AFFINITY: Record<string, [number, number, number, number, number, number]> = {
  TikTok:    [0.95, 0.90, 0.60, 0.30, 0.10, 0.03],
  Discord:   [0.70, 0.65, 0.40, 0.15, 0.05, 0.02],
  IG_ER:     [0.80, 0.85, 0.75, 0.55, 0.30, 0.15],
  IG_Growth: [0.90, 0.85, 0.60, 0.35, 0.15, 0.05],
  Reddit:    [0.50, 0.75, 0.70, 0.40, 0.20, 0.05],
  Playlist:  [0.85, 0.90, 0.70, 0.50, 0.30, 0.15],
};

// FCR thresholds per genre (T1/T2/T3/T4 as pct)
const FCR_THRESHOLDS: Record<Genre, [number, number, number, number]> = {
  "Rock / Alt / Indie":           [8,  15, 25, 40],
  "Country / Americana":          [10, 18, 30, 45],
  "Metal / Hard Rock":            [10, 20, 35, 50],
  "Pop":                          [3,   8, 18, 30],
  "Punk / Hardcore / Pop-Punk / Emo": [10, 20, 35, 50],
  "Southern Rock / Blues Rock":   [8,  18, 30, 42],
  "Progressive Rock / Prog Metal":[12, 25, 40, 55],
  "EDM / Dance / Electronic":     [3,   8, 15, 25],
  "Hip-Hop / Rap":                [4,  10, 18, 30],
  "R&B / Soul":                   [5,  12, 22, 32],
  "Latin / Regional Mexican":     [5,  12, 22, 35],
  "Christian / Gospel / Worship": [8,  18, 30, 45],
  "Folk / Singer-Songwriter":     [8,  18, 28, 40],
  "Bluegrass / Roots":            [10, 20, 32, 48],
  "Jam Band / Jam Rock":          [10, 22, 38, 55],
  "K-Pop / J-Pop / J-Rock":      [8,  18, 30, 45],
  "Reggae / Ska":                 [6,  15, 25, 38],
  "Jazz / Blues (Traditional)":  [8,  18, 30, 42],
  "Broadway / Theater":           [5,  12, 20, 32],
};

// Reddit genre tiers
const REDDIT_HIGH_GENRES = new Set<Genre>([
  "Rock / Alt / Indie", "Metal / Hard Rock",
  "Punk / Hardcore / Pop-Punk / Emo", "Progressive Rock / Prog Metal",
  "EDM / Dance / Electronic", "Hip-Hop / Rap", "K-Pop / J-Pop / J-Rock",
]);
const REDDIT_MEDIUM_GENRES = new Set<Genre>([
  "Pop", "Jam Band / Jam Rock", "Folk / Singer-Songwriter",
  "Reggae / Ska", "Jazz / Blues (Traditional)", "Broadway / Theater",
]);
// LOW = all others

// YouTube genre tiers
const YT_HIGH_GENRES = new Set<Genre>([
  "Rock / Alt / Indie", "Metal / Hard Rock",
  "Punk / Hardcore / Pop-Punk / Emo", "Progressive Rock / Prog Metal",
  "EDM / Dance / Electronic", "Hip-Hop / Rap", "K-Pop / J-Pop / J-Rock",
]);
const YT_MEDIUM_GENRES = new Set<Genre>([
  "Pop", "Jam Band / Jam Rock", "Folk / Singer-Songwriter",
  "Reggae / Ska", "Jazz / Blues (Traditional)", "Broadway / Theater",
]);

// Price point tier genres
const PRICE_PREMIUM_GENRES = new Set<Genre>(["Pop", "Hip-Hop / Rap", "K-Pop / J-Pop / J-Rock", "EDM / Dance / Electronic", "Broadway / Theater"]);
const PRICE_VALUE_GENRES = new Set<Genre>(["Punk / Hardcore / Pop-Punk / Emo", "Reggae / Ska", "Jazz / Blues (Traditional)"]);

// Revenue tier genres
const REVENUE_PREMIUM_GENRES = new Set<Genre>(["K-Pop / J-Pop / J-Rock"]);
const REVENUE_HIGH_GENRES = new Set<Genre>(["Punk / Hardcore / Pop-Punk / Emo"]);
const REVENUE_LOW_GENRES = new Set<Genre>([
  "R&B / Soul", "Latin / Regional Mexican", "Reggae / Ska", "Jazz / Blues (Traditional)",
]);

// ============================================================
// Helper utilities
// ============================================================

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function scoreFromThresholds(value: number, thresholds: number[], scores: number[]): number {
  // thresholds: [t1, t2, t3, t4], scores: [1, 2, 3, 4, 5]
  for (let i = 0; i < thresholds.length; i++) {
    if (value < thresholds[i]) return scores[i];
  }
  return scores[scores.length - 1];
}

// ─── Demographic helpers ──────────────────────────────────────

function getAgeBrackets(demo?: DemographicsInput): [number, number, number, number, number, number] {
  if (!demo) return [0, 0, 0, 0, 0, 0];
  return [
    (demo.age_13_17  ?? 0) / 100,
    (demo.age_18_24  ?? 0) / 100,
    (demo.age_25_34  ?? 0) / 100,
    (demo.age_35_44  ?? 0) / 100,
    (demo.age_45_64  ?? 0) / 100,
    (demo.age_65_plus ?? 0) / 100,
  ];
}

function computeAffinity(platform: string, brackets: [number, number, number, number, number, number]): number {
  const weights = PLATFORM_AFFINITY[platform];
  return brackets.reduce((sum, b, i) => sum + b * weights[i], 0);
}

function affinityMultiplier(platform: string, demo?: DemographicsInput): number {
  if (!demo) return 1.0; // default affinity 0.55 / 0.55
  const brackets = getAgeBrackets(demo);
  const totalPct = brackets.reduce((s, b) => s + b, 0);
  if (totalPct < 0.01) return 1.0;
  const affinity = computeAffinity(platform, brackets);
  return clamp(affinity / 0.55, 0.3, 2.0);
}

function getPctUnder35(demo?: DemographicsInput): number {
  if (!demo) return 60; // default → bracket 2 (Young)
  return (demo.age_13_17 ?? 0) + (demo.age_18_24 ?? 0) + (demo.age_25_34 ?? 0);
}

function getAgeBracket(demo?: DemographicsInput): number {
  const pct = getPctUnder35(demo);
  if (pct >= 70) return 1;
  if (pct >= 55) return 2;
  if (pct >= 45) return 3;
  if (pct >= 30) return 4;
  return 5;
}

function getTouringBracket(capacity: number, dates: number): number {
  if (capacity >= 4000 && dates >= 40) return 4; // Massive
  if (capacity >= 4000 || dates >= 40) return 3; // Heavy
  if (capacity >= 1500 && dates >= 15 && dates <= 40) return 2; // Moderate
  return 1; // Light
}

// ============================================================
// Pillar 1
// ============================================================

function scoreVenueCapacity(cap: number): number {
  if (cap < 500)  return 1;
  if (cap < 1500) return 2;
  if (cap < 2500) return 3;
  if (cap < 5000) return 4;
  return 5;
}

function scoreSellThrough(pct: number): number {
  if (pct < 60) return 1;
  if (pct < 75) return 2;
  if (pct < 85) return 3;
  if (pct < 95) return 4;
  return 5;
}

function scoreTotalAudienceReach(capacity: number, dates: number, sellThroughPct: number): number {
  const reach = capacity * dates * (sellThroughPct / 100);
  if (reach < 3000)   return 1;
  if (reach < 10000)  return 2;
  if (reach < 40000)  return 3;
  if (reach < 100000) return 4;
  return 5;
}

function profileScore(avg: number): number {
  if (avg < 2)   return 1;
  if (avg < 2.5) return 1.5;
  if (avg < 3)   return 2;
  if (avg < 3.5) return 2.5;
  if (avg < 4)   return 3;
  if (avg < 4.5) return 3.5;
  return 4;
}

function multiplierScore(ratio: number): number {
  if (ratio <= 1)   return 2;
  if (ratio <= 1.5) return 3;
  if (ratio <= 2.5) return 4;
  return 5;
}

function scoreResale(
  situation: ResaleSituation,
  ratio: number | undefined,
  otherP1Avg: number
): number {
  const ps = profileScore(otherP1Avg);
  if (situation === "not_sold_out") return ps;

  const ms = multiplierScore(ratio ?? 1);

  if (situation === "some_sold_out") {
    return Math.max(ps, ms);
  }

  // all_sold_out
  const floor = otherP1Avg > 3 ? 3 : 2;
  if (!ratio || ratio <= 1) return Math.max(floor, ps);
  if (ratio <= 1.5) return 3;
  if (ratio <= 2.5) return 4;
  return 5;
}

function computeP1(inputs: ScoringInputs): PillarBreakdown {
  const cap  = scoreVenueCapacity(inputs.venue_capacity);
  const st   = scoreSellThrough(inputs.sell_through_pct);
  const tar  = scoreTotalAudienceReach(inputs.venue_capacity, inputs.num_dates, inputs.sell_through_pct);
  const mkt  = inputs.market_coverage;

  // Resale uses average of other four sub-scores
  const otherAvg = (cap * 0.25 + st * 0.20 + tar * 0.20 + mkt * 0.15) / (0.25 + 0.20 + 0.20 + 0.15);
  const resale   = scoreResale(inputs.resale_situation, inputs.resale_to_face_ratio, otherAvg);

  const weighted =
    cap    * 0.25 +
    st     * 0.20 +
    tar    * 0.20 +
    mkt    * 0.15 +
    resale * 0.20;

  const bonus     = VIP_BONUS[inputs.vip_level];
  const finalScore = weighted + bonus;

  return {
    sub_scores: { venue_capacity: cap, sell_through: st, total_audience_reach: tar, market_coverage: mkt, resale: resale },
    weighted_score: weighted,
    bonus,
    final_score: finalScore,
  };
}

// ============================================================
// Pillar 2
// ============================================================

function scoreFCR(genre: Genre, fcr: number, monthlyListeners: number): number {
  if (fcr > 60) return 3; // micro-artist gate cap

  const listenerMult = monthlyListeners >= 3_000_000 ? 0.65
                     : monthlyListeners >= 1_000_000 ? 0.80
                     : 1.0;

  const [t1, t2, t3, t4] = (FCR_THRESHOLDS[genre] ?? FCR_THRESHOLDS["Rock / Alt / Indie"]).map(t => t * listenerMult);

  if (fcr < t1) return 1;
  if (fcr < t2) return 2;
  if (fcr < t3) return 3;
  if (fcr < t4) return 4;
  return 5;
}

function scoreIgEr(igFollowers: number, igErPct: number | undefined, demo?: DemographicsInput): number {
  if (igErPct === undefined || igErPct === null) return 0;

  const maxScore = igFollowers < 10_000 ? 1 : igFollowers < 50_000 ? 3 : 5;
  const mult     = affinityMultiplier("IG_ER", demo);

  const hispMod = (() => {
    const h = demo?.hispanic ?? 0;
    return h > 30 ? 1.2 : h > 15 ? 1.1 : 1.0;
  })();

  const [t1, t2, t3, t4] = [1, 2, 4, 7].map(t => t * mult * hispMod);

  let score: number;
  if (igErPct < t1) score = 1;
  else if (igErPct < t2) score = 2;
  else if (igErPct < t3) score = 3;
  else if (igErPct < t4) score = 4;
  else score = 5;

  return Math.min(score, maxScore);
}

function scoreReddit(genre: Genre, members: number, demo?: DemographicsInput): number {
  const mult = affinityMultiplier("Reddit", demo);

  let thresholds: [number, number, number, number];
  if (REDDIT_HIGH_GENRES.has(genre)) {
    thresholds = [50, 200, 1000, 5000];
  } else if (REDDIT_MEDIUM_GENRES.has(genre)) {
    thresholds = [30, 120, 500, 2500];
  } else {
    thresholds = [15, 50, 200, 1000];
  }

  const [t1, t2, t3, t4] = thresholds.map(t => t * mult);
  if (members < t1) return 1;
  if (members < t2) return 2;
  if (members < t3) return 3;
  if (members < t4) return 4;
  return 5;
}

function discordBonus(members?: number): number {
  if (!members || members === 0) return 0.00;
  if (members <    500) return 0.05;
  if (members <  2_000) return 0.10;
  if (members <  8_000) return 0.15;
  if (members < 25_000) return 0.20;
  return 0.30;
}

function scoreTikTokEr(followers: number, avgViews?: number, demo?: DemographicsInput): number {
  if (avgViews === undefined || avgViews === null) return 0;

  const maxScore = followers < 15_000 ? 1 : followers < 75_000 ? 3 : 5;
  const erPct    = followers > 0 ? (avgViews / followers) * 100 : 0;
  const mult     = affinityMultiplier("TikTok", demo);

  const aaMod = (() => {
    const aa = demo?.african_american ?? 0;
    return aa > 30 ? 1.2 : aa > 15 ? 1.1 : 1.0;
  })();

  const [t1, t2, t3, t4] = [2, 4, 6, 10].map(t => t * mult * aaMod);

  let score: number;
  if (erPct < t1) score = 1;
  else if (erPct < t2) score = 2;
  else if (erPct < t3) score = 3;
  else if (erPct < t4) score = 4;
  else score = 5;

  return Math.min(score, maxScore);
}

function scoreYouTubeEr(genre: Genre, subs: number, erPct?: number): number {
  if (erPct === undefined || erPct === null) return 0;
  if (subs === 0) return 0;

  const maxScore = subs < 5_000 ? 1 : subs < 50_000 ? 3 : 5;

  let thresholds: [number, number, number, number];
  if (YT_HIGH_GENRES.has(genre)) {
    thresholds = [1.0, 2.25, 4.0, 6.5];
  } else if (YT_MEDIUM_GENRES.has(genre)) {
    thresholds = [0.75, 1.5, 3.5, 6.0];
  } else {
    thresholds = [0.3, 1.0, 2.5, 4.5];
  }

  let score: number;
  if (erPct < thresholds[0]) score = 1;
  else if (erPct < thresholds[1]) score = 2;
  else if (erPct < thresholds[2]) score = 3;
  else if (erPct < thresholds[3]) score = 4;
  else score = 5;

  return Math.min(score, maxScore);
}

function tiktokAgeAdjustedWeight(baseWeight: number, demo?: DemographicsInput): number {
  const pctUnder35 = getPctUnder35(demo);
  if (pctUnder35 >= 55) return baseWeight;           // Very Young or Young
  if (pctUnder35 >= 45) return baseWeight * 0.65;    // Mixed
  if (pctUnder35 >= 30) return baseWeight * 0.38;    // Mature
  return baseWeight * 0.19;                           // Very Mature
}

function computeP2(inputs: ScoringInputs): PillarBreakdown & {
  sub_weights: Record<string, number>;
  tiktok_age_adjusted_weight: number;
  youtube_excluded: boolean;
} {
  const group = GENRE_GROUP_MAP[inputs.genre] ?? "ROCK";
  const [wFCR, wFanID, wIGER, wReddit, wMerch, wTikTok, wYT] = P2_SUB_WEIGHTS[group];

  // Scores
  const fcrScore     = scoreFCR(inputs.genre, inputs.fan_concentration_ratio, inputs.spotify_monthly_listeners);
  const fanIDScore   = inputs.p2_fan_identity;
  const igErScore    = scoreIgEr(inputs.ig_followers, inputs.ig_er_pct, inputs.demographics);
  const redditScore  = scoreReddit(inputs.genre, inputs.reddit_members, inputs.demographics);
  const merchScore   = inputs.merch_sentiment;
  const tiktokScore  = scoreTikTokEr(inputs.tiktok_followers, inputs.tiktok_avg_views, inputs.demographics);
  const ytScore      = scoreYouTubeEr(inputs.genre, inputs.youtube_subscribers, inputs.youtube_er_pct);

  // TikTok age-adjusted weight
  const ttAdjWeight  = tiktokAgeAdjustedWeight(wTikTok, inputs.demographics);
  const ttFreed      = wTikTok - ttAdjWeight;

  // Redistribute freed TikTok weight evenly to FanID and MerchSent
  const wFanIDAdj    = wFanID  + ttFreed / 2;
  const wMerchAdj    = wMerch  + ttFreed / 2;

  // YouTube semi-optional: exclude if score 0 or 1
  const ytExcluded   = ytScore <= 1;
  let finalWeights = {
    FCR:    wFCR,
    FanID:  wFanIDAdj,
    IG_ER:  wIGER,
    Reddit: wReddit,
    MerchSent: wMerchAdj,
    TikTok: ttAdjWeight,
    YouTube: ytExcluded ? 0 : wYT,
  };

  if (ytExcluded && wYT > 0) {
    // Redistribute YouTube weight proportionally among remaining metrics
    const totalRemaining = finalWeights.FCR + finalWeights.FanID + finalWeights.IG_ER +
      finalWeights.Reddit + finalWeights.MerchSent + finalWeights.TikTok;
    const scale = (totalRemaining + wYT) / totalRemaining;
    finalWeights = {
      FCR:      finalWeights.FCR      * scale,
      FanID:    finalWeights.FanID    * scale,
      IG_ER:    finalWeights.IG_ER    * scale,
      Reddit:   finalWeights.Reddit   * scale,
      MerchSent:finalWeights.MerchSent* scale,
      TikTok:   finalWeights.TikTok   * scale,
      YouTube:  0,
    };
  }

  const weighted =
    fcrScore    * finalWeights.FCR +
    fanIDScore  * finalWeights.FanID +
    igErScore   * finalWeights.IG_ER +
    redditScore * finalWeights.Reddit +
    merchScore  * finalWeights.MerchSent +
    tiktokScore * finalWeights.TikTok +
    ytScore     * finalWeights.YouTube;

  const vipBonus     = VIP_BONUS[inputs.vip_level];
  const discBonus    = discordBonus(inputs.discord_members);
  const totalBonus   = vipBonus + discBonus;

  return {
    sub_scores: {
      FCR: fcrScore, FanID: fanIDScore, IG_ER: igErScore,
      Reddit: redditScore, MerchSent: merchScore,
      TikTok: tiktokScore, YouTube: ytScore,
    },
    sub_weights: finalWeights,
    tiktok_age_adjusted_weight: ttAdjWeight,
    youtube_excluded: ytExcluded,
    weighted_score: weighted,
    bonus: totalBonus,
    final_score: weighted + totalBonus,
  };
}

// ============================================================
// Pillar 3
// ============================================================

function scorePricePoint(genre: Genre, price?: number): number {
  if (price === undefined || price === null) return 1;

  if (PRICE_PREMIUM_GENRES.has(genre)) {
    if (price <  30) return 1;
    if (price <  50) return 2;
    if (price <  70) return 3;
    if (price < 100) return 4;
    return 5;
  }
  if (PRICE_VALUE_GENRES.has(genre)) {
    if (price <  20) return 1;
    if (price <  30) return 2;
    if (price <  50) return 3;
    if (price <  65) return 4;
    return 5; // $80+
  }
  // STANDARD
  if (price <  25) return 1;
  if (price <  40) return 2;
  if (price <  60) return 3;
  if (price <  80) return 4;
  return 5; // $100+
}

const D2C_SCORE_MAP: Record<D2CLevel, number> = { 1: 1.25, 2: 2.5, 3: 3.75, 4: 5 };

function computeP3(inputs: ScoringInputs): PillarBreakdown {
  const storeQ  = inputs.store_quality;
  const range   = inputs.merch_range as number;
  const price   = scorePricePoint(inputs.genre, inputs.price_point_highest);
  const d2c     = D2C_SCORE_MAP[inputs.d2c_level];

  const weighted =
    storeQ * 0.35 +
    range  * 0.30 +
    price  * 0.25 +
    d2c    * 0.10;

  return {
    sub_scores: { store_quality: storeQ, merch_range: range, price_point: price, d2c: d2c },
    weighted_score: weighted,
    final_score: weighted,
  };
}

// ============================================================
// Pillar 4
// ============================================================

function scoreSpotifyYoY(yoyPct: number | undefined, monthlyListeners: number): number {
  if (yoyPct === undefined || yoyPct === null) return 3; // neutral default

  if (monthlyListeners >= 2_000_000) {
    if (yoyPct < -5)  return 1;
    if (yoyPct < 2)   return 2;
    if (yoyPct < 10)  return 3;
    if (yoyPct < 30)  return 4;
    return 5;
  }
  if (monthlyListeners >= 500_000) {
    if (yoyPct < -2)  return 1;
    if (yoyPct < 5)   return 2;
    if (yoyPct < 20)  return 3;
    if (yoyPct < 45)  return 4;
    return 5;
  }
  // <500K
  if (yoyPct < 0)   return 1;
  if (yoyPct < 10)  return 2;
  if (yoyPct < 30)  return 3;
  if (yoyPct < 60)  return 4;
  return 5;
}

function scoreVenueProgression(option: VenueProgressionOption, capacity: number): number {
  if (option === "smaller") return 1;
  if (option === "same") {
    if (capacity < 1000) return 1;
    if (capacity < 2500) return 2;
    if (capacity < 5000) return 3;
    return 4;
  }
  if (option === "slight_step_up")  return 3;
  if (option === "major_jump")      return 4;
  return 5; // tier_change
}

function scoreIgGrowth(followers: number, gain30Day?: number, demo?: DemographicsInput): number {
  if (gain30Day === undefined || gain30Day === null) return 3;
  if (followers === 0) return 1;

  const growthPct = (gain30Day / followers) * 100;

  if (followers > 200_000) {
    if (growthPct < 0.15) return 1;
    if (growthPct < 0.40) return 2;
    if (growthPct < 1.5)  return 3;
    if (growthPct < 4.0)  return 4;
    return 5;
  }
  if (growthPct < 0.5) return 1;
  if (growthPct < 1.0) return 2;
  if (growthPct < 3.0) return 3;
  if (growthPct < 6.0) return 4;
  return 5;
}

function computeP4(inputs: ScoringInputs): PillarBreakdown {
  let yoyScore = scoreSpotifyYoY(inputs.spotify_yoy_pct, inputs.spotify_monthly_listeners);

  // Album cycle override: boost by 1 if score < 3, max 3
  if (inputs.album_cycle_override && yoyScore < 3) {
    yoyScore = Math.min(yoyScore + 1, 3);
  }

  const venueScore   = scoreVenueProgression(inputs.venue_progression, inputs.venue_capacity);
  const igGrowthScore = scoreIgGrowth(inputs.ig_followers, inputs.ig_30day_gain, inputs.demographics);
  const pressScore   = inputs.press_score;
  const playlistScore = inputs.playlist_score;

  const weighted =
    yoyScore      * 0.30 +
    venueScore    * 0.25 +
    igGrowthScore * 0.20 +
    pressScore    * 0.15 +
    playlistScore * 0.10;

  return {
    sub_scores: {
      spotify_yoy: yoyScore,
      venue_progression: venueScore,
      ig_growth: igGrowthScore,
      press: pressScore,
      playlist: playlistScore,
    },
    weighted_score: weighted,
    final_score: weighted,
  };
}

// ============================================================
// Revenue tier + final classification
// ============================================================

function getRevenueTier(genre: Genre): "PREMIUM" | "HIGH" | "STANDARD" | "LOW" {
  if (REVENUE_PREMIUM_GENRES.has(genre)) return "PREMIUM";
  if (REVENUE_HIGH_GENRES.has(genre))    return "HIGH";
  if (REVENUE_LOW_GENRES.has(genre))     return "LOW";
  return "STANDARD";
}

const TIER_THRESHOLDS: Record<"PREMIUM" | "HIGH" | "STANDARD" | "LOW", { priority: number; active: number; watch: number }> = {
  PREMIUM:  { priority: 3.2, active: 2.4, watch: 1.6 },
  HIGH:     { priority: 3.6, active: 2.7, watch: 1.8 },
  STANDARD: { priority: 4.0, active: 3.0, watch: 2.0 },
  LOW:      { priority: 4.3, active: 3.3, watch: 2.3 },
};

function classifyScore(
  score: number,
  revenueTier: "PREMIUM" | "HIGH" | "STANDARD" | "LOW"
): { tier_label: "Priority" | "Active" | "Watch" | "Pass"; action: string } {
  const t = TIER_THRESHOLDS[revenueTier];
  if (score >= t.priority) return { tier_label: "Priority", action: "Pursue immediately — strong commercial opportunity." };
  if (score >= t.active)   return { tier_label: "Active",   action: "Monitor closely — solid candidate for next cycle." };
  if (score >= t.watch)    return { tier_label: "Watch",    action: "Keep on radar — not ready yet." };
  return { tier_label: "Pass", action: "Pass at this time." };
}

// ============================================================
// Main export
// ============================================================

export function calculateScore(inputs: ScoringInputs): ScoringResult {
  const genre      = inputs.genre;
  const genreGroup = GENRE_GROUP_MAP[genre];

  const ageBracket     = getAgeBracket(inputs.demographics);
  const touringBracket = getTouringBracket(inputs.venue_capacity, inputs.num_dates);
  const key            = `${ageBracket}_${touringBracket}`;
  const [wp1, wp2, wp3, wp4] = PILLAR_WEIGHT_MATRIX[key].map(w => w / 100);

  const p1 = computeP1(inputs);
  const p2 = computeP2(inputs);
  const p3 = computeP3(inputs);
  const p4 = computeP4(inputs);

  const total =
    p1.final_score * wp1 +
    p2.final_score * wp2 +
    p3.final_score * wp3 +
    p4.final_score * wp4;

  const revenueTier = getRevenueTier(genre);
  const { tier_label, action } = classifyScore(total, revenueTier);

  return {
    genre,
    genre_group: genreGroup,
    age_bracket: ageBracket,
    touring_bracket: touringBracket,
    pillar_weights: { p1: wp1, p2: wp2, p3: wp3, p4: wp4 },
    p1,
    p2,
    p3,
    p4,
    total_score: total,
    revenue_tier: revenueTier,
    tier_label,
    action,
  };
}
