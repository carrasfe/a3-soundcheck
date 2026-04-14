/**
 * A3 Soundcheck — PDF Scorecard Generator  (v2, compact single-page)
 * Landscape A4. Bloomberg-terminal density.
 * Import lazily: const { downloadScorecardPDF } = await import("@/lib/generate-scorecard-pdf");
 */

import jsPDF from "jspdf";
import type { ScoringResult } from "@/lib/scoring-engine";
import type { EvalFormData } from "@/app/evaluations/new/types";

// ─── Public interface ─────────────────────────────────────────────────────────

export interface ScorecardData {
  artistName: string;
  genre: string | null;
  evaluatorName: string;
  evaluationDate: string;    // ISO string
  evaluationId: string | null;
  results: ScoringResult;
  inputs: EvalFormData;
}

// ─── Page constants — Landscape A4 ───────────────────────────────────────────

const PW = 297;   // page width  mm
const PH = 210;   // page height mm
const ML = 10;    // left margin
const MR = 10;    // right margin
const CW = PW - ML - MR;  // 277 mm usable

// ─── Palette ──────────────────────────────────────────────────────────────────

type RGB = [number, number, number];
const NAVY:    RGB = [27,  42,  74];
const NAVY_LT: RGB = [38,  58,  98];
const RED:     RGB = [192, 57,  43];
const DK:      RGB = [25,  25,  25];
const MD:      RGB = [90,  90,  90];
const LT:      RGB = [155, 155, 155];
const WHITE:   RGB = [255, 255, 255];
const BGINFO:  RGB = [237, 241, 248];
const BGROW:   RGB = [248, 249, 252];
const DIV:     RGB = [205, 211, 222];
const AMBER:   RGB = [175, 115,   0];
const GREEN:   RGB = [18,  130,  55];
const BLUE:    RGB = [37,   99, 200];
const SCORERED:RGB = [175,  35,  35];

function scoreColor(v: number): RGB {
  if (v >= 4) return GREEN;
  if (v >= 3) return BLUE;
  if (v >= 2) return AMBER;
  return SCORERED;
}

// ─── jsPDF primitives ─────────────────────────────────────────────────────────

function box(doc: jsPDF, x: number, y: number, w: number, h: number, fill: RGB) {
  doc.setFillColor(fill[0], fill[1], fill[2]);
  doc.rect(x, y, w, h, "F");
}

function t(
  doc: jsPDF, text: string, x: number, y: number,
  opts: { sz?: number; bold?: boolean; italic?: boolean; color?: RGB;
          align?: "left" | "center" | "right"; maxW?: number } = {}
) {
  doc.setFontSize(opts.sz ?? 7.5);
  doc.setFont("helvetica", opts.italic ? "italic" : opts.bold ? "bold" : "normal");
  const c = opts.color ?? DK;
  doc.setTextColor(c[0], c[1], c[2]);
  doc.text(text, x, y, { align: opts.align, maxWidth: opts.maxW });
}

function hl(doc: jsPDF, x1: number, x2: number, y: number, color: RGB = DIV, lw = 0.25) {
  doc.setLineWidth(lw);
  doc.setDrawColor(color[0], color[1], color[2]);
  doc.line(x1, y, x2, y);
}

function vl(doc: jsPDF, x: number, y1: number, y2: number, color: RGB = DIV, lw = 0.25) {
  doc.setLineWidth(lw);
  doc.setDrawColor(color[0], color[1], color[2]);
  doc.line(x, y1, x, y2);
}

// ─── Format helpers ───────────────────────────────────────────────────────────

function nv(s: string | undefined | null): number { return parseFloat(s ?? "0") || 0; }

function fK(s: string | undefined | null): string {
  const v = nv(s as string);
  if (!s || !v) return "—";
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 10_000)    return `${(v / 1_000).toFixed(0)}K`;
  if (v >= 1_000)     return `${(v / 1_000).toFixed(1)}K`;
  return v.toLocaleString();
}

function fP(s: string | undefined | null): string {
  if (!s || s.trim() === "") return "—";
  const v = parseFloat(s);
  return isNaN(v) ? "—" : `${v}%`;
}

function fs(v: number): string { return v.toFixed(2); }
function fp(v: number): string { return (v * 100).toFixed(0) + "%"; }

function safeFilename(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]/g, "_").replace(/_+/g, "_").slice(0, 60);
}
function shortDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
  catch { return iso; }
}
function fileDate(iso: string): string {
  try { return new Date(iso).toISOString().slice(0, 10); }
  catch { return new Date().toISOString().slice(0, 10); }
}

