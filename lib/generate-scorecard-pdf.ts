/**
 * A3 Soundcheck — PDF Scorecard Generator  (v3, fixed-layout single-page)
 * Landscape A4 (297 × 210 mm). Bloomberg-terminal density.
 * Import lazily: const { downloadScorecardPDF } = await import("@/lib/generate-scorecard-pdf");
 */

import jsPDF from "jspdf";
import type { ScoringResult } from "@/lib/scoring-engine";
import type { EvalFormData } from "@/app/evaluations/new/types";
import { getAgeProfileLabel } from "@/app/evaluations/new/types";

// ─── Public interface ─────────────────────────────────────────────────────────

export interface ScorecardData {
  artistName: string;
  genre: string | null;
  evaluatorName: string;
  evaluationDate: string;    // ISO string
  evaluationId: string | null;
  results: ScoringResult;
  inputs: EvalFormData;
  a3MgmtNote?: string | null;
  a3AgentNote?: string | null;
}

// ─── Fixed page layout — all Y positions locked ───────────────────────────────
//
//  0 ──────────── Header bar (navy)                           25 mm
// 25 ──────────── Management / Agent strip (bg-info)         53 mm  (28 mm, 2-line wrap)
// 53 ──────────── Profile strip (white, dividers)            61 mm
// 61 ──────────── Four pillar columns                       156 mm  (95 mm budget)
//156 ──────────── Score composition table                   188 mm  (32 mm)
//188 ──────────── Demographics (only if data entered)       204 mm
//204 ──────────── Footer
//210 ──────────── Bottom of page

const PW = 297;
const PH = 210;
const ML = 10;
const MR = 10;
const CW = PW - ML - MR;   // 277 mm usable width

const HDR_H      = 25;
const MGMT_TOP   = HDR_H;          // 25
const MGMT_H     = 28;             // enlarged from 20 to accommodate 2-line wrap
const PROF_TOP   = MGMT_TOP + MGMT_H;  // 53
const PROF_H     = 8;
const PILLAR_TOP = PROF_TOP + PROF_H;  // 61  (fixed)
const PILLAR_H   = 95;                 // budget: never overflow this
const SCORE_TOP  = PILLAR_TOP + PILLAR_H; // 156 (fixed)
const SCORE_H    = 32;
const DEMO_TOP   = SCORE_TOP + SCORE_H;  // 188 (fixed)
const FOOTER_Y   = 204;

// ─── Palette ──────────────────────────────────────────────────────────────────

type RGB = [number, number, number];
const NAVY:    RGB = [27,  42,  74];
const RED:     RGB = [192, 57,  43];
const DK:      RGB = [25,  25,  25];
const MD:      RGB = [90,  90,  90];
const LT:      RGB = [155, 155, 155];
const WHITE:   RGB = [255, 255, 255];
const BGINFO:  RGB = [237, 241, 248];
const BGROW:   RGB = [248, 249, 252];
const DIV:     RGB = [205, 211, 222];
const GREEN:   RGB = [18,  130,  55];
const GREEN_A3: RGB = [39, 174, 96];
const BLUE:    RGB = [37,   99, 200];
const AMBER:   RGB = [175, 115,   0];
const SCORERED:RGB = [175,  35,  35];

function scoreColor(v: number): RGB {
  if (v >= 4) return GREEN;
  if (v >= 3) return BLUE;
  if (v >= 2) return AMBER;
  return SCORERED;
}

// ─── Drawing primitives ───────────────────────────────────────────────────────

function box(doc: jsPDF, x: number, y: number, w: number, h: number, fill: RGB) {
  doc.setFillColor(fill[0], fill[1], fill[2]);
  doc.rect(x, y, w, h, "F");
}

