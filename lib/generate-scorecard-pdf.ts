/**
 * A3 Soundcheck — PDF Scorecard Generator
 * Client-side only. Import lazily to keep jsPDF out of the initial bundle:
 *   const { downloadScorecardPDF } = await import("@/lib/generate-scorecard-pdf");
 */

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { ScoringResult } from "@/lib/scoring-engine";
import type { EvalFormData } from "@/app/evaluations/new/types";

// ─── Public interface ─────────────────────────────────────────

export interface ScorecardData {
  artistName: string;
  genre: string | null;
  evaluatorName: string;
  evaluationDate: string;   // ISO string
  evaluationId: string | null;
  results: ScoringResult;
  inputs: EvalFormData;
}

// ─── Constants ────────────────────────────────────────────────

const PAGE_W  = 210; // A4 mm
const PAGE_H  = 297;
const ML      = 18;  // margin left
const MR      = 18;  // margin right
const CW      = PAGE_W - ML - MR; // 174mm content width
const FOOTER_Y = 289;

// Palette — [r, g, b] tuples
const NAVY  = [27, 42, 74]   as [number, number, number];
const RED   = [192, 57, 43]  as [number, number, number];
const DKGRAY = [40, 40, 40]  as [number, number, number];
const MDGRAY = [90, 90, 90]  as [number, number, number];
const LTGRAY = [150, 150, 150] as [number, number, number];
const XLGRAY = [245, 246, 248] as [number, number, number];
const WHITE  = [255, 255, 255] as [number, number, number];
const BORDER = [210, 214, 220] as [number, number, number];

// Tier colors
const TIER_COLORS: Record<string, [number, number, number]> = {
  Priority: RED,
  Active:   NAVY,
  Watch:    [100, 100, 100],
  Pass:     [140, 140, 140],
};

// Label maps
const VIP_LABELS: Record<string, string> = {
  none:           "None",
  offered_before: "Previously offered",
  basic:          "Basic package",
  premium_mg:     "Premium w/ Meet & Greet",
  tiered_high:    "Tiered high-value",
};
const RESALE_LABELS: Record<string, string> = {
  not_sold_out:  "Not sold out",
  some_sold_out: "Some dates sold out",
  all_sold_out:  "All dates sold out",
};
const PROGRESSION_LABELS: Record<string, string> = {
  smaller:       "Downsizing",
  same:          "Same level",
  slight_step_up:"Slight step up",
  major_jump:    "Major jump",
  tier_change:   "Tier change",
};
const AGE_BRACKET_LABELS = ["", "Very Young (≥70%)", "Young (55–70%)", "Mixed (45–55%)", "Mature (30–45%)", "Very Mature (<30%)"];
const TOURING_LABELS     = ["", "Light", "Moderate", "Heavy", "Massive"];

// ─── Formatting helpers ───────────────────────────────────────

function n(s: string | undefined): number { return parseFloat(s ?? "0") || 0; }

function fmtNum(s: string | undefined): string {
  if (!s || s.trim() === "") return "—";
  const v = parseFloat(s);
  return isNaN(v) ? "—" : v.toLocaleString();
}

function fmtPct(s: string | undefined): string {
  if (!s || s.trim() === "") return "—";
  const v = parseFloat(s);
  return isNaN(v) ? "—" : `${v}%`;
}

function fmtScore(v: number): string { return v.toFixed(2); }

function safeFilename(s: string): string {
  return s.replace(/[^a-zA-Z0-9_\-]/g, "_").replace(/_+/g, "_").slice(0, 60);
}

function formatDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }); }
  catch { return iso; }
}

function formatDateFilename(iso: string): string {
  try { return new Date(iso).toISOString().slice(0, 10); }
  catch { return new Date().toISOString().slice(0, 10); }
}

// ─── Low-level draw helpers ───────────────────────────────────

function rgb(doc: jsPDF, color: [number, number, number], mode: "fill" | "text" | "draw" | "both") {
  if (mode === "fill" || mode === "both") doc.setFillColor(color[0], color[1], color[2]);
  if (mode === "text") doc.setTextColor(color[0], color[1], color[2]);
  if (mode === "draw" || mode === "both") doc.setDrawColor(color[0], color[1], color[2]);
}