// ─── Label maps ───────────────────────────────────────────────────────────────

const RESALE_S: Record<string, string> = {
  not_sold_out: "Not SO", some_sold_out: "Some SO", all_sold_out: "All SO",
};
const PROG_S: Record<string, string> = {
  smaller: "Smaller", same: "Same", slight_step_up: "Step-up",
  major_jump: "Maj.jump", tier_change: "Tier chg",
};
const VIP_S: Record<string, string> = {
  none: "None", offered_before: "Prev.", basic: "Basic",
  premium_mg: "Prem.MG", tiered_high: "Tiered hi",
};
const AGE_L  = ["", "Very Young", "Young", "Mixed", "Mature", "Very Mature"];
const TOUR_L = ["", "Light", "Moderate", "Heavy", "Massive"];

// ─── Layout geometry ──────────────────────────────────────────────────────────

const HDR_H  = 28;   // navy header bar
const INFO_H = 13;   // artist-info strip
const PILLAR_TOP = HDR_H + INFO_H + 2;

const PCOL_GAP = 3.5;
const PCOL_W   = (CW - PCOL_GAP * 3) / 4;  // ≈ 67 mm per column
const PCOL_X   = [0, 1, 2, 3].map(i => ML + i * (PCOL_W + PCOL_GAP));

const PH_H  = 8.5;  // pillar header row height
const RH    = 5.6;  // sub-metric row height

// Sub-column widths within each pillar column
const NW = PCOL_W * 0.46;   // metric name width
const IW = PCOL_W * 0.34;   // input value width  (score uses remainder)

// ─── SECTION: Header bar ─────────────────────────────────────────────────────

function drawHeader(doc: jsPDF, d: ScorecardData): void {
  const r = d.results;
  box(doc, 0, 0, PW, HDR_H, NAVY);

  // — Left: branding ——————————
  t(doc, "A3 SOUNDCHECK", ML, 7, { sz: 7, bold: true, color: [170, 190, 220] });

  // Artist name (truncated to fit left panel)
  const name = d.artistName.length > 40 ? d.artistName.slice(0, 38) + "…" : d.artistName;
  t(doc, name, ML, 16.5, { sz: 15, bold: true, color: WHITE });

  // Genre + evaluator line
  const genreStr = d.genre ? d.genre.toUpperCase() + "  ·  " : "";
  const metaStr = `${genreStr}${d.evaluatorName}  ·  ${shortDate(d.evaluationDate)}`;
  t(doc, metaStr, ML, 23.5, { sz: 7, color: [165, 185, 218] });

  // — Right: score badge ——————
  const BADGE_W = 58;
  const BADGE_X = PW - MR - BADGE_W;
  box(doc, BADGE_X, 1, BADGE_W, HDR_H - 2, RED);

  const tier = r.tier_label;
  const tierStr = (tier === "Pass" ? "BELOW" : tier.toUpperCase()) + " TARGET";

  t(doc, "TOTAL SCORE", BADGE_X + BADGE_W / 2, 7, { sz: 6.5, color: [255, 195, 185], align: "center" });
  t(doc, fs(r.total_score), BADGE_X + BADGE_W / 2, 16, { sz: 19, bold: true, color: WHITE, align: "center" });
  t(doc, tierStr, BADGE_X + BADGE_W / 2, 22, { sz: 7, bold: true, color: WHITE, align: "center" });

  // — Action text (between name and badge) ————
  const ACT_X = ML + 165;
  const ACT_W = BADGE_X - ACT_X - 4;
  if (ACT_W > 20) {
    const lines = doc.splitTextToSize(r.action, ACT_W);
    const shown = (lines as string[]).slice(0, 3).join("\n");
    t(doc, shown, ACT_X, 16, { sz: 6.5, italic: true, color: [175, 195, 225], maxW: ACT_W });
  }
}

// ─── SECTION: Artist info strip ──────────────────────────────────────────────

