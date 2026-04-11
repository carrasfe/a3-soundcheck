// ─────────────────────────────────────────────────────────────
// Default scoring model configuration
// Mirrors the hardcoded constants in /lib/scoring-engine.ts.
// The admin UI reads from model_config (DB) or falls back here.
// ─────────────────────────────────────────────────────────────

export type ThreeTier<K extends string> = Record<K, [number, number, number, number]>;

export interface ModelConfig {
  /** FCR score thresholds per genre: [T1, T2, T3, T4] as pct */
  fcr_thresholds: Record<string, [number, number, number, number]>;

  /** Reddit member count thresholds per genre tier */
  reddit_thresholds: ThreeTier<"HIGH" | "MEDIUM" | "LOW">;

  /** YouTube ER% thresholds per genre tier */
  youtube_thresholds: ThreeTier<"HIGH" | "MEDIUM" | "LOW">;

  /** Price-point dollar thresholds per genre pricing group */
  price_thresholds: ThreeTier<"PREMIUM" | "STANDARD" | "VALUE">;

  /** Tier classification score thresholds per revenue tier */
  tier_thresholds: Record<
    "PREMIUM" | "HIGH" | "STANDARD" | "LOW",
    { priority: number; active: number; watch: number }
  >;

  /** Pillar weights by key "{ageBracket}_{touringBracket}" → [p1%, p2%, p3%, p4%] */
  pillar_weight_matrix: Record<string, [number, number, number, number]>;

  /** P2 sub-weights by genre group → [FCR, FanID, IG_ER, Reddit, MerchSent, TikTok, YouTube] */
  p2_sub_weights: Record<string, [number, number, number, number, number, number, number]>;

  /** Audience reach breakpoints [t1, t2, t3, t4] separating scores 1–5 */
  audience_reach_thresholds: [number, number, number, number];
}

export const DEFAULT_MODEL_CONFIG: ModelConfig = {
  fcr_thresholds: {
    "Rock / Alt / Indie":                [8,  15, 25, 40],
    "Country / Americana":               [10, 18, 30, 45],
    "Metal / Hard Rock":                 [10, 20, 35, 50],
    "Pop":                               [3,   8, 18, 30],
    "Punk / Hardcore / Pop-Punk / Emo":  [10, 20, 35, 50],
    "Southern Rock / Blues Rock":        [8,  18, 30, 42],
    "Progressive Rock / Prog Metal":     [12, 25, 40, 55],
    "EDM / Dance / Electronic":          [3,   8, 15, 25],
    "Hip-Hop / Rap":                     [4,  10, 18, 30],
    "R&B / Soul":                        [5,  12, 22, 32],
    "Latin / Regional Mexican":          [5,  12, 22, 35],
    "Christian / Gospel / Worship":      [8,  18, 30, 45],
    "Folk / Singer-Songwriter":          [8,  18, 28, 40],
    "Bluegrass / Roots":                 [10, 20, 32, 48],
    "Jam Band / Jam Rock":               [10, 22, 38, 55],
    "K-Pop / J-Pop / J-Rock":           [8,  18, 30, 45],
    "Reggae / Ska":                      [6,  15, 25, 38],
    "Jazz / Blues (Traditional)":        [8,  18, 30, 42],
    "Broadway / Theater":                [5,  12, 20, 32],
  },

  reddit_thresholds: {
    HIGH:   [50,  200,  1000,  5000],
    MEDIUM: [30,  120,   500,  2500],
    LOW:    [15,   50,   200,  1000],
  },

  youtube_thresholds: {
    HIGH:   [1.00, 2.25, 4.00, 6.50],
    MEDIUM: [0.75, 1.50, 3.50, 6.00],
    LOW:    [0.30, 1.00, 2.50, 4.50],
  },

  price_thresholds: {
    PREMIUM:  [30, 50,  70, 100],
    STANDARD: [25, 40,  60,  80],
    VALUE:    [20, 30,  50,  65],
  },

  tier_thresholds: {
    PREMIUM:  { priority: 3.2, active: 2.4, watch: 1.6 },
    HIGH:     { priority: 3.6, active: 2.7, watch: 1.8 },
    STANDARD: { priority: 4.0, active: 3.0, watch: 2.0 },
    LOW:      { priority: 4.3, active: 3.3, watch: 2.3 },
  },

  pillar_weight_matrix: {
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
  },

  p2_sub_weights: {
    ROCK:    [0.22, 0.20, 0.13, 0.12, 0.13, 0.10, 0.10],
    COUNTRY: [0.24, 0.20, 0.14, 0.08, 0.16, 0.12, 0.06],
    PUNK:    [0.20, 0.24, 0.10, 0.14, 0.16, 0.06, 0.10],
    POP:     [0.18, 0.18, 0.16, 0.08, 0.12, 0.14, 0.14],
    HIPHOP:  [0.16, 0.16, 0.14, 0.10, 0.12, 0.20, 0.12],
    EDM:     [0.14, 0.14, 0.14, 0.14, 0.12, 0.18, 0.14],
    KPOP:    [0.16, 0.24, 0.10, 0.08, 0.14, 0.14, 0.14],
    RBL:     [0.18, 0.16, 0.18, 0.06, 0.12, 0.18, 0.12],
    JAM:     [0.24, 0.22, 0.12, 0.10, 0.18, 0.06, 0.08],
  },

  audience_reach_thresholds: [3000, 10000, 40000, 100000],
};