function txt(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  opts: {
    size?: number;
    bold?: boolean;
    italic?: boolean;
    color?: [number, number, number];
    align?: "left" | "center" | "right";
    maxWidth?: number;
  } = {}
) {
  doc.setFontSize(opts.size ?? 9);
  doc.setFont("helvetica", opts.italic ? "italic" : opts.bold ? "bold" : "normal");
  rgb(doc, opts.color ?? DKGRAY, "text");
  doc.text(text, x, y, {
    align: opts.align,
    maxWidth: opts.maxWidth,
  });
}

function hline(doc: jsPDF, x1: number, x2: number, y: number, color: [number, number, number] = BORDER) {
  doc.setLineWidth(0.25);
  rgb(doc, color, "draw");
  doc.line(x1, y, x2, y);
}

function filledRect(
  doc: jsPDF,
  x: number, y: number, w: number, h: number,
  fill: [number, number, number],
  stroke?: [number, number, number]
) {
  rgb(doc, fill, "fill");
  if (stroke) {
    rgb(doc, stroke, "draw");
    doc.setLineWidth(0.3);
    doc.rect(x, y, w, h, "FD");
  } else {
    doc.rect(x, y, w, h, "F");
  }
}

function scoreColorForVal(v: number): [number, number, number] {
  if (v >= 4) return [22, 140, 60];
  if (v >= 3) return [37, 99, 200];
  if (v >= 2) return [180, 120, 0];
  return [180, 40, 40];
}

// ─── Page header / footer ─────────────────────────────────────

/** Full branded header for page 1 */
function drawPage1Header(doc: jsPDF, d: ScorecardData) {
  const HDR_H = 50;
  filledRect(doc, 0, 0, PAGE_W, HDR_H, NAVY);

  // A3 logo box
  filledRect(doc, ML, 8, 12, 12, RED);
  txt(doc, "A3", ML + 6, 16.5, { size: 10, bold: true, color: WHITE, align: "center" });

  // Title
  txt(doc, "A3 SOUNDCHECK", ML + 16, 16, { size: 16, bold: true, color: WHITE });
  txt(doc, "ARTIST EVALUATION SCORECARD", ML + 16, 22, { size: 7.5, color: [190, 200, 215] });

  // Score panel (right side of header)
  const sx = PAGE_W - MR - 48;
  filledRect(doc, sx, 7, 48, 36, [21, 33, 58]);

  const tier = d.results.tier_label;
  const tierDisplay = tier === "Pass" ? "BELOW" : tier.toUpperCase();

  txt(doc, "TOTAL SCORE", sx + 24, 14, { size: 6.5, color: [190, 200, 215], align: "center" });
  txt(doc, fmtScore(d.results.total_score), sx + 24, 27, { size: 22, bold: true, color: WHITE, align: "center" });

  // Tier badge
  const tierColor = TIER_COLORS[tier] ?? MDGRAY;
  filledRect(doc, sx + 7, 30, 34, 9, tierColor);
  txt(doc, tierDisplay, sx + 24, 36.5, { size: 7.5, bold: true, color: WHITE, align: "center" });

  return HDR_H;
}

/** Slim repeating header for pages 2+ */
function drawMiniHeader(doc: jsPDF, d: ScorecardData) {
  filledRect(doc, 0, 0, PAGE_W, 14, NAVY);
  txt(doc, "A3 SOUNDCHECK", ML, 9, { size: 8, bold: true, color: WHITE });
  txt(doc, `· ${d.artistName}`, ML + 28, 9, { size: 8, color: [190, 200, 215] });
  txt(doc, "Artist Evaluation Scorecard  ·  Confidential", PAGE_W - MR, 9, {
    size: 7, color: [190, 200, 215], align: "right",
  });
  return 14;
}

function drawFooter(doc: jsPDF, page: number, total: number) {
  hline(doc, ML, PAGE_W - MR, FOOTER_Y - 3, BORDER);
  txt(doc, "A3 Merchandise — Confidential", ML, FOOTER_Y + 2, { size: 7, color: LTGRAY });
  txt(doc, `Page ${page} of ${total}`, PAGE_W - MR, FOOTER_Y + 2, { size: 7, color: LTGRAY, align: "right" });
}

// ─── Section label helper ─────────────────────────────────────

function sectionLabel(doc: jsPDF, label: string, y: number): number {
  txt(doc, label, ML, y, { size: 8, bold: true, color: NAVY });
  hline(doc, ML, PAGE_W - MR, y + 2, [200, 206, 216]);
  return y + 7;
}

// ─── Pillar table ─────────────────────────────────────────────

interface PillarRow {
  metric: string;
  input: string;
  score: string;
  weight: string;
  contribution: string;
  scoreVal: number;
}