function drawInfoStrip(doc: jsPDF, d: ScorecardData): void {
  const r   = d.results;
  const inp = d.inputs;
  const Y   = HDR_H;

  box(doc, 0, Y, PW, INFO_H, BGINFO);
  hl(doc, 0, PW, Y, DIV, 0.35);
  hl(doc, 0, PW, Y + INFO_H, DIV, 0.35);

  const w = r.pillar_weights;
  const wStr = `${fp(w.p1)}/${fp(w.p2)}/${fp(w.p3)}/${fp(w.p4)}`;
  const ageTour = `${AGE_L[r.age_bracket] ?? "—"} × ${TOUR_L[r.touring_bracket] ?? "—"}`;
  const profLine = `${ageTour}  ·  ${wStr}  ·  ${r.genre_group} P2`;
  const revLine  = `Revenue: ${r.revenue_tier ?? "—"}`;

  // Col 1: Management
  const mgmt  = [inp.management_company, inp.manager_names].filter(Boolean).join(" — ") || "—";
  const others = inp.other_mgmt_artists ? `+${inp.other_mgmt_artists}` : "";
  t(doc, "MGMT", ML, Y + 5,    { sz: 6, bold: true, color: LT });
  t(doc, mgmt + (others ? "  " + others : ""), ML + 9, Y + 5, { sz: 6.5, color: DK, maxW: 62 });

  // Col 2: Booking
  const agent = [inp.booking_agent].filter(Boolean).join(" — ") || "—";
  const agOth = inp.other_agent_artists ? `+${inp.other_agent_artists}` : "";
  t(doc, "AGENT", ML, Y + 10,   { sz: 6, bold: true, color: LT });
  t(doc, agent + (agOth ? "  " + agOth : ""), ML + 9, Y + 10, { sz: 6.5, color: DK, maxW: 62 });

  // Divider
  vl(doc, ML + 78, Y + 2, Y + INFO_H - 2, DIV);

  // Col 3: Merch
  t(doc, "MERCH", ML + 82, Y + 5,  { sz: 6, bold: true, color: LT });
  t(doc, inp.merch_provider || "—", ML + 92, Y + 5, { sz: 6.5, color: DK, maxW: 48 });

  // Col 4: Weight profile
  vl(doc, ML + 145, Y + 2, Y + INFO_H - 2, DIV);
  t(doc, "PROFILE", ML + 149, Y + 5, { sz: 6, bold: true, color: LT });
  t(doc, profLine, ML + 163, Y + 5, { sz: 6.5, color: DK });
  t(doc, revLine,  ML + 163, Y + 10, { sz: 6.5, color: MD });

  // Eval ID — far right
  if (d.evaluationId) {
    t(doc, `ID ${d.evaluationId.toUpperCase().slice(0, 8)}`, PW - MR, Y + 10, {
      sz: 5.5, color: LT, align: "right",
    });
  }
}

// ─── SECTION: Pillar columns ──────────────────────────────────────────────────

/** Draw the navy pillar header row and return the Y for the first data row. */
function pillarHeader(doc: jsPDF, ci: number, label: string, score: number, weightPct: number): number {
  const x = PCOL_X[ci];
  const y = PILLAR_TOP;
  box(doc, x, y, PCOL_W, PH_H, NAVY);

  // Label left
  t(doc, label, x + 2, y + 6, { sz: 7.5, bold: true, color: WHITE });

  // Score (weight%) right
  t(doc, `${fs(score)}  (${weightPct}%)`, x + PCOL_W - 2, y + 6, {
    sz: 7.5, bold: true, color: WHITE, align: "right",
  });

  // Light column header labels
  const hy = y + PH_H + 3;
  t(doc, "Metric", x + 2,       hy, { sz: 5.5, color: LT });
  t(doc, "Input",  x + NW,      hy, { sz: 5.5, color: LT });
  t(doc, "Score",  x + PCOL_W - 2, hy, { sz: 5.5, color: LT, align: "right" });
  hl(doc, x, x + PCOL_W, hy + 1, DIV, 0.2);

  return y + PH_H + 5;  // first data row Y
}

type SubRow = {
  name: string;
  input: string;
  score: number;
  isBonus?: boolean;
};

function drawSubRows(doc: jsPDF, ci: number, startY: number, rows: SubRow[]): number {
  const x = PCOL_X[ci];
  let y = startY;
  rows.forEach((row, i) => {
    if (i % 2 === 1) box(doc, x, y - RH + 1.2, PCOL_W, RH, BGROW);

    // Metric name
    t(doc, row.name, x + 2, y, { sz: 7, color: row.isBonus ? MD : DK, italic: row.isBonus });

    // Input value
    t(doc, row.input, x + NW, y, { sz: 7, color: MD });

    // Score / bonus value
    const scoreStr = row.isBonus
      ? (row.score > 0 ? `+${row.score.toFixed(2)}` : "+0.00")
      : fs(row.score);
    const sColor = row.isBonus
      ? (row.score > 0 ? GREEN : LT)
      : (row.score > 0 ? scoreColor(row.score) : LT);
    t(doc, scoreStr, x + PCOL_W - 2, y, { sz: 7, bold: !row.isBonus, color: sColor, align: "right" });

    y += RH;
  });

  hl(doc, x, x + PCOL_W, y - 0.5, DIV, 0.2);
  return y + 1;
}

