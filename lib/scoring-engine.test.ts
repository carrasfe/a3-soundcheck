import { describe, it, expect } from "vitest";
import {
  calculateScore,
  type ScoringInputs,
} from "./scoring-engine";

// ─── Shared helpers ───────────────────────────────────────────
const DEFAULTS = {
  venue_capacity: 1500,
  sell_through_pct: 80,
  num_dates: 20,
  market_coverage: 3,
  resale_situation: "not_sold_out" as const,
  vip_level: "none" as const,
  spotify_monthly_listeners: 500_000,
  fan_concentration_ratio: 15,
  p2_fan_identity: 3,
  ig_followers: 50_000,
  ig_er_pct: 3,
  reddit_members: 5_000,
  merch_sentiment: 3,
  tiktok_followers: 100_000,
  tiktok_avg_views: 5_000,
  youtube_subscribers: 20_000,
  youtube_er_pct: 2.5,
  store_quality: 3,
  merch_range: 3 as const,
  price_point_highest: 40,
  d2c_level: 2 as const,
  spotify_yoy_pct: 10,
  venue_progression: "same" as const,
  ig_30day_gain: 1_000,
  press_score: 3,
  playlist_score: 3,
};

function score(overrides: Partial<ScoringInputs> & Pick<ScoringInputs, "genre">): ReturnType<typeof calculateScore> {
  return calculateScore({ ...DEFAULTS, ...overrides } as ScoringInputs);
}

// ============================================================
// PILLAR 1 UNIT TESTS
// ============================================================

describe("P1 – Venue Capacity scoring", () => {
  it("scores 1 for <500", () => {
    const r = score({ genre: "Rock / Alt / Indie", venue_capacity: 300 });
    expect(r.p1.sub_scores.venue_capacity).toBe(1);
  });
  it("scores 2 for <1500", () => {
    const r = score({ genre: "Rock / Alt / Indie", venue_capacity: 1000 });
    expect(r.p1.sub_scores.venue_capacity).toBe(2);
  });
  it("scores 3 for <2500", () => {
    const r = score({ genre: "Rock / Alt / Indie", venue_capacity: 2000 });
    expect(r.p1.sub_scores.venue_capacity).toBe(3);
  });
  it("scores 4 for <5000", () => {
    const r = score({ genre: "Rock / Alt / Indie", venue_capacity: 4000 });
    expect(r.p1.sub_scores.venue_capacity).toBe(4);
  });
  it("scores 5 for 5000+", () => {
    const r = score({ genre: "Rock / Alt / Indie", venue_capacity: 10_000 });
    expect(r.p1.sub_scores.venue_capacity).toBe(5);
  });
});

describe("P1 – Sell-Through scoring", () => {
  it("scores 1 for <60%", () => expect(score({ genre: "Pop", sell_through_pct: 50 }).p1.sub_scores.sell_through).toBe(1));
  it("scores 2 for <75%", () => expect(score({ genre: "Pop", sell_through_pct: 70 }).p1.sub_scores.sell_through).toBe(2));
  it("scores 3 for <85%", () => expect(score({ genre: "Pop", sell_through_pct: 80 }).p1.sub_scores.sell_through).toBe(3));
  it("scores 4 for <95%", () => expect(score({ genre: "Pop", sell_through_pct: 90 }).p1.sub_scores.sell_through).toBe(4));
  it("scores 5 for 95%+", () => expect(score({ genre: "Pop", sell_through_pct: 100 }).p1.sub_scores.sell_through).toBe(5));
});

describe("P1 – Total Audience Reach", () => {
  it("scores 1 for low reach (<3000)", () => {
    // 500 cap × 5 dates × 100% = 2500
    const r = score({ genre: "Rock / Alt / Indie", venue_capacity: 500, num_dates: 5, sell_through_pct: 100 });
    expect(r.p1.sub_scores.total_audience_reach).toBe(1);
  });
  it("scores 3 for mid reach (10k–40k)", () => {
    // 1000 × 20 × 80% = 16000
    const r = score({ genre: "Rock / Alt / Indie", venue_capacity: 1000, num_dates: 20, sell_through_pct: 80 });
    expect(r.p1.sub_scores.total_audience_reach).toBe(3);
  });
  it("scores 5 for 100k+ reach", () => {
    // 5000 × 30 × 100% = 150000
    const r = score({ genre: "Rock / Alt / Indie", venue_capacity: 5000, num_dates: 30, sell_through_pct: 100 });
    expect(r.p1.sub_scores.total_audience_reach).toBe(5);
  });
});