function t(
  doc: jsPDF, text: string, x: number, y: number,
  opts: {
    sz?: number; bold?: boolean; italic?: boolean; color?: RGB;
    align?: "left" | "center" | "right"; maxW?: number;
  } = {}
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
  return isNaN(v) ? "—" : `${v.toFixed(1)}%`;
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
const TOUR_L = ["", "Light", "Moderate", "Heavy", "Massive"];

// ─── SECTION 1: Header bar ────────────────────────────────────────────────────

function drawHeader(doc: jsPDF, d: ScorecardData): void {
  const r = d.results;
  box(doc, 0, 0, PW, HDR_H, NAVY);

  // Branding
  t(doc, "A3 SOUNDCHECK", ML, 6.5, { sz: 6.5, bold: true, color: [170, 190, 220] });

  // Artist name
  const name = d.artistName.length > 42 ? d.artistName.slice(0, 40) + "…" : d.artistName;
  t(doc, name, ML, 15.5, { sz: 14, bold: true, color: WHITE });

  // Genre · Evaluator · Date
  const genreStr = d.genre ? d.genre.toUpperCase() + "  ·  " : "";
  t(doc, `${genreStr}${d.evaluatorName}  ·  ${shortDate(d.evaluationDate)}`,
    ML, 22, { sz: 6.5, color: [165, 185, 218] });

  // Score badge (red, right side)
  const BW = 56;
  const BX = PW - MR - BW;
  box(doc, BX, 1, BW, HDR_H - 2, RED);

  const tier = r.tier_label;
  const tierStr = (tier === "Pass" ? "BELOW" : tier.toUpperCase()) + " TARGET";
  t(doc, "TOTAL SCORE", BX + BW / 2, 6.5, { sz: 6, color: [255, 200, 190], align: "center" });
  t(doc, fs(r.total_score), BX + BW / 2, 15.5, { sz: 18, bold: true, color: WHITE, align: "center" });
  t(doc, tierStr, BX + BW / 2, 21.5, { sz: 7, bold: true, color: WHITE, align: "center" });

  // Action text — between artist name and badge
  const AX  = ML + 158;
  const AW  = BX - AX - 4;
  if (AW > 18) {
    const lines = (doc.splitTextToSize(r.action, AW) as string[]).slice(0, 3).join("\n");
    t(doc, lines, AX, 14, { sz: 6.5, italic: true, color: [175, 200, 228], maxW: AW });
  }
}

// ─── SECTION 2: Management / Agent strip ──────────────────────────────────────

function drawMgmtStrip(doc: jsPDF, d: ScorecardData): void {
  const inp = d.inputs;
  const Y   = MGMT_TOP;
  const LW  = 130;
  const TEXT_X = ML + 24;
  const MAX_TW = LW - 26;
  const LINE_H = 4.5;

  // Build management display string — prefer management_entries (multi-company), fall back to legacy text.
  // Include role in parens for non-default roles (Lead is default for managers).
  let mgmtVal: string;
  if (inp.management_entries && inp.management_entries.length > 0) {
    const parts = inp.management_entries
      .filter((e) => e.company_name || e.manager_selections.length > 0)
      .map((e) => {
        const names = e.manager_selections
          .map((s) => {
            const name = s.manager_name ?? "";
            if (!name) return "";
            return s.role && s.role !== "Lead" ? `${name} (${s.role})` : name;
          })
          .filter(Boolean)
          .join(", ");
        return e.company_name ? `${e.company_name}${names ? " — " + names : ""}` : names;
      })
      .filter(Boolean);
    mgmtVal = parts.join("  /  ") || "—";
  } else {
    mgmtVal = [inp.management_company, inp.manager_names].filter(Boolean).join(" — ") || "—";
  }

  // Build booking display string — prefer booking_entries, fall back to legacy text.
  // Include role in parens for non-default roles (Primary is default for agents).
  let agentVal: string;
  if (inp.booking_entries && inp.booking_entries.length > 0) {
    const parts = inp.booking_entries
      .filter((e) => e.agency_name || e.agent_selections.length > 0)
      .map((e) => {
        const names = e.agent_selections
          .map((s) => {
            const name = s.agent_name ?? "";
            if (!name) return "";
            return s.role && s.role !== "Primary" ? `${name} (${s.role})` : name;
          })
          .filter(Boolean)
          .join(", ");
        return e.agency_name ? `${e.agency_name}${names ? " — " + names : ""}` : names;
      })
      .filter(Boolean);
    agentVal = parts.join("  /  ") || "—";
  } else {
    agentVal = inp.booking_agent || "—";
  }

  // Pre-compute wrapped lines (cap at 2 lines each)
  doc.setFontSize(6.5);
  doc.setFont("helvetica", "normal");
  const rawMgmtLines = doc.splitTextToSize(mgmtVal, MAX_TW) as string[];
  const rawAgentLines = doc.splitTextToSize(agentVal, MAX_TW) as string[];
  function capLines(ls: string[]): string[] {
    if (ls.length <= 2) return ls;
    return [ls[0], ls[1].slice(0, ls[1].length - 1) + "…"];
  }
  const mgmtLines = capLines(rawMgmtLines);
  const agentLines = capLines(rawAgentLines);

  box(doc, 0, Y, PW, MGMT_H, BGINFO);
  hl(doc, 0, PW, Y, DIV, 0.35);
  hl(doc, 0, PW, Y + MGMT_H, DIV, 0.35);

  let ly = Y + 4.5;

  // ── Management rows ───────────────────────────────────────────
  t(doc, "MANAGEMENT", ML, ly, { sz: 6, bold: true, color: LT });
  mgmtLines.forEach((line, i) => {
    t(doc, line, TEXT_X, ly + i * LINE_H, { sz: 6.5, color: DK });
  });
  ly += mgmtLines.length * LINE_H;

  if (inp.other_mgmt_artists) {
    t(doc, "Other managed:", ML + 24, ly, { sz: 5.5, color: LT });
    t(doc, inp.other_mgmt_artists, ML + 51, ly, { sz: 5.5, color: MD, maxW: LW - 53 });
    ly += 4;
  }
  if (d.a3MgmtNote) {
    t(doc, `★ A3 relationship via ${d.a3MgmtNote}`, ML + 24, ly, { sz: 5.5, color: GREEN_A3, maxW: LW - 26 });
    ly += 3.5;
  }

  // ── Agent rows ────────────────────────────────────────────────
  ly += 1.5;  // gap between management and agent sections
  t(doc, "AGENT", ML, ly, { sz: 6, bold: true, color: LT });
  agentLines.forEach((line, i) => {
    t(doc, line, TEXT_X, ly + i * LINE_H, { sz: 6.5, color: DK });
  });
  ly += agentLines.length * LINE_H;

  if (inp.other_agent_artists) {
    t(doc, "Other booked:", ML + 24, ly, { sz: 5.5, color: LT });
    t(doc, inp.other_agent_artists, ML + 49, ly, { sz: 5.5, color: MD, maxW: LW - 51 });
    ly += 4;
  }
  if (d.a3AgentNote) {
    t(doc, `★ A3 relationship via ${d.a3AgentNote}`, ML + 24, ly, { sz: 5.5, color: GREEN_A3, maxW: LW - 26 });
  }

  // ── Divider ───────────────────────────────────────────────────
  vl(doc, ML + LW + 4, Y + 2, Y + MGMT_H - 2, DIV);

  // ── Right column: Merch Provider ──────────────────────────────
  const RX = ML + LW + 10;
  t(doc, "MERCH PROVIDER", RX, Y + 4.5, { sz: 6, bold: true, color: LT });
  t(doc, inp.merch_provider || "—", RX + 32, Y + 4.5, { sz: 6.5, color: DK, maxW: CW - LW - 44 });
}

// ─── SECTION 3: Profile strip ─────────────────────────────────────────────────

function drawProfileStrip(doc: jsPDF, d: ScorecardData): void {
  const r = d.results;
  const Y = PROF_TOP;

  hl(doc, 0, PW, Y, DIV, 0.3);

  const w    = r.pillar_weights;
  const wStr = `${fp(w.p1)} / ${fp(w.p2)} / ${fp(w.p3)} / ${fp(w.p4)}`;
  const age  = getAgeProfileLabel(d.inputs);
  const tour = TOUR_L[r.touring_bracket] ?? "—";

  const parts = [
    age,
    tour,
    `Weights: ${wStr}`,
    `${r.genre_group} P2 profile`,
    `Revenue: ${r.revenue_tier ?? "—"}`,
    d.evaluationId ? `ID: ${d.evaluationId.toUpperCase().slice(0, 8)}` : null,
  ].filter(Boolean).join("   ·   ");

  t(doc, "WEIGHT PROFILE", ML, Y + 5.5, { sz: 5.5, bold: true, color: LT });
  t(doc, parts, ML + 28, Y + 5.5, { sz: 6.5, color: DK });

  hl(doc, 0, PW, Y + PROF_H, DIV, 0.3);
}

// ─── SECTION 4: Pillar grid ───────────────────────────────────────────────────

const PCOL_GAP = 3;
const PCOL_W   = (CW - PCOL_GAP * 3) / 4;   // ≈ 67.75 mm
const PCOL_X   = [0, 1, 2, 3].map(i => ML + i * (PCOL_W + PCOL_GAP));

const PH_H = 8.5;   // pillar header height
const CLH  = 4.5;   // column-label header height
const RH   = 5.5;   // sub-metric row height

// Fixed offsets within each row band (all text shares same baseline)
const TEXT_OFF = RH - 1.6;   // baseline from row top (≈ 3.9 mm into a 5.5 mm band)

// Sub-column x-offsets within each pillar column (relative to PCOL_X[ci])
const NW = PCOL_W * 0.46;   // name column width  (~31 mm)
// input starts at NW; score right-aligned at PCOL_W - 2

function drawPillarColHeader(doc: jsPDF, ci: number, label: string, score: number, wPct: number): number {
  const x = PCOL_X[ci];
  const y = PILLAR_TOP;

  // Navy bar
  box(doc, x, y, PCOL_W, PH_H, NAVY);
  t(doc, label, x + 2, y + PH_H - 2.5, { sz: 7.5, bold: true, color: WHITE });
  t(doc, `${fs(score)}  (${wPct}%)`, x + PCOL_W - 2, y + PH_H - 2.5,
    { sz: 7.5, bold: true, color: WHITE, align: "right" });

  // Sub-column labels row
  const chy = y + PH_H + CLH - 1.5;
  t(doc, "Metric", x + 2,           chy, { sz: 5.5, color: LT });
  t(doc, "Input",  x + NW,          chy, { sz: 5.5, color: LT });
  t(doc, "Score",  x + PCOL_W - 2,  chy, { sz: 5.5, color: LT, align: "right" });
  hl(doc, x, x + PCOL_W, y + PH_H + CLH, DIV, 0.2);

  // Return top of first data row
  return y + PH_H + CLH;
}

type SubRow = { name: string; input: string; score: number; isBonus?: boolean; isInfo?: boolean };

function drawSubRows(doc: jsPDF, ci: number, rowsTopY: number, rows: SubRow[]): number {
  const x = PCOL_X[ci];

  rows.forEach((row, i) => {
    const rowTop  = rowsTopY + i * RH;
    const textY   = rowTop + TEXT_OFF;   // shared baseline for all three cells

    // Alternating row background
    if (i % 2 === 1) box(doc, x, rowTop, PCOL_W, RH, BGROW);

    // Metric name
    t(doc, row.name, x + 2, textY, {
      sz: 7, color: row.isBonus ? MD : (row.isInfo ? MD : DK), italic: !!row.isBonus,
    });

    // Input value
    t(doc, row.input, x + NW, textY, { sz: 7, color: MD });

    // Score value — skip for informational rows
    if (!row.isInfo) {
      const scoreStr = row.isBonus
        ? (row.score > 0 ? `+${row.score.toFixed(2)}` : "+0.00")
        : fs(row.score);

      const sColor: RGB = row.isBonus
        ? (row.score > 0 ? GREEN : LT)   // gray for +0.00 bonus
        : scoreColor(row.score);

      t(doc, scoreStr, x + PCOL_W - 2, textY, {
        sz: 7, bold: !row.isBonus, color: sColor, align: "right",
      });
    }
  });

  const endY = rowsTopY + rows.length * RH;
  hl(doc, x, x + PCOL_W, endY, DIV, 0.2);
  return endY;
}

// P1 — Touring
function drawP1(doc: jsPDF, r: ScoringResult, inp: EvalFormData): number {
  const w     = r.pillar_weights;
  const first = drawPillarColHeader(doc, 0, "P1  TOURING", r.p1.final_score, Math.round(w.p1 * 100));
  const reach = Math.round(nv(inp.venue_capacity) * nv(inp.num_dates) * (nv(inp.sell_through_pct) / 100));

  const rows: SubRow[] = [
    { name: "Venue Capacity",  input: fK(inp.venue_capacity),                                    score: r.p1.sub_scores.venue_capacity ?? 0 },
    { name: "Sell-Through",    input: fP(inp.sell_through_pct),                                  score: r.p1.sub_scores.sell_through ?? 0 },
    { name: "Tour Dates",      input: fK(inp.num_dates),                                          score: 0, isInfo: true },
    { name: "Audience Reach",  input: reach > 0 ? fK(String(reach)) : "—",                       score: r.p1.sub_scores.total_audience_reach ?? 0 },
    { name: "Market Coverage", input: inp.market_coverage ? `${inp.market_coverage}/5` : "—",    score: r.p1.sub_scores.market_coverage ?? 0 },
    { name: "Resale Signal",   input: RESALE_S[inp.resale_situation] ?? "—",                      score: r.p1.sub_scores.resale ?? 0 },
    { name: "VIP Bonus",       input: VIP_S[inp.vip_level] ?? "None", score: r.p1.bonus ?? 0, isBonus: true },
  ];
  return drawSubRows(doc, 0, first, rows);
}

// P2 — Fan Engagement
function drawP2(doc: jsPDF, r: ScoringResult, inp: EvalFormData): number {
  const w     = r.pillar_weights;
  const first = drawPillarColHeader(doc, 1, "P2  FAN ENGAGEMENT", r.p2.final_score, Math.round(w.p2 * 100));

  // When showing ER%, also append follower/subscriber count in parentheses so
  // the PDF parser can recover those raw values on re-import.
  const igERInput = inp.ig_er_pct
    ? (inp.ig_followers
        ? `${parseFloat(inp.ig_er_pct).toFixed(2)}% (${fK(inp.ig_followers)} flwrs)`
        : `${parseFloat(inp.ig_er_pct).toFixed(2)}%`)
    : fK(inp.ig_followers);

  // tikER: computed ER% (if both views+followers) or raw followers
  const tikERInput = (inp.tiktok_avg_views && inp.tiktok_followers)
    ? `${((nv(inp.tiktok_avg_views) / nv(inp.tiktok_followers)) * 100).toFixed(1)}% (${fK(inp.tiktok_followers)} flwrs, ${fK(inp.tiktok_avg_views)} avg)`
    : inp.tiktok_followers ? fK(inp.tiktok_followers) : "—";

  const rows: SubRow[] = [
    { name: "Spotify FCR",     input: inp.spotify_monthly_listeners ? `${fP(inp.fan_concentration_ratio)} (${fK(inp.spotify_monthly_listeners)} listeners)` : fP(inp.fan_concentration_ratio), score: r.p2.sub_scores.FCR ?? 0 },
    { name: "Fan Identity",    input: inp.p2_fan_identity ? `${inp.p2_fan_identity}/5` : "—",    score: r.p2.sub_scores.FanID ?? 0 },
    { name: "Instagram ER",    input: igERInput,                                                  score: r.p2.sub_scores.IG_ER ?? 0 },
    { name: "Reddit",          input: fK(inp.reddit_members),                                     score: r.p2.sub_scores.Reddit ?? 0 },
    { name: "Merch Sentiment", input: inp.merch_sentiment ? `${inp.merch_sentiment}/5` : "—",    score: r.p2.sub_scores.MerchSent ?? 0 },
    { name: "TikTok ER",       input: tikERInput,                                                 score: r.p2.sub_scores.TikTok ?? 0 },
  ];

  if (!r.p2.youtube_excluded) {
    const ytInput = inp.youtube_er_pct
      ? (inp.youtube_subscribers
          ? `${parseFloat(inp.youtube_er_pct).toFixed(2)}% (${fK(inp.youtube_subscribers)} subs)`
          : `${parseFloat(inp.youtube_er_pct).toFixed(2)}%`)
      : fK(inp.youtube_subscribers);
    rows.push({
      name: "YouTube ER",
      input: ytInput,
      score: r.p2.sub_scores.YouTube ?? 0,
    });
  }

  rows.push({
    name: r.p2.youtube_excluded ? "YouTube (excl.)" : "Discord Bonus",
    input: r.p2.youtube_excluded ? "ER not entered" : fK(inp.discord_members),
    score: r.p2.bonus ?? 0,
    isBonus: true,
  });

  return drawSubRows(doc, 1, first, rows);
}

// P3 — E-Commerce
function drawP3(doc: jsPDF, r: ScoringResult, inp: EvalFormData): number {
  const w     = r.pillar_weights;
  const first = drawPillarColHeader(doc, 2, "P3  E-COMMERCE", r.p3.final_score, Math.round(w.p3 * 100));

  const rows: SubRow[] = [
    { name: "Store Quality", input: inp.store_quality       ? `${inp.store_quality}/5`       : "—", score: r.p3.sub_scores.store_quality ?? 0 },
    { name: "Merch Range",   input: inp.merch_range          ? `${inp.merch_range}/5`          : "—", score: r.p3.sub_scores.merch_range ?? 0 },
    { name: "Price Point",   input: inp.price_point_highest  ? `$${inp.price_point_highest}`  : "—", score: r.p3.sub_scores.price_point ?? 0 },
    { name: "D2C Infra",     input: inp.d2c_level            ? `${inp.d2c_level}/4`            : "—", score: r.p3.sub_scores.d2c ?? 0 },
  ];

  return drawSubRows(doc, 2, first, rows);
}

// P4 — Growth
function drawP4(doc: jsPDF, r: ScoringResult, inp: EvalFormData): number {
  const w     = r.pillar_weights;
  const first = drawPillarColHeader(doc, 3, "P4  GROWTH", r.p4.final_score, Math.round(w.p4 * 100));

  // Spotify YoY: append monthly listeners in parentheses if entered so the
  // parser can recover spotify_monthly_listeners on re-import.
  const spotifyYoyInput = inp.spotify_monthly_listeners
    ? `${fP(inp.spotify_yoy_pct)} (${fK(inp.spotify_monthly_listeners)})`
    : fP(inp.spotify_yoy_pct);

  // IG Growth: append followers in parentheses if entered (and not already
  // shown in the IG ER row) so the parser can recover ig_followers.
  const igGrowthInput = inp.ig_30day_gain
    ? (inp.ig_followers
        ? `+${fK(inp.ig_30day_gain)} (${fK(inp.ig_followers)})`
        : `+${fK(inp.ig_30day_gain)}`)
    : "—";

  const rows: SubRow[] = [
    { name: "Spotify YoY",  input: spotifyYoyInput,                                              score: r.p4.sub_scores.spotify_yoy ?? 0 },
    { name: "Venue Prog.",  input: PROG_S[inp.venue_progression] ?? inp.venue_progression ?? "—", score: r.p4.sub_scores.venue_progression ?? 0 },
    { name: "IG Growth",    input: igGrowthInput,                                                 score: r.p4.sub_scores.ig_growth ?? 0 },
    { name: "Press",        input: inp.press_score    ? `${inp.press_score}/5`    : "—",         score: r.p4.sub_scores.press ?? 0 },
    { name: "Playlist",     input: inp.playlist_score ? `${inp.playlist_score}/5` : "—",         score: r.p4.sub_scores.playlist ?? 0 },
  ];

  let endY = drawSubRows(doc, 3, first, rows);

  if (inp.show_album_cycle && inp.album_cycle_override) {
    const note = `* Album cycle: ${inp.album_cycle_override.replace(/_/g, " ")}`;
    t(doc, note, PCOL_X[3] + 2, endY + 2.5, { sz: 5.5, italic: true, color: LT });
  }

  return endY;
}

function drawPillarGrid(doc: jsPDF, d: ScorecardData): void {
  const r   = d.results;
  const inp = d.inputs;

  drawP1(doc, r, inp);
  drawP2(doc, r, inp);
  drawP3(doc, r, inp);
  drawP4(doc, r, inp);

  // Vertical dividers spanning full pillar budget height
  [1, 2, 3].forEach(i => {
    vl(doc, PCOL_X[i] - PCOL_GAP / 2, PILLAR_TOP, PILLAR_TOP + PILLAR_H, DIV, 0.25);
  });
}

// ─── SECTION 5: Score composition table ──────────────────────────────────────

function drawScoreComp(doc: jsPDF, r: ScoringResult): void {
  const Y = SCORE_TOP;
  hl(doc, 0, PW, Y, DIV, 0.4);

  const w = r.pillar_weights;
  const pillars: Array<{ label: string; score: number; weight: number }> = [
    { label: "P1  Touring",        score: r.p1.final_score, weight: w.p1 },
    { label: "P2  Fan Engagement", score: r.p2.final_score, weight: w.p2 },
    { label: "P3  E-Commerce",     score: r.p3.final_score, weight: w.p3 },
    { label: "P4  Growth",         score: r.p4.final_score, weight: w.p4 },
  ];

  // Column x positions (fixed, right-aligned scores)
  const NX  = ML + 2;    // Pillar name left edge
  const SX  = ML + 118;  // Score right edge
  const WX  = ML + 158;  // Weight right edge
  const CX  = ML + 205;  // Contribution right edge

  // Section title
  let y = Y + 5;
  t(doc, "SCORE COMPOSITION", NX, y, { sz: 6.5, bold: true, color: NAVY });

  // Column headers
  y += 5;
  t(doc, "Pillar",         NX,   y, { sz: 5.5, color: LT });
  t(doc, "Score",          SX,   y, { sz: 5.5, color: LT, align: "right" });
  t(doc, "Weight",         WX,   y, { sz: 5.5, color: LT, align: "right" });
  t(doc, "Contribution",   CX,   y, { sz: 5.5, color: LT, align: "right" });
  hl(doc, ML, CX + 5, y + 1.5, DIV, 0.2);

  // Data rows
  const ROW_H = 4.5;
  y += 2;
  pillars.forEach(({ label, score, weight }, i) => {
    y += ROW_H;
    if (i % 2 === 1) box(doc, ML, y - ROW_H + 0.5, CX - ML + 10, ROW_H, BGROW);
    const contrib = score * weight;
    t(doc, label,       NX, y, { sz: 7, color: DK });
    t(doc, fs(score),   SX, y, { sz: 7, bold: true, color: scoreColor(score), align: "right" });
    t(doc, fp(weight),  WX, y, { sz: 7, color: MD,  align: "right" });
    t(doc, fs(contrib), CX, y, { sz: 7, color: DK,  align: "right" });
  });

  // Divider + Total row
  y += 2;
  hl(doc, ML, CX + 5, y, DIV, 0.3);
  y += 4;
  t(doc, "TOTAL",             NX, y, { sz: 7.5, bold: true, color: NAVY });
  t(doc, fs(r.total_score),   CX, y, { sz: 8,   bold: true, color: RED,  align: "right" });
}

// ─── SECTION 6: Demographics ─────────────────────────────────────────────────

function drawDemographics(doc: jsPDF, inp: EvalFormData): void {
  const Y = DEMO_TOP;

  const agePairs: [string, number][] = [
    ["13–17", nv(inp.d_13_17_m) + nv(inp.d_13_17_f)],
    ["18–24", nv(inp.d_18_24_m) + nv(inp.d_18_24_f)],
    ["25–34", nv(inp.d_25_34_m) + nv(inp.d_25_34_f)],
    ["35–44", nv(inp.d_35_44_m) + nv(inp.d_35_44_f)],
    ["45–64", nv(inp.d_45_64_m) + nv(inp.d_45_64_f)],
    ["65+",   nv(inp.d_65_m)    + nv(inp.d_65_f)],
  ];
  const ethAll: [string, number][] = [
    ["White",    nv(inp.eth_white)],
    ["Hispanic", nv(inp.eth_hispanic)],
    ["Afr.Am.",  nv(inp.eth_aa)],
    ["Asian",    nv(inp.eth_asian)],
  ];
  const ethPairs: [string, number][] = ethAll.filter(([, v]) => (v as number) > 0);

  const hasAge = agePairs.some(([, v]) => v > 0);
  const hasEth = ethPairs.length > 0;
  if (!hasAge && !hasEth) return;

  hl(doc, 0, PW, Y, DIV, 0.3);
  let y = Y + 5;

  t(doc, "AUDIENCE DEMOGRAPHICS", ML, y, { sz: 6.5, bold: true, color: NAVY });
  y += 4.5;

  // Age brackets — inline horizontal row, 1 decimal place
  if (hasAge) {
    t(doc, "Age:", ML, y, { sz: 6, bold: true, color: LT });
    let ax = ML + 12;
    agePairs.forEach(([grp, val]) => {
      if (val <= 0) return;
      t(doc, grp, ax, y, { sz: 6, color: MD });
      t(doc, `${val.toFixed(1)}%`, ax + 9, y, { sz: 6.5, bold: true, color: DK });
      ax += 27;
    });
    y += 5;
  }

  // Ethnicity — inline horizontal row, 1 decimal place
  if (hasEth) {
    t(doc, "Ethnicity:", ML, y, { sz: 6, bold: true, color: LT });
    let ex = ML + 19;
    ethPairs.forEach(([grp, val]) => {
      t(doc, grp, ex, y, { sz: 6, color: MD });
      t(doc, `${val.toFixed(1)}%`, ex + 13, y, { sz: 6.5, bold: true, color: DK });
      ex += 34;
    });
  }
}

// ─── SECTION 7: Footer ───────────────────────────────────────────────────────

function drawFooter(doc: jsPDF, d: ScorecardData): void {
  hl(doc, ML, PW - MR, FOOTER_Y - 1, DIV, 0.3);
  t(doc, "A3 Merchandise — Confidential", ML, FOOTER_Y + 3, { sz: 6, color: LT });
  const right = `${shortDate(d.evaluationDate)}${d.evaluationId ? "  ·  ID " + d.evaluationId.toUpperCase().slice(0, 8) : ""}`;
  t(doc, right, PW - MR, FOOTER_Y + 3, { sz: 6, color: LT, align: "right" });
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function downloadScorecardPDF(data: ScorecardData): void {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });

  drawHeader(doc, data);
  drawMgmtStrip(doc, data);
  drawProfileStrip(doc, data);
  drawPillarGrid(doc, data);
  drawScoreComp(doc, data.results);
  drawDemographics(doc, data.inputs);
  drawFooter(doc, data);

  const slug = safeFilename(data.artistName);
  const dt   = fileDate(data.evaluationDate);
  doc.save(`A3_Soundcheck_${slug}_${dt}.pdf`);
}