// P1 — Touring
function drawP1(doc: jsPDF, r: ScoringResult, inp: EvalFormData): number {
  const w = r.pillar_weights;
  let y = pillarHeader(doc, 0, "P1  TOURING", r.p1.final_score, Math.round(w.p1 * 100));

  const reach = Math.round(nv(inp.venue_capacity) * nv(inp.num_dates) * (nv(inp.sell_through_pct) / 100));

  const rows: SubRow[] = [
    { name: "Venue Capacity",  input: fK(inp.venue_capacity),                            score: r.p1.sub_scores.venue_capacity ?? 0 },
    { name: "Sell-Through",    input: fP(inp.sell_through_pct),                          score: r.p1.sub_scores.sell_through ?? 0 },
    { name: "Audience Reach",  input: reach > 0 ? fK(String(reach)) : "—",               score: r.p1.sub_scores.total_audience_reach ?? 0 },
    { name: "Market Coverage", input: inp.market_coverage ? `${inp.market_coverage}/5` : "—", score: r.p1.sub_scores.market_coverage ?? 0 },
    { name: "Resale Signal",   input: RESALE_S[inp.resale_situation] ?? "—",              score: r.p1.sub_scores.resale ?? 0 },
    { name: "VIP Bonus",       input: VIP_S[inp.vip_level] ?? "None",                    score: r.p1.bonus ?? 0, isBonus: true },
  ];

  return drawSubRows(doc, 0, y, rows);
}

// P2 — Fan Engagement
function drawP2(doc: jsPDF, r: ScoringResult, inp: EvalFormData): number {
  const w = r.pillar_weights;
  let y = pillarHeader(doc, 1, "P2  FAN ENGAGEMENT", r.p2.final_score, Math.round(w.p2 * 100));

  const tikER = inp.tiktok_avg_views && inp.tiktok_followers
    ? `${((nv(inp.tiktok_avg_views) / nv(inp.tiktok_followers)) * 100).toFixed(1)}%`
    : inp.tiktok_followers ? fK(inp.tiktok_followers) : "—";

  const rows: SubRow[] = [
    { name: "Spotify FCR",     input: fP(inp.fan_concentration_ratio),                    score: r.p2.sub_scores.FCR ?? 0 },
    { name: "Fan Identity",    input: inp.p2_fan_identity ? `${inp.p2_fan_identity}/5` : "—", score: r.p2.sub_scores.FanID ?? 0 },
    { name: "Instagram ER",    input: inp.ig_er_pct ? `${parseFloat(inp.ig_er_pct).toFixed(2)}%` : fK(inp.ig_followers), score: r.p2.sub_scores.IG_ER ?? 0 },
    { name: "Reddit",          input: fK(inp.reddit_members),                              score: r.p2.sub_scores.Reddit ?? 0 },
    { name: "Merch Sentiment", input: inp.merch_sentiment ? `${inp.merch_sentiment}/5` : "—", score: r.p2.sub_scores.MerchSent ?? 0 },
    { name: "TikTok ER",       input: tikER,                                               score: r.p2.sub_scores.TikTok ?? 0 },
  ];

  if (!r.p2.youtube_excluded) {
    rows.push({
      name: "YouTube ER",
      input: inp.youtube_er_pct ? `${parseFloat(inp.youtube_er_pct).toFixed(2)}%` : fK(inp.youtube_subscribers),
      score: r.p2.sub_scores.YouTube ?? 0,
    });
  }

  rows.push({
    name: r.p2.youtube_excluded ? "YouTube (excl.)" : "Discord Bonus",
    input: r.p2.youtube_excluded ? "ER not entered" : fK(inp.discord_members),
    score: r.p2.bonus ?? 0,
    isBonus: true,
  });

  return drawSubRows(doc, 1, y, rows);
}