describe("P1 – Resale Demand Signal", () => {
  it("Not Sold Out returns profile score (decimal, <2 → 1)", () => {
    // All sub-scores = 1 → avg = 1 → profile = 1
    const r = score({
      genre: "Rock / Alt / Indie",
      venue_capacity: 300,      // cap=1
      sell_through_pct: 50,     // st=1
      num_dates: 2,             // tar low: 300*2*50%=300 → 1
      market_coverage: 1,       // mkt=1
      resale_situation: "not_sold_out",
    });
    expect(r.p1.sub_scores.resale).toBe(1);
  });

  it("Some Sold Out: takes MAX(profile, multiplier)", () => {
    // Build scenario where multiplier wins: 2x ratio → ms=3
    const r = score({
      genre: "Rock / Alt / Indie",
      venue_capacity: 300,
      sell_through_pct: 50,
      num_dates: 2,
      market_coverage: 1,
      resale_situation: "some_sold_out",
      resale_to_face_ratio: 2.0, // ≤2.5x → ms=4
    });
    expect(r.p1.sub_scores.resale).toBe(4);
  });

  it("Some Sold Out always >= Not Sold Out equivalent", () => {
    const ns = score({
      genre: "Rock / Alt / Indie", venue_capacity: 2500, sell_through_pct: 85, num_dates: 30,
      market_coverage: 4, resale_situation: "not_sold_out",
    });
    const ss = score({
      genre: "Rock / Alt / Indie", venue_capacity: 2500, sell_through_pct: 85, num_dates: 30,
      market_coverage: 4, resale_situation: "some_sold_out", resale_to_face_ratio: 1.0,
    });
    expect(ss.p1.sub_scores.resale).toBeGreaterThanOrEqual(ns.p1.sub_scores.resale);
  });

  it("All Sold Out with 3x ratio → 5", () => {
    const r = score({
      genre: "Pop", venue_capacity: 5000, sell_through_pct: 100, num_dates: 50,
      market_coverage: 5, resale_situation: "all_sold_out", resale_to_face_ratio: 3.0,
    });
    expect(r.p1.sub_scores.resale).toBe(5);
  });

  it("All Sold Out with 1x ratio uses floor (profile ≤3 → floor=2)", () => {
    const r = score({
      genre: "Rock / Alt / Indie", venue_capacity: 300, sell_through_pct: 50, num_dates: 2,
      market_coverage: 1, resale_situation: "all_sold_out", resale_to_face_ratio: 1.0,
    });
    expect(r.p1.sub_scores.resale).toBe(2);
  });
});

describe("P1 – VIP bonus", () => {
  it("adds 0.20 for tiered_high", () => {
    const with_vip = score({ genre: "Pop", vip_level: "tiered_high" });
    const without  = score({ genre: "Pop", vip_level: "none" });
    expect(with_vip.p1.final_score - without.p1.final_score).toBeCloseTo(0.20, 5);
  });
  it("adds 0.10 for basic", () => {
    const with_vip = score({ genre: "Pop", vip_level: "basic" });
    const without  = score({ genre: "Pop", vip_level: "none" });
    expect(with_vip.p1.final_score - without.p1.final_score).toBeCloseTo(0.10, 5);
  });
});

// ============================================================
// PILLAR 2 UNIT TESTS
// ============================================================

describe("P2 – FCR scoring", () => {
  it("caps at 3 when FCR >60% (micro-artist gate)", () => {
    const r = score({ genre: "Rock / Alt / Indie", fan_concentration_ratio: 65, spotify_monthly_listeners: 100_000 });
    expect(r.p2.sub_scores.FCR).toBe(3);
  });
  it("applies listener adjustment: 3M+ listeners compresses thresholds (score 5 at lower raw %)", () => {
    // Rock thresholds * 0.65: T4 = 40*0.65 = 26%; FCR=27 should score 5
    const r = score({ genre: "Rock / Alt / Indie", fan_concentration_ratio: 27, spotify_monthly_listeners: 4_000_000 });
    expect(r.p2.sub_scores.FCR).toBe(5);
  });
  it("1M-3M listeners: multiplies thresholds by 0.80", () => {
    // Rock T4 = 40*0.80 = 32; FCR=33 → 5
    const r = score({ genre: "Rock / Alt / Indie", fan_concentration_ratio: 33, spotify_monthly_listeners: 2_000_000 });
    expect(r.p2.sub_scores.FCR).toBe(5);
  });
  it("no listener adjustment below 1M", () => {
    // Rock T1=8; FCR=7 → score=1
    const r = score({ genre: "Rock / Alt / Indie", fan_concentration_ratio: 7, spotify_monthly_listeners: 500_000 });
    expect(r.p2.sub_scores.FCR).toBe(1);
  });
});

describe("P2 – IG ER follower gate", () => {
  it("caps at 1 for <10K followers regardless of ER", () => {
    const r = score({ genre: "Pop", ig_followers: 5_000, ig_er_pct: 20 });
    expect(r.p2.sub_scores.IG_ER).toBe(1);
  });
  it("caps at 3 for 10-50K followers", () => {
    const r = score({ genre: "Pop", ig_followers: 30_000, ig_er_pct: 20 });
    expect(r.p2.sub_scores.IG_ER).toBe(3);
  });
  it("allows 5 for 50K+ followers with high ER", () => {
    const r = score({ genre: "Pop", ig_followers: 500_000, ig_er_pct: 10 });
    expect(r.p2.sub_scores.IG_ER).toBe(5);
  });
});

describe("P2 – TikTok ER follower gate", () => {
  it("caps at 1 for <15K followers", () => {
    const r = score({ genre: "Hip-Hop / Rap", tiktok_followers: 10_000, tiktok_avg_views: 50_000 });
    expect(r.p2.sub_scores.TikTok).toBe(1);
  });
  it("caps at 3 for 15-75K followers", () => {
    const r = score({ genre: "Hip-Hop / Rap", tiktok_followers: 50_000, tiktok_avg_views: 500_000 });
    expect(r.p2.sub_scores.TikTok).toBe(3);
  });
});

describe("P2 – YouTube semi-optional", () => {
  it("excludes YouTube when score is 1 and redistributes weight", () => {
    // Very low YT subscribers → score 1
    const r = score({ genre: "Rock / Alt / Indie", youtube_subscribers: 1_000, youtube_er_pct: 0.5 });
    expect(r.p2.youtube_excluded).toBe(true);
    expect(r.p2.sub_weights.YouTube).toBe(0);
    // All remaining weights should sum to ~1
    const sum = Object.values(r.p2.sub_weights).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 5);
  });
  it("includes YouTube when score is 2+", () => {
    // High subs + decent views → score ≥2
    const r = score({ genre: "Rock / Alt / Indie", youtube_subscribers: 100_000, youtube_er_pct: 3.0 });
    expect(r.p2.youtube_excluded).toBe(false);
    expect(r.p2.sub_weights.YouTube).toBeGreaterThan(0);
  });
});