// ─── Genre-to-tier assignments (for display reference) ───────

export const REDDIT_GENRE_TIERS: Record<string, "HIGH" | "MEDIUM" | "LOW"> = {
  "Rock / Alt / Indie": "HIGH",
  "Metal / Hard Rock": "HIGH",
  "Punk / Hardcore / Pop-Punk / Emo": "HIGH",
  "Progressive Rock / Prog Metal": "HIGH",
  "EDM / Dance / Electronic": "HIGH",
  "Hip-Hop / Rap": "HIGH",
  "K-Pop / J-Pop / J-Rock": "HIGH",
  "Pop": "MEDIUM",
  "Jam Band / Jam Rock": "MEDIUM",
  "Folk / Singer-Songwriter": "MEDIUM",
  "Reggae / Ska": "MEDIUM",
  "Jazz / Blues (Traditional)": "MEDIUM",
  "Broadway / Theater": "MEDIUM",
  "Country / Americana": "LOW",
  "Southern Rock / Blues Rock": "LOW",
  "R&B / Soul": "LOW",
  "Latin / Regional Mexican": "LOW",
  "Christian / Gospel / Worship": "LOW",
  "Bluegrass / Roots": "LOW",
};

export const YOUTUBE_GENRE_TIERS: Record<string, "HIGH" | "MEDIUM" | "LOW"> = {
  ...REDDIT_GENRE_TIERS,
};

export const PRICE_GENRE_TIERS: Record<string, "PREMIUM" | "STANDARD" | "VALUE"> = {
  "Pop": "PREMIUM",
  "Hip-Hop / Rap": "PREMIUM",
  "K-Pop / J-Pop / J-Rock": "PREMIUM",
  "EDM / Dance / Electronic": "PREMIUM",
  "Broadway / Theater": "PREMIUM",
  "Punk / Hardcore / Pop-Punk / Emo": "VALUE",
  "Reggae / Ska": "VALUE",
  "Jazz / Blues (Traditional)": "VALUE",
  "Rock / Alt / Indie": "STANDARD",
  "Country / Americana": "STANDARD",
  "Metal / Hard Rock": "STANDARD",
  "Southern Rock / Blues Rock": "STANDARD",
  "Progressive Rock / Prog Metal": "STANDARD",
  "R&B / Soul": "STANDARD",
  "Latin / Regional Mexican": "STANDARD",
  "Christian / Gospel / Worship": "STANDARD",
  "Folk / Singer-Songwriter": "STANDARD",
  "Bluegrass / Roots": "STANDARD",
  "Jam Band / Jam Rock": "STANDARD",
};