function drawPillarSection(
  doc: jsPDF,
  startY: number,
  pillarName: string,
  pillarWeight: number,
  result: { final_score: number; weighted_score: number; sub_scores: Record<string, number>; bonus?: number },
  rows: PillarRow[],
  notes: string[]
): number {
  // Section header
  const fw = (pillarWeight * 100).toFixed(0);
  const scoreStr = fmtScore(result.final_score);
  const scoreColor = scoreColorForVal(result.final_score);

  filledRect(doc, ML, startY, CW, 9, XLGRAY, BORDER);
  txt(doc, pillarName, ML + 3, startY + 6, { size: 9, bold: true, color: NAVY });
  txt(doc, `Weight: ${fw}% of total`, PAGE_W - MR - 55, startY + 6, { size: 8, color: MDGRAY });
  txt(doc, `Final Score: ${scoreStr}`, PAGE_W - MR - 3, startY + 6, { size: 9, bold: true, color: scoreColor, align: "right" });

  const tableStartY = startY + 9;

  autoTable(doc, {
    startY: tableStartY,
    margin: { left: ML, right: MR },
    tableWidth: CW,
    head: [["Metric", "Input Value", "Score", "Weight", "Contribution"]],
    body: rows.map((r) => [r.metric, r.input, r.score, r.weight, r.contribution]),
    theme: "grid",
    styles: {
      fontSize: 8,
      cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 },
      lineColor: [220, 224, 230],
      lineWidth: 0.2,
      textColor: DKGRAY,
    },
    headStyles: {
      fillColor: NAVY,
      textColor: WHITE,
      fontStyle: "bold",
      fontSize: 7.5,
    },
    alternateRowStyles: {
      fillColor: [250, 251, 252],
    },
    columnStyles: {
      0: { cellWidth: 48 },
      1: { cellWidth: 56 },
      2: { cellWidth: 18, halign: "center" },
      3: { cellWidth: 22, halign: "center" },
      4: { cellWidth: 30, halign: "right" },
    },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 2) {
        const scoreVal = rows[data.row.index]?.scoreVal ?? 0;
        const c = scoreColorForVal(scoreVal);
        data.cell.styles.textColor = c;
        data.cell.styles.fontStyle = "bold";
      }
    },
  });

  let y = (doc as any).lastAutoTable.finalY as number;

  // Notes (bonus, etc.)
  if (notes.length > 0) {
    y += 2;
    notes.forEach((note) => {
      txt(doc, `  ${note}`, ML, y + 4, { size: 7.5, italic: true, color: MDGRAY });
      y += 5;
    });
  }

  // Summary line
  y += 2;
  filledRect(doc, ML, y, CW, 7, [240, 242, 246], BORDER);
  const scoreColor2 = scoreColorForVal(result.final_score);
  const bonusStr = (result.bonus ?? 0) > 0 ? `  +${(result.bonus ?? 0).toFixed(3)} bonus` : "";
  txt(doc, `Weighted: ${result.weighted_score.toFixed(3)}${bonusStr}`, ML + 3, y + 4.8, { size: 7.5, color: MDGRAY });
  txt(doc, `Final Score: ${fmtScore(result.final_score)}`, PAGE_W - MR - 3, y + 4.8, { size: 8.5, bold: true, color: scoreColor2, align: "right" });

  return y + 7;
}

// ─── Page builders ────────────────────────────────────────────