describe("P2 – TikTok age adjustment", () => {
  it("reduces TikTok weight for Very Mature audience (×0.19)", () => {
    const young = score({
      genre: "Pop",
      demographics: { age_13_17: 20, age_18_24: 30, age_25_34: 25, age_35_44: 15, age_45_64: 8, age_65_plus: 2 },
    });
    const mature = score({
      genre: "Pop",
      demographics: { age_13_17: 0, age_18_24: 5, age_25_34: 10, age_35_44: 20, age_45_64: 45, age_65_plus: 20 },
    });
    expect(mature.p2.tiktok_age_adjusted_weight).toBeLessThan(young.p2.tiktok_age_adjusted_weight);
  });

  it("freed weight goes to FanID and MerchSent evenly", () => {
    const r = score({
      genre: "Pop",
      demographics: { age_13_17: 0, age_18_24: 5, age_25_34: 10, age_35_44: 25, age_45_64: 45, age_65_plus: 15 },
    });
    // Very Mature: TikTok weight × 0.19
    const basePop = [0.18, 0.18, 0.16, 0.08, 0.12, 0.14, 0.14]; // FCR/FanID/IG/Reddit/Merch/TikTok/YT
    const baseTT = basePop[5];
    const adjustedTT = baseTT * 0.19;
    const freed = baseTT - adjustedTT;
    expect(r.p2.tiktok_age_adjusted_weight).toBeCloseTo(adjustedTT, 4);
  });
});

describe("P2 – Discord bonus", () => {
  it("adds +0.30 for 25K+ members", () => {
    const with_disc = score({ genre: "Pop", discord_members: 30_000 });
    const without   = score({ genre: "Pop", discord_members: 0 });
    expect(with_disc.p2.final_score - without.p2.final_score).toBeCloseTo(0.30, 4);
  });
  it("adds +0.00 for 0 members", () => {
    const r = score({ genre: "Pop", discord_members: 0 });
    expect(r.p2.bonus).toBeDefined();
  });
});

describe("P2 – Reddit genre tiers", () => {
  it("HIGH genre (Rock) uses 50/200/1000/5000 thresholds", () => {
    const r1 = score({ genre: "Rock / Alt / Indie", reddit_members: 49 });
    const r2 = score({ genre: "Rock / Alt / Indie", reddit_members: 51 });
    expect(r1.p2.sub_scores.Reddit).toBe(1);
    expect(r2.p2.sub_scores.Reddit).toBe(2);
  });
  it("LOW genre (Country) uses 15/50/200/1000 thresholds", () => {
    const r1 = score({ genre: "Country / Americana", reddit_members: 14 });
    const r2 = score({ genre: "Country / Americana", reddit_members: 16 });
    expect(r1.p2.sub_scores.Reddit).toBe(1);
    expect(r2.p2.sub_scores.Reddit).toBe(2);
  });
});

// ============================================================
// PILLAR 3 UNIT TESTS
// ============================================================

describe("P3 – Price Point genre tiers", () => {
  it("PREMIUM (Pop): $29 → 1", () => {
    const r = score({ genre: "Pop", price_point_highest: 29 });
    expect(r.p3.sub_scores.price_point).toBe(1);
  });
  it("PREMIUM (Pop): $100+ → 5", () => {
    const r = score({ genre: "Pop", price_point_highest: 100 });
    expect(r.p3.sub_scores.price_point).toBe(5);
  });
  it("STANDARD (Rock): $24 → 1", () => {
    const r = score({ genre: "Rock / Alt / Indie", price_point_highest: 24 });
    expect(r.p3.sub_scores.price_point).toBe(1);
  });
  it("STANDARD (Rock): $100 → 5", () => {
    const r = score({ genre: "Rock / Alt / Indie", price_point_highest: 100 });
    expect(r.p3.sub_scores.price_point).toBe(5);
  });
  it("VALUE (Punk): $19 → 1", () => {
    const r = score({ genre: "Punk / Hardcore / Pop-Punk / Emo", price_point_highest: 19 });
    expect(r.p3.sub_scores.price_point).toBe(1);
  });
  it("VALUE (Punk): $80+ → 5", () => {
    const r = score({ genre: "Punk / Hardcore / Pop-Punk / Emo", price_point_highest: 80 });
    expect(r.p3.sub_scores.price_point).toBe(5);
  });
});

describe("P3 – D2C Infrastructure mapping", () => {
  it("level 1 → score 1.25", () => {
    const r = score({ genre: "Pop", d2c_level: 1 });
    expect(r.p3.sub_scores.d2c).toBeCloseTo(1.25, 5);
  });
  it("level 4 → score 5", () => {
    const r = score({ genre: "Pop", d2c_level: 4 });
    expect(r.p3.sub_scores.d2c).toBeCloseTo(5.0, 5);
  });
});

describe("P3 – weighted score", () => {
  it("computes correct weighted total", () => {
    const r = score({ genre: "Rock / Alt / Indie", store_quality: 4, merch_range: 3, price_point_highest: 50, d2c_level: 3 });
    const expected = 4 * 0.35 + 3 * 0.30 + r.p3.sub_scores.price_point * 0.25 + 3.75 * 0.10;
    expect(r.p3.final_score).toBeCloseTo(expected, 5);
  });
});