// P3 — E-Commerce
function drawP3(doc: jsPDF, r: ScoringResult, inp: EvalFormData): number {
  const w = r.pillar_weights;
  let y = pillarHeader(doc, 2, "P3  E-COMMERCE", r.p3.final_score, Math.round(w.p3 * 100));

  const rows: SubRow[] = [
    { name: "Store Quality", input: inp.store_quality ? `${inp.store_quality}/5`    : "—", score: r.p3.sub_scores.store_quality ?? 0 },
    { name: "Merch Range",   input: inp.merch_range    ? `${inp.merch_range}/5`      : "—", score: r.p3.sub_scores.merch_range ?? 0 },
    { name: "Price Point",   input: inp.price_point_highest ? `$${inp.price_point_highest}` : "—", score: r.p3.sub_scores.price_point ?? 0 },
    { name: "D2C Infra",     input: inp.d2c_level      ? `${inp.d2c_level}/4`        : "—", score: r.p3.sub_scores.d2c ?? 0 },
  ];

  return drawSubRows(doc, 2, y, rows);
}

// P4 — Growth
function drawP4(doc: jsPDF, r: ScoringResult, inp: EvalFormData): number {
  const w = r.pillar_weights;
  let y = pillarHeader(doc, 3, "P4  GROWTH", r.p4.final_score, Math.round(w.p4 * 100));

  const rows: SubRow[] = [
    { name: "Spotify YoY",   input: fP(inp.spotify_yoy_pct),                               score: r.p4.sub_scores.spotify_yoy ?? 0 },
    { name: "Venue Prog.",   input: PROG_S[inp.venue_progression] ?? inp.venue_progression ?? "—", score: r.p4.sub_scores.venue_progression ?? 0 },
    { name: "IG Growth",     input: inp.ig_30day_gain ? `+${fK(inp.ig_30day_gain)}` : "—", score: r.p4.sub_scores.ig_growth ?? 0 },
    { name: "Press",         input: inp.press_score    ? `${inp.press_score}/5`    : "—",  score: r.p4.sub_scores.press ?? 0 },
    { name: "Playlist",      input: inp.playlist_score ? `${inp.playlist_score}/5` : "—",  score: r.p4.sub_scores.playlist ?? 0 },
  ];

  let endY = drawSubRows(doc, 3, y, rows);

  // Album cycle override note
  if (inp.show_album_cycle && inp.album_cycle_override) {
    const x = PCOL_X[3];
    const note = `* Album cycle: ${inp.album_cycle_override.replace(/_/g, " ")}`;
    t(doc, note, x + 2, endY + 2, { sz: 5.5, italic: true, color: LT });
    endY += 5;
  }

  return endY;
}

function drawPillarGrid(doc: jsPDF, d: ScorecardData): number {
  const r   = d.results;
  const inp = d.inputs;

  const endY1 = drawP1(doc, r, inp);
  const endY2 = drawP2(doc, r, inp);
  const endY3 = drawP3(doc, r, inp);
  const endY4 = drawP4(doc, r, inp);

  // Vertical dividers spanning full pillar height
  const gridBottom = Math.max(endY1, endY2, endY3, endY4);
  [1, 2, 3].forEach(i => {
    vl(doc, PCOL_X[i] - PCOL_GAP / 2, PILLAR_TOP, gridBottom, DIV, 0.25);
  });

  return gridBottom + 3;
}

// ─── SECTION: Score composition ──────────────────────────────────────────────

function drawScoreComp(doc: jsPDF, r: ScoringResult, startY: number): number {
  hl(doc, ML, PW - MR, startY, DIV, 0.35);
  const y = startY + 5;

  t(doc, "SCORE COMPOSITION", ML, y, { sz: 6.5, bold: true, color: NAVY });

  const w = r.pillar_weights;
  const pillars = [
    { label: "P1  Touring",        score: r.p1.final_score, weight: w.p1 },
    { label: "P2  Fan Engagement", score: r.p2.final_score, weight: w.p2 },
    { label: "P3  E-Commerce",     score: r.p3.final_score, weight: w.p3 },
    { label: "P4  Growth",         score: r.p4.final_score, weight: w.p4 },
  ];

  // Column headers
  const TX  = ML + 36;
  const GW  = (CW - 36 - 42) / pillars.length;  // width per pillar block
  const HDY = y - 4;
  t(doc, "Pillar",      TX,           HDY, { sz: 5.5, color: LT });
  t(doc, "Score",       TX + GW * 0.55, HDY, { sz: 5.5, color: LT });
  t(doc, "Weight",      TX + GW * 1.1,  HDY, { sz: 5.5, color: LT });
  t(doc, "Contribution",TX + GW * 1.7,  HDY, { sz: 5.5, color: LT });

  let colX = TX;
  pillars.forEach(({ label, score, weight }) => {
    const contrib = score * weight;
    t(doc, label,          colX,           y, { sz: 7, color: DK });
    t(doc, fs(score),      colX + GW * 0.55, y, { sz: 7, bold: true, color: scoreColor(score) });
    t(doc, fp(weight),     colX + GW * 1.1,  y, { sz: 7, color: MD });
    t(doc, fs(contrib),    colX + GW * 1.7,  y, { sz: 7, color: DK });
    colX += GW * 2.5;
  });

  // Total
  t(doc, "TOTAL",        colX + 4,  y, { sz: 7, bold: true, color: NAVY });
  t(doc, fs(r.total_score), colX + 24, y, { sz: 8, bold: true, color: RED });

  return y + 6;
}