function buildPage1(doc: jsPDF, d: ScorecardData, r: ScoringResult, inputs: EvalFormData) {
  const hdrBottom = drawPage1Header(doc, d);
  let y = hdrBottom + 10;

  // ── Artist name block ──
  txt(doc, d.artistName, ML, y, { size: 20, bold: true, color: NAVY });
  y += 9;

  txt(doc, d.genre ?? "—", ML, y, { size: 10, color: MDGRAY });
  y += 7;

  const metaLine = [
    `Evaluated by: ${d.evaluatorName}`,
    `Date: ${formatDate(d.evaluationDate)}`,
  ].join("   ·   ");
  txt(doc, metaLine, ML, y, { size: 8.5, color: MDGRAY });
  y += 6;

  if (d.evaluationId) {
    txt(doc, `Evaluation ID: ${d.evaluationId.toUpperCase()}`, ML, y, { size: 7.5, color: LTGRAY, italic: true });
    y += 5;
  }

  hline(doc, ML, PAGE_W - MR, y + 2);
  y += 8;

  // ── Action recommendation ──
  y = sectionLabel(doc, "ACTION RECOMMENDATION", y);
  filledRect(doc, ML, y, CW, 14, XLGRAY, BORDER);
  const action = d.results.action;
  txt(doc, action, ML + 4, y + 9, { size: 9, italic: true, color: NAVY, maxWidth: CW - 8 });
  y += 20;

  // ── Scoring profile ──
  y = sectionLabel(doc, "SCORING PROFILE", y);

  const ageLbl  = AGE_BRACKET_LABELS[r.age_bracket]  ?? "—";
  const tourLbl = TOURING_LABELS[r.touring_bracket]   ?? "—";
  const w = r.pillar_weights;
  const tierThreshNote = (() => {
    // These come from the model defaults, not from the ScoringResult.
    // Show the tier_label + action + revenue_tier clearly.
    return `Revenue Tier: ${r.revenue_tier}  ·  Tier classification applied: ${r.tier_label === "Pass" ? "Below" : r.tier_label}`;
  })();

  const profileLines: Array<{ label: string; value: string }> = [
    { label: "Audience Age Bracket",  value: ageLbl },
    { label: "Touring Presence",      value: tourLbl },
    { label: "Pillar Weights",        value: `P1 ${(w.p1 * 100).toFixed(0)}% / P2 ${(w.p2 * 100).toFixed(0)}% / P3 ${(w.p3 * 100).toFixed(0)}% / P4 ${(w.p4 * 100).toFixed(0)}%` },
    { label: "Fan Engagement Model",  value: `${r.genre_group} genre group weights applied` },
    { label: "Classification",        value: tierThreshNote },
  ];

  filledRect(doc, ML, y, CW, profileLines.length * 9 + 6, XLGRAY, BORDER);
  y += 5;
  profileLines.forEach(({ label, value }) => {
    txt(doc, label + ":", ML + 4, y + 4, { size: 8, color: LTGRAY });
    txt(doc, value, ML + 52, y + 4, { size: 8, bold: true, color: DKGRAY });
    y += 9;
  });
  y += 6;

  // ── Score composition bars ──
  y += 2;
  y = sectionLabel(doc, "SCORE COMPOSITION", y);

  const pillars = [
    { name: "P1  Touring",        score: r.p1.final_score, weight: w.p1 },
    { name: "P2  Fan Engagement", score: r.p2.final_score, weight: w.p2 },
    { name: "P3  E-Commerce",     score: r.p3.final_score, weight: w.p3 },
    { name: "P4  Growth",         score: r.p4.final_score, weight: w.p4 },
  ];

  const BAR_W = 80;
  const BAR_H = 4;
  const BAR_X = PAGE_W - MR - BAR_W;

  pillars.forEach(({ name, score, weight }) => {
    txt(doc, name, ML, y + 4, { size: 8, color: DKGRAY });
    txt(doc, `${(weight * 100).toFixed(0)}%`, ML + 52, y + 4, { size: 8, color: LTGRAY });
    txt(doc, fmtScore(score), ML + 68, y + 4, { size: 8, bold: true, color: scoreColorForVal(score) });

    // bar track
    filledRect(doc, BAR_X, y + 1, BAR_W, BAR_H, [230, 232, 236]);
    // bar fill
    const fillW = Math.min(BAR_W, (score / 5) * BAR_W);
    if (fillW > 0) filledRect(doc, BAR_X, y + 1, fillW, BAR_H, RED);

    y += 8;
  });

  // Total score row
  y += 2;
  hline(doc, ML + 60, PAGE_W - MR, y);
  y += 5;
  txt(doc, "TOTAL SCORE", ML + 60, y + 4, { size: 9, bold: true, color: NAVY });
  txt(doc, fmtScore(r.total_score), PAGE_W - MR - 3, y + 4, { size: 12, bold: true, color: RED, align: "right" });
  y += 10;

  return y;
}

// ─────────────────────────────────────────────────────────────