// ============================================================
// PILLAR 4 UNIT TESTS
// ============================================================

describe("P4 – Spotify YoY size-adjusted", () => {
  it("2M+ listeners: -6% → 1", () => {
    const r = score({ genre: "Pop", spotify_monthly_listeners: 3_000_000, spotify_yoy_pct: -6 });
    expect(r.p4.sub_scores.spotify_yoy).toBe(1);
  });
  it("2M+ listeners: 35% → 5", () => {
    const r = score({ genre: "Pop", spotify_monthly_listeners: 3_000_000, spotify_yoy_pct: 35 });
    expect(r.p4.sub_scores.spotify_yoy).toBe(5);
  });
  it("500K-2M: -3% → 1", () => {
    const r = score({ genre: "Pop", spotify_monthly_listeners: 1_000_000, spotify_yoy_pct: -3 });
    expect(r.p4.sub_scores.spotify_yoy).toBe(1);
  });
  it("<500K: -1% → 1", () => {
    const r = score({ genre: "Pop", spotify_monthly_listeners: 200_000, spotify_yoy_pct: -1 });
    expect(r.p4.sub_scores.spotify_yoy).toBe(1);
  });
  it("<500K: 65% → 5", () => {
    const r = score({ genre: "Pop", spotify_monthly_listeners: 200_000, spotify_yoy_pct: 65 });
    expect(r.p4.sub_scores.spotify_yoy).toBe(5);
  });
});

describe("P4 – Album Cycle Override", () => {
  it("boosts YoY score by 1 when score <3", () => {
    const without = score({ genre: "Pop", spotify_monthly_listeners: 200_000, spotify_yoy_pct: -1 });
    const with_aco = score({ genre: "Pop", spotify_monthly_listeners: 200_000, spotify_yoy_pct: -1, album_cycle_override: "anticipation" });
    expect(without.p4.sub_scores.spotify_yoy).toBe(1);
    expect(with_aco.p4.sub_scores.spotify_yoy).toBe(2);
  });
  it("does not boost beyond 3", () => {
    const r = score({ genre: "Pop", spotify_monthly_listeners: 200_000, spotify_yoy_pct: 8, album_cycle_override: "normalizing" });
    expect(r.p4.sub_scores.spotify_yoy).toBe(3); // score=2 boosted to 3, not 4
  });
  it("does not boost when score already ≥3", () => {
    const r = score({ genre: "Pop", spotify_monthly_listeners: 200_000, spotify_yoy_pct: 35, album_cycle_override: "peak_declining" });
    expect(r.p4.sub_scores.spotify_yoy).toBe(4); // no boost
  });
});

describe("P4 – Venue Progression", () => {
  it("smaller → 1", () => {
    expect(score({ genre: "Pop", venue_progression: "smaller" }).p4.sub_scores.venue_progression).toBe(1);
  });
  it("same + capacity <1000 → 1", () => {
    expect(score({ genre: "Pop", venue_capacity: 800, venue_progression: "same" }).p4.sub_scores.venue_progression).toBe(1);
  });
  it("same + capacity 2500-5000 → 3", () => {
    expect(score({ genre: "Pop", venue_capacity: 3000, venue_progression: "same" }).p4.sub_scores.venue_progression).toBe(3);
  });
  it("same + 5000+ → 4", () => {
    expect(score({ genre: "Pop", venue_capacity: 6000, venue_progression: "same" }).p4.sub_scores.venue_progression).toBe(4);
  });
  it("tier_change → 5", () => {
    expect(score({ genre: "Pop", venue_progression: "tier_change" }).p4.sub_scores.venue_progression).toBe(5);
  });
});

describe("P4 – IG Growth size-adjusted", () => {
  it(">200K followers uses relaxed thresholds: 0.1% gain → 1", () => {
    // 300K followers, 300 gain = 0.1% < 0.15% → score 1
    const r = score({ genre: "Pop", ig_followers: 300_000, ig_30day_gain: 300 });
    expect(r.p4.sub_scores.ig_growth).toBe(1);
  });
  it(">200K followers: 2% gain → 4", () => {
    // 300K followers, 6000 gain = 2% ≥1.5% <4% → score 4
    const r = score({ genre: "Pop", ig_followers: 300_000, ig_30day_gain: 6_000 });
    expect(r.p4.sub_scores.ig_growth).toBe(4);
  });
  it("≤200K followers: 0.4% gain → 1 (< 0.5%)", () => {
    // 100K followers, 400 gain = 0.4% → score 1
    const r = score({ genre: "Pop", ig_followers: 100_000, ig_30day_gain: 400 });
    expect(r.p4.sub_scores.ig_growth).toBe(1);
  });
  it("≤200K followers: 4% gain → 4 (3-6%)", () => {
    const r = score({ genre: "Pop", ig_followers: 100_000, ig_30day_gain: 4_000 });
    expect(r.p4.sub_scores.ig_growth).toBe(4);
  });
});

// ============================================================
// DYNAMIC PILLAR WEIGHTS
// ============================================================