// ─── SECTION: Demographics ────────────────────────────────────────────────────

function drawDemographics(doc: jsPDF, inp: EvalFormData, startY: number): number {
  const agePairs: [string, number][] = [
    ["13–17", nv(inp.d_13_17_m) + nv(inp.d_13_17_f)],
    ["18–24", nv(inp.d_18_24_m) + nv(inp.d_18_24_f)],
    ["25–34", nv(inp.d_25_34_m) + nv(inp.d_25_34_f)],
    ["35–44", nv(inp.d_35_44_m) + nv(inp.d_35_44_f)],
    ["45–64", nv(inp.d_45_64_m) + nv(inp.d_45_64_f)],
    ["65+",   nv(inp.d_65_m)    + nv(inp.d_65_f)],
  ];
  const ethAll: [string, number][] = [
    ["White",     nv(inp.eth_white)],
    ["Hispanic",  nv(inp.eth_hispanic)],
    ["Afr.Am.",   nv(inp.eth_aa)],
    ["Asian",     nv(inp.eth_asian)],
  ];
  const ethPairs: [string, number][] = ethAll.filter(([, v]) => (v as number) > 0);

  const hasAge = agePairs.some(([, v]) => v > 0);
  const hasEth = ethPairs.length > 0;
  if (!hasAge && !hasEth) return startY;

  hl(doc, ML, PW - MR, startY, DIV, 0.3);
  let y = startY + 5;

  t(doc, "AUDIENCE DEMOGRAPHICS", ML, y, { sz: 6.5, bold: true, color: NAVY });
  y += 4;

  // Age row
  if (hasAge) {
    t(doc, "Age:", ML, y, { sz: 6, bold: true, color: LT });
    let ax = ML + 12;
    agePairs.forEach(([grp, val]) => {
      if (val <= 0) return;
      t(doc, grp, ax, y, { sz: 6, color: MD });
      t(doc, `${val}%`, ax + 8, y, { sz: 6.5, bold: true, color: DK });
      ax += 26;
    });
    y += 5;
  }

  // Ethnicity row
  if (hasEth) {
    t(doc, "Ethnicity:", ML, y, { sz: 6, bold: true, color: LT });
    let ex = ML + 18;
    ethPairs.forEach(([grp, val]) => {
      t(doc, grp, ex, y, { sz: 6, color: MD });
      t(doc, `${val}%`, ex + 12, y, { sz: 6.5, bold: true, color: DK });
      ex += 33;
    });
    y += 5;
  }

  return y;
}

// ─── SECTION: Footer ─────────────────────────────────────────────────────────

function drawFooter(doc: jsPDF, d: ScorecardData): void {
  const Y = PH - 5;
  hl(doc, ML, PW - MR, Y - 1, DIV, 0.3);
  t(doc, "A3 Merchandise — Confidential", ML, Y + 2, { sz: 6, color: LT });
  const right = `${shortDate(d.evaluationDate)}${d.evaluationId ? "  ·  " + d.evaluationId.toUpperCase().slice(0, 8) : ""}`;
  t(doc, right, PW - MR, Y + 2, { sz: 6, color: LT, align: "right" });
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function downloadScorecardPDF(data: ScorecardData): void {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });

  const r   = data.results;
  const inp = data.inputs;

  drawHeader(doc, data);
  drawInfoStrip(doc, data);
  let y = drawPillarGrid(doc, data);
  y = drawScoreComp(doc, r, y);
  drawDemographics(doc, inp, y + 2);
  drawFooter(doc, data);

  const slug = safeFilename(data.artistName);
  const dt   = fileDate(data.evaluationDate);
  doc.save(`A3_Soundcheck_${slug}_${dt}.pdf`);
}