function buildPage2(doc: jsPDF, d: ScorecardData, r: ScoringResult, inputs: EvalFormData) {
  const hdrBottom = drawMiniHeader(doc, d);
  let y = hdrBottom + 6;

  // ── P1 — Touring ──
  const reach = Math.round(n(inputs.venue_capacity) * n(inputs.num_dates) * (n(inputs.sell_through_pct) / 100));
  const vipBonus = r.p1.bonus ?? 0;
  const vipLevel = inputs.vip_level ?? "none";

  const p1Rows: PillarRow[] = [
    {
      metric: "Venue Capacity",
      input:  fmtNum(inputs.venue_capacity) + " capacity",
      score:  String(r.p1.sub_scores.venue_capacity ?? "—"),
      weight: "25%",
      contribution: ((r.p1.sub_scores.venue_capacity ?? 0) * 0.25).toFixed(3),
      scoreVal: r.p1.sub_scores.venue_capacity ?? 0,
    },
    {
      metric: "Sell-Through Rate",
      input:  fmtPct(inputs.sell_through_pct),
      score:  String(r.p1.sub_scores.sell_through ?? "—"),
      weight: "20%",
      contribution: ((r.p1.sub_scores.sell_through ?? 0) * 0.20).toFixed(3),
      scoreVal: r.p1.sub_scores.sell_through ?? 0,
    },
    {
      metric: "Total Audience Reach",
      input:  reach > 0 ? reach.toLocaleString() + " total" : "—",
      score:  String(r.p1.sub_scores.total_audience_reach ?? "—"),
      weight: "20%",
      contribution: ((r.p1.sub_scores.total_audience_reach ?? 0) * 0.20).toFixed(3),
      scoreVal: r.p1.sub_scores.total_audience_reach ?? 0,
    },
    {
      metric: "Market Coverage",
      input:  inputs.market_coverage ? `${inputs.market_coverage} / 5` : "—",
      score:  String(r.p1.sub_scores.market_coverage ?? "—"),
      weight: "15%",
      contribution: ((r.p1.sub_scores.market_coverage ?? 0) * 0.15).toFixed(3),
      scoreVal: r.p1.sub_scores.market_coverage ?? 0,
    },
    {
      metric: "Resale Signal",
      input:  RESALE_LABELS[inputs.resale_situation] ?? inputs.resale_situation,
      score:  String(r.p1.sub_scores.resale ?? "—"),
      weight: "20%",
      contribution: ((r.p1.sub_scores.resale ?? 0) * 0.20).toFixed(3),
      scoreVal: r.p1.sub_scores.resale ?? 0,
    },
  ];

  const p1Notes: string[] = [];
  if (vipBonus > 0) {
    p1Notes.push(`VIP Bonus: ${VIP_LABELS[vipLevel] ?? vipLevel}  →  +${vipBonus.toFixed(3)} added to score`);
  }

  y = drawPillarSection(doc, y, "P1 — TOURING PERFORMANCE", r.pillar_weights.p1, r.p1, p1Rows, p1Notes);
  y += 8;

  // ── P2 — Fan Engagement ──
  const p2r = r.p2 as ScoringResult["p2"];
  const sw = p2r.sub_weights;
  const discordBonus = p2r.bonus ?? 0;
  const ytExcluded = p2r.youtube_excluded;

  const igInput = inputs.ig_er_pct
    ? `${inputs.ig_er_pct}% ER  (${fmtNum(inputs.ig_followers)} flwrs)`
    : `${fmtNum(inputs.ig_followers)} followers`;

  const p2Rows: PillarRow[] = [
    {
      metric: "Fan Concentration Ratio",
      input:  fmtPct(inputs.fan_concentration_ratio) + " of listeners",
      score:  fmtScore(r.p2.sub_scores.FCR ?? 0),
      weight: `${((sw.FCR ?? 0) * 100).toFixed(0)}%`,
      contribution: ((r.p2.sub_scores.FCR ?? 0) * (sw.FCR ?? 0)).toFixed(3),
      scoreVal: r.p2.sub_scores.FCR ?? 0,
    },
    {
      metric: "Fan Identity Signaling",
      input:  inputs.p2_fan_identity ? `${inputs.p2_fan_identity} / 5` : "—",
      score:  fmtScore(r.p2.sub_scores.FanID ?? 0),
      weight: `${((sw.FanID ?? 0) * 100).toFixed(0)}%`,
      contribution: ((r.p2.sub_scores.FanID ?? 0) * (sw.FanID ?? 0)).toFixed(3),
      scoreVal: r.p2.sub_scores.FanID ?? 0,
    },
    {
      metric: "Instagram Engagement",
      input:  igInput,
      score:  fmtScore(r.p2.sub_scores.IG_ER ?? 0),
      weight: `${((sw.IG_ER ?? 0) * 100).toFixed(0)}%`,
      contribution: ((r.p2.sub_scores.IG_ER ?? 0) * (sw.IG_ER ?? 0)).toFixed(3),
      scoreVal: r.p2.sub_scores.IG_ER ?? 0,
    },
    {
      metric: "Reddit Community",
      input:  fmtNum(inputs.reddit_members) + " members",
      score:  fmtScore(r.p2.sub_scores.Reddit ?? 0),
      weight: `${((sw.Reddit ?? 0) * 100).toFixed(0)}%`,
      contribution: ((r.p2.sub_scores.Reddit ?? 0) * (sw.Reddit ?? 0)).toFixed(3),
      scoreVal: r.p2.sub_scores.Reddit ?? 0,
    },
    {
      metric: "Merch Sentiment",
      input:  inputs.merch_sentiment ? `${inputs.merch_sentiment} / 5` : "—",
      score:  fmtScore(r.p2.sub_scores.MerchSent ?? 0),
      weight: `${((sw.MerchSent ?? 0) * 100).toFixed(0)}%`,
      contribution: ((r.p2.sub_scores.MerchSent ?? 0) * (sw.MerchSent ?? 0)).toFixed(3),
      scoreVal: r.p2.sub_scores.MerchSent ?? 0,
    },
    {
      metric: "TikTok Engagement",
      input:  inputs.tiktok_avg_views
        ? `${fmtNum(inputs.tiktok_avg_views)} avg views  (${fmtNum(inputs.tiktok_followers)} flwrs)`
        : `${fmtNum(inputs.tiktok_followers)} followers`,
      score:  fmtScore(r.p2.sub_scores.TikTok ?? 0),
      weight: `${((sw.TikTok ?? 0) * 100).toFixed(0)}%`,
      contribution: ((r.p2.sub_scores.TikTok ?? 0) * (sw.TikTok ?? 0)).toFixed(3),
      scoreVal: r.p2.sub_scores.TikTok ?? 0,
    },
  ];

  if (!ytExcluded) {
    p2Rows.push({
      metric: "YouTube Engagement",
      input:  inputs.youtube_er_pct
        ? `${parseFloat(inputs.youtube_er_pct).toFixed(2)}% ER  (${fmtNum(inputs.youtube_subscribers)} subs)`
        : `${fmtNum(inputs.youtube_subscribers)} subscribers`,
      score:  fmtScore(r.p2.sub_scores.YouTube ?? 0),
      weight: `${((sw.YouTube ?? 0) * 100).toFixed(0)}%`,
      contribution: ((r.p2.sub_scores.YouTube ?? 0) * (sw.YouTube ?? 0)).toFixed(3),
      scoreVal: r.p2.sub_scores.YouTube ?? 0,
    });
  }

  const p2Notes: string[] = [];
  if (ytExcluded) {
    p2Notes.push("YouTube excluded: ER% not provided or score ≤1 — weight redistributed to other metrics");
  }
  if (discordBonus > 0 && inputs.discord_members) {
    p2Notes.push(`Discord Bonus: ${fmtNum(inputs.discord_members)} members  →  +${discordBonus.toFixed(3)} added to score`);
  }

  y = drawPillarSection(doc, y, "P2 — FAN ENGAGEMENT", r.pillar_weights.p2, r.p2, p2Rows, p2Notes);
}