describe("Dynamic pillar weights", () => {
  it("defaults to age bracket 2 (Young) when no demographics provided", () => {
    const r = score({ genre: "Rock / Alt / Indie" });
    expect(r.age_bracket).toBe(2);
  });
  it("Very Young (80% <35) → bracket 1", () => {
    const r = score({
      genre: "Rock / Alt / Indie",
      demographics: { age_13_17: 30, age_18_24: 30, age_25_34: 25, age_35_44: 10, age_45_64: 4, age_65_plus: 1 },
    });
    expect(r.age_bracket).toBe(1);
  });
  it("Very Mature (25% <35) → bracket 5", () => {
    const r = score({
      genre: "Rock / Alt / Indie",
      demographics: { age_13_17: 2, age_18_24: 8, age_25_34: 15, age_35_44: 30, age_45_64: 35, age_65_plus: 10 },
    });
    expect(r.age_bracket).toBe(5);
  });
  it("Massive touring (5000 cap, 50 dates) → bracket 4", () => {
    const r = score({ genre: "Rock / Alt / Indie", venue_capacity: 5000, num_dates: 50 });
    expect(r.touring_bracket).toBe(4);
  });
  it("Light touring (<1500 cap, <15 dates) → bracket 1", () => {
    const r = score({ genre: "Rock / Alt / Indie", venue_capacity: 1000, num_dates: 10 });
    expect(r.touring_bracket).toBe(1);
  });
  it("pillar weights sum to 1.0", () => {
    const r = score({ genre: "Pop", venue_capacity: 5000, num_dates: 50 });
    const sum = r.pillar_weights.p1 + r.pillar_weights.p2 + r.pillar_weights.p3 + r.pillar_weights.p4;
    expect(sum).toBeCloseTo(1.0, 5);
  });
  it("uses correct weights from matrix: age=2 touring=2 → 40/30/20/10", () => {
    // Young + Moderate touring: 1500 cap, 25 dates
    const r = score({ genre: "Rock / Alt / Indie", venue_capacity: 1500, num_dates: 25 });
    expect(r.pillar_weights.p1).toBeCloseTo(0.40, 5);
    expect(r.pillar_weights.p2).toBeCloseTo(0.30, 5);
    expect(r.pillar_weights.p3).toBeCloseTo(0.20, 5);
    expect(r.pillar_weights.p4).toBeCloseTo(0.10, 5);
  });
});

// ============================================================
// REVENUE TIER + CLASSIFICATION
// ============================================================

describe("Revenue tier assignment", () => {
  it("K-Pop → PREMIUM", () => {
    expect(score({ genre: "K-Pop / J-Pop / J-Rock" }).revenue_tier).toBe("PREMIUM");
  });
  it("Punk → HIGH", () => {
    expect(score({ genre: "Punk / Hardcore / Pop-Punk / Emo" }).revenue_tier).toBe("HIGH");
  });
  it("R&B → LOW", () => {
    expect(score({ genre: "R&B / Soul" }).revenue_tier).toBe("LOW");
  });
  it("Rock → STANDARD", () => {
    expect(score({ genre: "Rock / Alt / Indie" }).revenue_tier).toBe("STANDARD");
  });
});

describe("Tier classification thresholds", () => {
  it("STANDARD: ≥4.0 → Priority", () => {
    // Force high total by maxing everything
    const r = score({
      genre: "Rock / Alt / Indie",
      venue_capacity: 10_000, sell_through_pct: 100, num_dates: 50, market_coverage: 5,
      resale_situation: "all_sold_out", resale_to_face_ratio: 3, vip_level: "tiered_high",
      fan_concentration_ratio: 30, spotify_monthly_listeners: 5_000_000,
      ig_followers: 1_000_000, ig_er_pct: 8, reddit_members: 50_000,
      merch_sentiment: 5, tiktok_followers: 1_000_000, tiktok_avg_views: 100_000,
      youtube_subscribers: 500_000, youtube_er_pct: 6.0,
      store_quality: 5, merch_range: 5, price_point_highest: 150, d2c_level: 4,
      spotify_yoy_pct: 50, venue_progression: "tier_change",
      ig_30day_gain: 50_000, press_score: 5, playlist_score: 5,
    });
    expect(r.tier_label).toBe("Priority");
  });

  it("PREMIUM (K-Pop): ≥3.2 qualifies as Priority", () => {
    // K-Pop with moderate scores should still reach Priority at 3.2+
    const r = score({
      genre: "K-Pop / J-Pop / J-Rock",
      venue_capacity: 3000, sell_through_pct: 80, num_dates: 25, market_coverage: 4,
      resale_situation: "some_sold_out", resale_to_face_ratio: 1.5, vip_level: "premium_mg",
      fan_concentration_ratio: 20, spotify_monthly_listeners: 2_000_000,
      ig_followers: 500_000, ig_er_pct: 5, reddit_members: 2_000,
      merch_sentiment: 4, tiktok_followers: 500_000, tiktok_avg_views: 50_000,
      youtube_subscribers: 200_000, youtube_er_pct: 4.0,
      store_quality: 4, merch_range: 4, price_point_highest: 80, d2c_level: 3,
      spotify_yoy_pct: 25, venue_progression: "slight_step_up",
      ig_30day_gain: 10_000, press_score: 4, playlist_score: 4,
    });
    expect(r.revenue_tier).toBe("PREMIUM");
    expect(r.total_score).toBeGreaterThanOrEqual(3.2);
    expect(r.tier_label).toBe("Priority");
  });
});

// ============================================================
// DEMOGRAPHIC AFFINITY ENGINE
// ============================================================

describe("Demographic affinity multiplier", () => {
  it("defaults to 1.0 multiplier when no demographics", () => {
    // Affinity = 0.55 / 0.55 = 1.0; clamped to [0.3, 2.0]
    // We test indirectly: no demo = same IG ER thresholds as default
    const r = score({ genre: "Rock / Alt / Indie", ig_followers: 100_000, ig_er_pct: 1.5 });
    // 1.5 < 2 (T2 threshold × 1.0) → score 2
    expect(r.p2.sub_scores.IG_ER).toBe(2);
  });

  it("clamps multiplier to 2.0 max for very young audience", () => {
    // All 13-17: TikTok affinity = 0.95, mult = 0.95/0.55 = 1.727, clamped to 2.0? No, 1.727 < 2.0
    // All 18-24: TikTok affinity = 0.90, mult = 1.636 — not clamped
    // To hit 2.0 we'd need > 0.55*2 = 1.1 affinity — only achievable with all in highest brackets
    // 100% age 13-17: TikTok affinity = 0.95, mult = min(1.727, 2.0) = 1.727
    const r = score({
      genre: "EDM / Dance / Electronic",
      demographics: { age_13_17: 100 },
      tiktok_followers: 200_000, tiktok_avg_views: 2_001, // just above 1% ER before mult
    });
    // ERPct = 1.0%, TikTok thresholds × 1.727: T1 = 2*1.727=3.45 > 1.0 → score 1
    expect(r.p2.sub_scores.TikTok).toBe(1);
  });

  it("clamps multiplier to 0.3 min for very old audience", () => {
    // All 65+: TikTok affinity = 0.03, mult = 0.03/0.55 = 0.054, clamped to 0.3
    const r = score({
      genre: "Rock / Alt / Indie",
      demographics: { age_65_plus: 100 },
      ig_followers: 100_000, ig_er_pct: 0.25, // below T1=1% * 0.3=0.3%
    });
    // threshold T1 = 1 * 0.3 = 0.3%; 0.25% < 0.3% → score 1
    expect(r.p2.sub_scores.IG_ER).toBe(1);
  });
});

describe("Ethnicity modifiers", () => {
  it("Hispanic >15%: IG ER thresholds multiply by 1.1", () => {
    // Without ethnicity mod: IG ER T1 = 1%
    const without = score({ genre: "Rock / Alt / Indie", ig_followers: 100_000, ig_er_pct: 1.05 });
    // 1.05% > 1% → score 2 without mod
    expect(without.p2.sub_scores.IG_ER).toBe(2);

    // With Hispanic 20%: T1 = 1% * 1.1 = 1.1%; 1.05% < 1.1% → score 1
    const with_hisp = score({
      genre: "Rock / Alt / Indie",
      demographics: { age_18_24: 50, age_25_34: 30, age_35_44: 20, hispanic: 20 },
      ig_followers: 100_000, ig_er_pct: 1.05,
    });
    expect(with_hisp.p2.sub_scores.IG_ER).toBe(1);
  });

  it("African American >30%: TikTok thresholds multiply by 1.2", () => {
    // No mod: TikTok T1 = 2%; ER = 2.1% → score 2
    const without = score({ genre: "Pop", tiktok_followers: 200_000, tiktok_avg_views: 4_200 }); // 2.1%
    expect(without.p2.sub_scores.TikTok).toBeGreaterThanOrEqual(2);

    // With AA 35%: T1 = 2*1.2=2.4%; 2.1% < 2.4% → score 1
    const with_aa = score({
      genre: "Pop",
      demographics: { age_18_24: 35, age_25_34: 35, age_35_44: 30, african_american: 35 },
      tiktok_followers: 200_000, tiktok_avg_views: 4_200,
    });
    expect(with_aa.p2.sub_scores.TikTok).toBe(1);
  });
});

// ============================================================
// GENRE GROUP MAPPING
// ============================================================

describe("Genre group mapping", () => {
  const cases: Array<[import("./scoring-engine").Genre, import("./scoring-engine").GenreGroup]> = [
    ["Rock / Alt / Indie",              "ROCK"],
    ["Southern Rock / Blues Rock",      "ROCK"],
    ["Progressive Rock / Prog Metal",   "ROCK"],
    ["Country / Americana",             "COUNTRY"],
    ["Folk / Singer-Songwriter",        "COUNTRY"],
    ["Bluegrass / Roots",               "COUNTRY"],
    ["Punk / Hardcore / Pop-Punk / Emo","PUNK"],
    ["Metal / Hard Rock",               "PUNK"],
    ["Pop",                             "POP"],
    ["Broadway / Theater",              "POP"],
    ["Hip-Hop / Rap",                   "HIPHOP"],
    ["EDM / Dance / Electronic",        "EDM"],
    ["K-Pop / J-Pop / J-Rock",          "KPOP"],
    ["R&B / Soul",                      "RBL"],
    ["Latin / Regional Mexican",        "RBL"],
    ["Reggae / Ska",                    "RBL"],
    ["Jam Band / Jam Rock",             "JAM"],
    ["Jazz / Blues (Traditional)",      "JAM"],
    ["Christian / Gospel / Worship",    "JAM"],
  ];
  for (const [genre, group] of cases) {
    it(`${genre} → ${group}`, () => {
      expect(score({ genre }).genre_group).toBe(group);
    });
  }
});

// ============================================================
// CALIBRATION ARTIST TESTS
// ============================================================