// ─────────────────────────────────────────────────────────────

function buildPage3(doc: jsPDF, d: ScorecardData, r: ScoringResult, inputs: EvalFormData) {
  const hdrBottom = drawMiniHeader(doc, d);
  let y = hdrBottom + 6;

  // ── P3 — E-Commerce ──
  const p3Rows: PillarRow[] = [
    {
      metric: "Store Quality",
      input:  inputs.store_quality ? `${inputs.store_quality} / 5` : "—",
      score:  fmtScore(r.p3.sub_scores.store_quality ?? 0),
      weight: "35%",
      contribution: ((r.p3.sub_scores.store_quality ?? 0) * 0.35).toFixed(3),
      scoreVal: r.p3.sub_scores.store_quality ?? 0,
    },
    {
      metric: "Merch Range",
      input:  inputs.merch_range ? `Level ${inputs.merch_range} / 5` : "—",
      score:  fmtScore(r.p3.sub_scores.merch_range ?? 0),
      weight: "30%",
      contribution: ((r.p3.sub_scores.merch_range ?? 0) * 0.30).toFixed(3),
      scoreVal: r.p3.sub_scores.merch_range ?? 0,
    },
    {
      metric: "Price Point",
      input:  inputs.price_point_highest ? `$${inputs.price_point_highest} highest item` : "—",
      score:  fmtScore(r.p3.sub_scores.price_point ?? 0),
      weight: "25%",
      contribution: ((r.p3.sub_scores.price_point ?? 0) * 0.25).toFixed(3),
      scoreVal: r.p3.sub_scores.price_point ?? 0,
    },
    {
      metric: "D2C Infrastructure",
      input:  inputs.d2c_level ? `Level ${inputs.d2c_level} / 4` : "—",
      score:  fmtScore(r.p3.sub_scores.d2c ?? 0),
      weight: "10%",
      contribution: ((r.p3.sub_scores.d2c ?? 0) * 0.10).toFixed(3),
      scoreVal: r.p3.sub_scores.d2c ?? 0,
    },
  ];

  y = drawPillarSection(doc, y, "P3 — E-COMMERCE", r.pillar_weights.p3, r.p3, p3Rows, []);
  y += 8;

  // ── P4 — Growth Trajectory ──
  const p4Rows: PillarRow[] = [
    {
      metric: "Spotify YoY Growth",
      input:  inputs.spotify_yoy_pct
        ? `${inputs.spotify_yoy_pct}% YoY  (${fmtNum(inputs.spotify_monthly_listeners)} listeners)`
        : fmtNum(inputs.spotify_monthly_listeners) + " monthly listeners",
      score:  fmtScore(r.p4.sub_scores.spotify_yoy ?? 0),
      weight: "30%",
      contribution: ((r.p4.sub_scores.spotify_yoy ?? 0) * 0.30).toFixed(3),
      scoreVal: r.p4.sub_scores.spotify_yoy ?? 0,
    },
    {
      metric: "Venue Progression",
      input:  PROGRESSION_LABELS[inputs.venue_progression] ?? inputs.venue_progression ?? "—",
      score:  fmtScore(r.p4.sub_scores.venue_progression ?? 0),
      weight: "25%",
      contribution: ((r.p4.sub_scores.venue_progression ?? 0) * 0.25).toFixed(3),
      scoreVal: r.p4.sub_scores.venue_progression ?? 0,
    },
    {
      metric: "Instagram Growth",
      input:  inputs.ig_30day_gain
        ? `+${fmtNum(inputs.ig_30day_gain)} followers / 30 days`
        : "—",
      score:  fmtScore(r.p4.sub_scores.ig_growth ?? 0),
      weight: "20%",
      contribution: ((r.p4.sub_scores.ig_growth ?? 0) * 0.20).toFixed(3),
      scoreVal: r.p4.sub_scores.ig_growth ?? 0,
    },
    {
      metric: "Press Coverage",
      input:  inputs.press_score ? `${inputs.press_score} / 5` : "—",
      score:  fmtScore(r.p4.sub_scores.press ?? 0),
      weight: "15%",
      contribution: ((r.p4.sub_scores.press ?? 0) * 0.15).toFixed(3),
      scoreVal: r.p4.sub_scores.press ?? 0,
    },
    {
      metric: "Playlist Placement",
      input:  inputs.playlist_score ? `${inputs.playlist_score} / 5` : "—",
      score:  fmtScore(r.p4.sub_scores.playlist ?? 0),
      weight: "10%",
      contribution: ((r.p4.sub_scores.playlist ?? 0) * 0.10).toFixed(3),
      scoreVal: r.p4.sub_scores.playlist ?? 0,
    },
  ];

  const p4Notes: string[] = [];
  if (inputs.show_album_cycle && inputs.album_cycle_override) {
    p4Notes.push(`Album Cycle Override applied: ${inputs.album_cycle_override.replace(/_/g, " ")}`);
  }

  y = drawPillarSection(doc, y, "P4 — GROWTH TRAJECTORY", r.pillar_weights.p4, r.p4, p4Rows, p4Notes);
  y += 8;

  // ── Demographics ──
  y = sectionLabel(doc, "AUDIENCE DEMOGRAPHICS", y);

  // Age distribution
  const agePairs: Array<[string, string]> = [
    ["13–17",  fmtPct(String(n(inputs.d_13_17_m)  + n(inputs.d_13_17_f)))],
    ["18–24",  fmtPct(String(n(inputs.d_18_24_m)  + n(inputs.d_18_24_f)))],
    ["25–34",  fmtPct(String(n(inputs.d_25_34_m)  + n(inputs.d_25_34_f)))],
    ["35–44",  fmtPct(String(n(inputs.d_35_44_m)  + n(inputs.d_35_44_f)))],
    ["45–64",  fmtPct(String(n(inputs.d_45_64_m)  + n(inputs.d_45_64_f)))],
    ["65+",    fmtPct(String(n(inputs.d_65_m)     + n(inputs.d_65_f)))],
  ];

  const hasDemo = agePairs.some(([, v]) => v !== "0%");

  const ethPairs: Array<[string, string]> = (
    [
      ["White",            fmtPct(inputs.eth_white)],
      ["Hispanic",         fmtPct(inputs.eth_hispanic)],
      ["African American", fmtPct(inputs.eth_aa)],
      ["Asian",            fmtPct(inputs.eth_asian)],
    ] as Array<[string, string]>
  ).filter(([, v]) => v !== "—");

  if (hasDemo || ethPairs.length > 0) {
    // Two-column layout: age left, ethnicity right
    const COL_W = (CW - 10) / 2;
    const COL2_X = ML + COL_W + 10;

    if (hasDemo) {
      txt(doc, "Age Distribution", ML, y + 3, { size: 7.5, bold: true, color: NAVY });
      y += 6;
      agePairs.forEach(([group, pct]) => {
        if (pct === "0%" || pct === "—") return;
        txt(doc, group, ML, y + 3, { size: 8, color: MDGRAY });
        txt(doc, pct, ML + COL_W * 0.45, y + 3, { size: 8, bold: true, color: DKGRAY });
        y += 5.5;
      });
    }

    if (ethPairs.length > 0) {
      const ethStartY = hasDemo ? hdrBottom + 6 + 8 + 8 : y; // rough re-align; let it flow
      txt(doc, "Ethnicity", COL2_X, (hasDemo ? y - (agePairs.filter(([, v]) => v !== "0%" && v !== "—").length * 5.5) : y) + 3, { size: 7.5, bold: true, color: NAVY });
      let ey = (hasDemo ? y - (agePairs.filter(([, v]) => v !== "0%" && v !== "—").length * 5.5) + 6 : y + 6);
      ethPairs.forEach(([group, pct]) => {
        txt(doc, group, COL2_X, ey + 3, { size: 8, color: MDGRAY });
        txt(doc, pct, COL2_X + COL_W * 0.6, ey + 3, { size: 8, bold: true, color: DKGRAY });
        ey += 5.5;
      });
    }
  } else {
    txt(doc, "No demographic data provided", ML, y + 4, { size: 8, color: LTGRAY, italic: true });
    y += 8;
  }

  y += 10;

  // ── Management Info ──
  y = sectionLabel(doc, "ARTIST MANAGEMENT & HEADER INFO", y);

  const mgmtFields: Array<[string, string]> = [
    ["Management Co.",  inputs.management_company || "—"],
    ["Manager(s)",      inputs.manager_names || "—"],
    ["Other Managed",   inputs.other_mgmt_artists || "—"],
    ["Booking Agent",   inputs.booking_agent || "—"],
    ["Other Booked",    inputs.other_agent_artists || "—"],
    ["Merch Provider",  inputs.merch_provider || "—"],
  ];

  const COL_COUNT = 2;
  const COL_W_MGMT = CW / COL_COUNT;

  mgmtFields.forEach(([label, value], idx) => {
    const col = idx % COL_COUNT;
    const row = Math.floor(idx / COL_COUNT);
    const x = ML + col * COL_W_MGMT;
    const rowY = y + row * 10;

    txt(doc, label, x, rowY + 3, { size: 7.5, color: LTGRAY });
    txt(doc, value, x, rowY + 8, { size: 8.5, bold: true, color: DKGRAY, maxWidth: COL_W_MGMT - 6 });
  });
}

// ─── Main export ──────────────────────────────────────────────

export function downloadScorecardPDF(data: ScorecardData): void {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const r = data.results;
  const inputs = data.inputs;

  // Build all 3 pages
  buildPage1(doc, data, r, inputs);

  doc.addPage();
  buildPage2(doc, data, r, inputs);

  doc.addPage();
  buildPage3(doc, data, r, inputs);

  // Add footers to all pages
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    drawFooter(doc, i, totalPages);
  }

  // Download
  const artistSlug = safeFilename(data.artistName);
  const dateSlug   = formatDateFilename(data.evaluationDate);
  doc.save(`A3_Soundcheck_${artistSlug}_${dateSlug}.pdf`);
}