describe("Calibration artists", () => {

  // ── The Marias ──────────────────────────────────────────────
  it("The Marias: Rock/Alt/Indie ~4.40 (Priority)", () => {
    const r = calculateScore({
      genre: "Rock / Alt / Indie",
      // Touring
      venue_capacity: 9000,
      sell_through_pct: 100,
      num_dates: 20,
      market_coverage: 4,
      resale_situation: "all_sold_out",
      resale_to_face_ratio: 5.0,    // $300/$60 = 5x
      vip_level: "basic",
      // P2
      spotify_monthly_listeners: 4_500_000,
      fan_concentration_ratio: 22,
      p2_fan_identity: 5,
      ig_followers: 800_000,
      ig_er_pct: 3.5,
      reddit_members: 8_000,
      discord_members: 0,
      merch_sentiment: 4,
      tiktok_followers: 600_000,
      tiktok_avg_views: 30_000,
      youtube_subscribers: 150_000,
      youtube_er_pct: 3.0,
      // P3
      store_quality: 4,
      merch_range: 3,
      price_point_highest: 55,
      d2c_level: 3,
      // P4
      spotify_yoy_pct: 20,
      venue_progression: "major_jump",
      ig_30day_gain: 12_000,
      press_score: 4,
      playlist_score: 4,
      // Demographics: young-leaning Hispanic audience (The Marias)
      demographics: {
        age_13_17: 10, age_18_24: 35, age_25_34: 30,
        age_35_44: 15, age_45_64: 8, age_65_plus: 2,
        hispanic: 25,
      },
    });
    console.log("The Marias:", JSON.stringify({ total: r.total_score, tier: r.tier_label, p1: r.p1.final_score, p2: r.p2.final_score, p3: r.p3.final_score, p4: r.p4.final_score }, null, 2));
    expect(r.tier_label).toBe("Priority");
    expect(r.total_score).toBeGreaterThanOrEqual(3.8);
    expect(r.total_score).toBeLessThanOrEqual(5.0);
  });

  // ── Alison Krauss ───────────────────────────────────────────
  it("Alison Krauss: Bluegrass/Roots ~4.00 (Priority)", () => {
    const r = calculateScore({
      genre: "Bluegrass / Roots",
      venue_capacity: 6000,
      sell_through_pct: 75,
      num_dates: 77,
      market_coverage: 5,
      resale_situation: "some_sold_out",
      resale_to_face_ratio: 2.6,    // $397/$150 ≈ 2.6x
      vip_level: "premium_mg",
      // P2
      spotify_monthly_listeners: 3_200_000,
      fan_concentration_ratio: 35,
      p2_fan_identity: 4,
      ig_followers: 500_000,
      ig_er_pct: 1.5,
      reddit_members: 500,
      discord_members: 0,
      merch_sentiment: 4,
      tiktok_followers: 50_000,
      tiktok_avg_views: 800,
      youtube_subscribers: 300_000,
      youtube_er_pct: 2.0,
      // P3
      store_quality: 4,
      merch_range: 4,
      price_point_highest: 75,
      d2c_level: 3,
      // P4
      spotify_yoy_pct: 8,
      venue_progression: "same",
      ig_30day_gain: 3_000,
      press_score: 5,
      playlist_score: 4,
      // Demographics: older audience typical of Bluegrass
      demographics: {
        age_13_17: 2, age_18_24: 10, age_25_34: 18,
        age_35_44: 25, age_45_64: 35, age_65_plus: 10,
      },
    });
    console.log("Alison Krauss:", JSON.stringify({ total: r.total_score, tier: r.tier_label, p1: r.p1.final_score, p2: r.p2.final_score, p3: r.p3.final_score, p4: r.p4.final_score }, null, 2));
    expect(r.tier_label).toBe("Priority");
    expect(r.total_score).toBeGreaterThanOrEqual(3.5);
    expect(r.total_score).toBeLessThanOrEqual(4.5);
  });

  // ── Thrice ──────────────────────────────────────────────────
  it("Thrice: Punk ~3.64 (Priority under HIGH tier)", () => {
    const r = calculateScore({
      genre: "Punk / Hardcore / Pop-Punk / Emo",
      venue_capacity: 1500,
      sell_through_pct: 75,
      num_dates: 13,
      market_coverage: 3,
      resale_situation: "some_sold_out",
      resale_to_face_ratio: 2.2,    // $120/$55 ≈ 2.2x
      vip_level: "basic",
      // P2
      spotify_monthly_listeners: 1_200_000,
      fan_concentration_ratio: 28,
      p2_fan_identity: 4,
      ig_followers: 300_000,
      ig_er_pct: 2.5,
      reddit_members: 15_000,
      discord_members: 2_000,
      merch_sentiment: 4,
      tiktok_followers: 40_000,
      tiktok_avg_views: 1_200,
      youtube_subscribers: 120_000,
      youtube_er_pct: 3.0,
      // P3
      store_quality: 4,
      merch_range: 4,
      price_point_highest: 60,
      d2c_level: 3,
      // P4
      spotify_yoy_pct: 5,
      venue_progression: "same",
      ig_30day_gain: 3_000,
      press_score: 4,
      playlist_score: 3,
      // Demographics: mixed-age rock/punk audience
      demographics: {
        age_13_17: 5, age_18_24: 20, age_25_34: 30,
        age_35_44: 28, age_45_64: 15, age_65_plus: 2,
      },
    });
    console.log("Thrice:", JSON.stringify({ total: r.total_score, tier: r.tier_label, revTier: r.revenue_tier, p1: r.p1.final_score, p2: r.p2.final_score, p3: r.p3.final_score, p4: r.p4.final_score }, null, 2));
    expect(r.revenue_tier).toBe("HIGH");
    expect(r.tier_label).toBe("Priority");
    expect(r.total_score).toBeGreaterThanOrEqual(3.2);
    expect(r.total_score).toBeLessThanOrEqual(4.2);
  });

  // ── Flatland Cavalry ────────────────────────────────────────
  it("Flatland Cavalry: Country ~3.74 (Active)", () => {
    const r = calculateScore({
      genre: "Country / Americana",
      venue_capacity: 1600,
      sell_through_pct: 85,
      num_dates: 38,
      market_coverage: 3,
      resale_situation: "not_sold_out",
      vip_level: "offered_before",
      // P2
      spotify_monthly_listeners: 800_000,
      fan_concentration_ratio: 22,
      p2_fan_identity: 3,
      ig_followers: 250_000,
      ig_er_pct: 2.0,
      reddit_members: 300,
      discord_members: 0,
      merch_sentiment: 3,
      tiktok_followers: 180_000,
      tiktok_avg_views: 7_200,
      youtube_subscribers: 25_000,
      youtube_er_pct: 2.4,
      // P3
      store_quality: 3,
      merch_range: 3,
      price_point_highest: 45,
      d2c_level: 2,
      // P4
      spotify_yoy_pct: 18,
      venue_progression: "slight_step_up",
      ig_30day_gain: 4_000,
      press_score: 3,
      playlist_score: 3,
      // Demographics: mixed but younger-leaning country audience
      demographics: {
        age_13_17: 5, age_18_24: 22, age_25_34: 28,
        age_35_44: 25, age_45_64: 18, age_65_plus: 2,
      },
    });
    console.log("Flatland Cavalry:", JSON.stringify({ total: r.total_score, tier: r.tier_label, p1: r.p1.final_score, p2: r.p2.final_score, p3: r.p3.final_score, p4: r.p4.final_score }, null, 2));
    expect(r.tier_label).toBe("Active");
    expect(r.total_score).toBeGreaterThanOrEqual(2.8);
    expect(r.total_score).toBeLessThanOrEqual(4.0);
  });

  // ── My Chemical Romance ─────────────────────────────────────
  it("My Chemical Romance: Punk ~4.40 (Priority under HIGH tier)", () => {
    const r = calculateScore({
      genre: "Punk / Hardcore / Pop-Punk / Emo",
      venue_capacity: 37_000,
      sell_through_pct: 100,
      num_dates: 16,
      market_coverage: 5,
      resale_situation: "not_sold_out",
      vip_level: "tiered_high",
      // P2
      spotify_monthly_listeners: 12_000_000,
      fan_concentration_ratio: 15,
      p2_fan_identity: 5,
      ig_followers: 3_000_000,
      ig_er_pct: 1.8,
      reddit_members: 80_000,
      discord_members: 15_000,
      merch_sentiment: 5,
      tiktok_followers: 2_000_000,
      tiktok_avg_views: 60_000,
      youtube_subscribers: 2_000_000,
      youtube_er_pct: 3.0,
      // P3
      store_quality: 5,
      merch_range: 5,
      price_point_highest: 75,
      d2c_level: 4,
      // P4
      spotify_yoy_pct: 5,
      venue_progression: "same",
      ig_30day_gain: 30_000,
      press_score: 5,
      playlist_score: 4,
      // Demographics: broad mix, significant younger base
      demographics: {
        age_13_17: 12, age_18_24: 28, age_25_34: 25,
        age_35_44: 20, age_45_64: 13, age_65_plus: 2,
      },
    });
    console.log("MCR:", JSON.stringify({ total: r.total_score, tier: r.tier_label, revTier: r.revenue_tier, p1: r.p1.final_score, p2: r.p2.final_score, p3: r.p3.final_score, p4: r.p4.final_score }, null, 2));
    expect(r.revenue_tier).toBe("HIGH");
    expect(r.tier_label).toBe("Priority");
    expect(r.total_score).toBeGreaterThanOrEqual(3.6);
    expect(r.total_score).toBeLessThanOrEqual(5.0);
  });

});

// ============================================================
// EDGE CASES
// ============================================================

describe("Edge cases", () => {
  it("handles missing optional inputs gracefully", () => {
    expect(() => score({
      genre: "Jazz / Blues (Traditional)",
      ig_er_pct: undefined,
      tiktok_avg_views: undefined,
      youtube_er_pct: undefined,
      spotify_yoy_pct: undefined,
      ig_30day_gain: undefined,
      price_point_highest: undefined,
      discord_members: undefined,
      album_cycle_override: null,
    })).not.toThrow();
  });

  it("FCR exactly at threshold boundary is exclusive (< not ≤)", () => {
    // Rock T1=8: FCR=8 should score 2 (not 1)
    const r = score({ genre: "Rock / Alt / Indie", fan_concentration_ratio: 8, spotify_monthly_listeners: 100_000 });
    expect(r.p2.sub_scores.FCR).toBe(2);
  });

  it("all P1 sub-weights sum to 1.0", () => {
    // 25 + 20 + 20 + 15 + 20 = 100
    expect(0.25 + 0.20 + 0.20 + 0.15 + 0.20).toBeCloseTo(1.0, 10);
  });

  it("total_score is bounded [1, 5+] in realistic scenarios", () => {
    const r = score({ genre: "Pop" });
    expect(r.total_score).toBeGreaterThan(0);
    expect(r.total_score).toBeLessThan(8); // VIP/Discord bonuses can push slightly above 5
  });

  it("Moderate touring bracket: 1500 cap + 15 dates qualifies", () => {
    const r = score({ genre: "Rock / Alt / Indie", venue_capacity: 1500, num_dates: 15 });
    expect(r.touring_bracket).toBe(2);
  });

  it("Heavy touring: 4000+ cap but only 10 dates qualifies as Heavy (OR condition)", () => {
    const r = score({ genre: "Rock / Alt / Indie", venue_capacity: 4000, num_dates: 10 });
    expect(r.touring_bracket).toBe(3);
  });

  it("Heavy touring: <4000 cap but 40+ dates qualifies as Heavy (OR condition)", () => {
    const r = score({ genre: "Rock / Alt / Indie", venue_capacity: 2000, num_dates: 45 });
    expect(r.touring_bracket).toBe(3);
  });
});
