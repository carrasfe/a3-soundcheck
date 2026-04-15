/**
 * A3 Soundcheck — PDF Scorecard Parser
 *
 * Reverses the single-page landscape A4 layout produced by
 * lib/generate-scorecard-pdf.ts, using pdfjs-dist for text extraction.
 *
 * Call site must be inside a "use client" component (pdfjs requires DOM APIs).
 * Import dynamically: const { parsePDFScorecard } = await import("@/lib/parse-scorecard-pdf");
 */

import { INITIAL_FORM_DATA } from "@/app/evaluations/new/types";
import type { EvalFormData } from "@/app/evaluations/new/types";

// ─── Public result type ───────────────────────────────────────────────────────

export interface PDFParseResult {
  fd: EvalFormData;
  pdfScore: number | null;
  pdfTier: string | null;
  warnings: string[];
}

// ─── Internal text-item type ──────────────────────────────────────────────────

interface TItem {
  str: string;
  x: number; // mm from left
  y: number; // mm from top
}

// ─── PDF page constants (mirror generate-scorecard-pdf.ts) ────────────────────

// A4 landscape: 297 × 210 mm.  Pillar columns:
//   PCOL_W = (277 - 3*3) / 4 ≈ 67mm,  ML = 10mm
//   PCOL_X = [10, 80, 150, 220] mm
const ML = 10;
const PCOL_W = 67;
const PCOL_X = [10, 80, 150, 220] as const;
const NW = PCOL_W * 0.46; // name column width ≈ 31mm

// ─── Format reversers ─────────────────────────────────────────────────────────

/** "5.5K" → "5500", "2.3M" → "2300000", "1,234" → "1234", "—" → "" */
function reverseFK(s: string): string {
  if (!s || s === "—") return "";
  const c = s.replace(/,/g, "").trim();
  if (c.toUpperCase().endsWith("M")) return String(Math.round(parseFloat(c) * 1_000_000));
  if (c.toUpperCase().endsWith("K")) return String(Math.round(parseFloat(c) * 1_000));
  const n = parseFloat(c);
  return isNaN(n) ? "" : String(n);
}

/** "87.0%" → "87.0", "—" → "" */
function reverseFP(s: string): string {
  if (!s || s === "—") return "";
  const n = parseFloat(s.replace(/%/g, "").trim());
  return isNaN(n) ? "" : String(n);
}

/** "3/5" → "3",  "2/4" → "2" */
function parseSlash(s: string): string {
  const m = s?.match(/^(\d+)\s*\/\s*\d+$/);
  return m ? m[1] : "";
}

/** "+2.5K" → "2500",  "+500" → "500" */
function reverseGain(s: string): string {
  return reverseFK(s.replace(/^\+/, ""));
}

/** "$45" → "45" */
function reverseDollar(s: string): string {
  const n = parseFloat(s.replace(/^\$/, "").trim());
  return isNaN(n) ? "" : String(n);
}

/** "Not SO" → "not_sold_out", "Some SO" → "some_sold_out", "All SO" → "all_sold_out" */
function reverseResale(s: string): EvalFormData["resale_situation"] {
  if (!s || s === "—") return "not_sold_out";
  const l = s.toLowerCase();
  if (l.startsWith("all")) return "all_sold_out";
  if (l.startsWith("some")) return "some_sold_out";
  return "not_sold_out";
}

/** "None"→none, "Prev."→offered_before, "Basic"→basic, "Prem.MG"→premium_mg, "Tiered hi"→tiered_high */
function reverseVip(s: string): EvalFormData["vip_level"] {
  if (!s || s === "—") return "none";
  const l = s.toLowerCase();
  if (l === "none") return "none";
  if (l.includes("prem") || l.includes("mg")) return "premium_mg";
  if (l.includes("tiered") || l === "tiered hi") return "tiered_high";
  if (l.includes("prev") || l.includes("offered") || l.includes("before")) return "offered_before";
  if (l.includes("basic")) return "basic";
  return "none";
}

/** "Smaller"→smaller, "Same"→same, "Step-up"→slight_step_up, "Maj.jump"→major_jump, "Tier chg"→tier_change */
function reverseProg(s: string): string {
  if (!s || s === "—") return "same";
  const l = s.toLowerCase();
  if (l.includes("smaller") || l.includes("step down")) return "smaller";
  if (l.includes("tier")) return "tier_change";
  if (l.includes("maj") || l.includes("big")) return "major_jump";
  if (l.includes("step") || l.includes("up")) return "slight_step_up";
  if (l.includes("same")) return "same";
  return "same";
}

// ─── Y-band grouping ──────────────────────────────────────────────────────────

/** Group items into horizontal rows (±tol mm) sorted top-to-bottom. */
function groupByY(items: TItem[], tol = 1.8): TItem[][] {
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const groups: TItem[][] = [];
  let band: TItem[] = [];
  let bandY = -9999;
  for (const item of sorted) {
    if (Math.abs(item.y - bandY) > tol) {
      if (band.length) groups.push(band);
      band = [item];
      bandY = item.y;
    } else {
      band.push(item);
    }
  }
  if (band.length) groups.push(band);
  return groups;
}

/** Within a Y-band, return the first item whose X is > labelX + 5mm. */
function valueRight(band: TItem[], labelX: number): string {
  return (
    band
      .filter((i) => i.x > labelX + 5)
      .sort((a, b) => a.x - b.x)[0]?.str ?? ""
  );
}

/** Which pillar column does this X (mm) belong to? Returns 0-3, or -1. */
function colOf(x: number): number {
  for (let i = 0; i < 4; i++) {
    if (x >= PCOL_X[i] && x < PCOL_X[i] + PCOL_W + 3) return i;
  }
  return -1;
}

// ─── Sub-row extraction ───────────────────────────────────────────────────────

interface SubRow {
  col: number;
  name: string;
  input: string;
}

/**
 * For a Y-band containing items from all 4 pillar columns, extract
 * {col, name, input} pairs.  The name lives left of the NW boundary;
 * the input lives between NW and the right 8mm score zone.
 */
function extractSubRows(band: TItem[]): SubRow[] {
  const results: SubRow[] = [];
  for (let ci = 0; ci < 4; ci++) {
    const colX = PCOL_X[ci];
    const colItems = band
      .filter((i) => i.x >= colX && i.x < colX + PCOL_W + 3)
      .sort((a, b) => a.x - b.x);
    if (!colItems.length) continue;

    const nwBound = colX + NW;
    const scoreZone = colX + PCOL_W - 8;

    const nameItems  = colItems.filter((i) => i.x < nwBound);
    const inputItems = colItems.filter((i) => i.x >= nwBound && i.x < scoreZone);

    if (nameItems.length && inputItems.length) {
      results.push({
        col: ci,
        name: nameItems.map((i) => i.str).join(" ").toLowerCase(),
        input: inputItems.map((i) => i.str).join(" "),
      });
    }
  }
  return results;
}

// ─── Main parser ──────────────────────────────────────────────────────────────

export async function parsePDFScorecard(file: File): Promise<PDFParseResult> {
  // Dynamic — pdfjs-dist is large and browser-only
  const pdfjs = await import("pdfjs-dist");

  // Use unpkg to serve the matching worker version without bundler config
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc =
      `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
  }

  const buffer  = await file.arrayBuffer();
  const loadTask = pdfjs.getDocument({ data: buffer, useSystemFonts: true });
  const pdf     = await loadTask.promise;

  if (pdf.numPages < 1) throw new Error("Empty PDF");

  const page   = await pdf.getPage(1);
  const vp     = page.getViewport({ scale: 1.0 });
  const tc     = await page.getTextContent();

  // pt → mm conversion (72 pt = 25.4 mm)
  const PT = 25.4 / 72;
  const pageH_mm = vp.height * PT; // ≈ 210mm for A4 landscape

  // Build TItem array: filter out markers that have no str
  const allItems: TItem[] = (tc.items as Array<{ str?: string; transform?: number[] }>)
    .filter((item) => typeof item.str === "string" && item.str.trim() !== "" && item.transform)
    .map((item) => ({
      str: item.str!.trim(),
      x: item.transform![4] * PT,
      y: pageH_mm - item.transform![5] * PT,
    }));

  // Verify this is an A3 Soundcheck PDF
  if (!allItems.some((i) => i.str.includes("A3 SOUNDCHECK"))) {
    throw new Error(
      "Not an A3 Soundcheck scorecard — 'A3 SOUNDCHECK' signature not found. " +
      "Only PDFs generated by A3 Soundcheck can be imported."
    );
  }

  const fd: EvalFormData = { ...INITIAL_FORM_DATA };
  const warnings: string[] = [];
  let pdfScore: number | null = null;
  let pdfTier: string | null = null;

  // ── HEADER  (Y 0–25mm) ────────────────────────────────────────────────────

  const hdr = allItems.filter((i) => i.y < 25);

  // Artist name: left side (X < 120), Y ≈ 14–17mm
  const nameBand = hdr.filter((i) => i.y > 13 && i.y < 18 && i.x < 120);
  if (nameBand.length) {
    fd.artist_name = nameBand.sort((a, b) => a.x - b.x).map((i) => i.str).join(" ");
  }

  // Genre · evaluator · date line: left side, Y ≈ 20–24mm
  const infoItems = hdr.filter((i) => i.y > 19 && i.y < 24 && i.x < 220);
  if (infoItems.length) {
    const infoStr = infoItems.sort((a, b) => a.x - b.x).map((i) => i.str).join("  ");
    // Format: "GENRE  ·  evaluator  ·  date"  (middle-dot separator)
    const parts = infoStr.split(/\s*[·•]\s*/).map((p) => p.trim()).filter(Boolean);
    if (parts[0]) fd.genre = parts[0];
  }

  // Total score: right side of header (X > 215), Y ≈ 13–18mm
  const scoreBand = hdr.filter((i) => i.y > 13 && i.y < 18 && i.x > 215);
  for (const item of scoreBand) {
    const n = parseFloat(item.str);
    if (!isNaN(n) && n > 0 && n <= 5) { pdfScore = n; break; }
  }

  // Tier: right side, Y ≈ 19–24mm
  const tierItems = hdr.filter((i) => i.y > 19 && i.y < 24 && i.x > 215);
  const tierStr = tierItems.map((i) => i.str).join(" ").toUpperCase();
  if (tierStr.includes("PRIORITY"))     pdfTier = "Priority";
  else if (tierStr.includes("ACTIVE"))  pdfTier = "Active";
  else if (tierStr.includes("WATCH"))   pdfTier = "Watch";
  else if (tierStr.includes("BELOW") || tierStr.includes("PASS")) pdfTier = "Pass";

  // ── MANAGEMENT STRIP  (Y 25–45mm) ────────────────────────────────────────

  const mgmtItems = allItems.filter((i) => i.y >= 25 && i.y < 45);
  for (const band of groupByY(mgmtItems, 2.5)) {
    const mgmt = band.find((i) => i.str === "MANAGEMENT");
    if (mgmt) {
      const val = valueRight(band, mgmt.x);
      // val: "Company — Manager Names" or just "Company"
      const parts = val.split(/\s*[—–-]\s*/);
      if (parts[0] && parts[0] !== "—") fd.management_company = parts[0].trim();
      if (parts[1]) fd.manager_names = parts[1].trim();
    }

    const agent = band.find((i) => i.str === "AGENT");
    if (agent) {
      const val = valueRight(band, agent.x);
      if (val && val !== "—") fd.booking_agent = val;
    }

    const merch = band.find((i) => i.str === "MERCH PROVIDER");
    if (merch) {
      const val = valueRight(band, merch.x);
      if (val && val !== "—") fd.merch_provider = val;
    }
  }

  // ── PILLAR ROWS  (Y 53–148mm) ─────────────────────────────────────────────

  const pillarItems = allItems.filter((i) => i.y >= 53 && i.y < 148);

  for (const band of groupByY(pillarItems, 1.8)) {
    for (const row of extractSubRows(band)) {
      const { col, name, input: inp } = row;
      if (!inp || inp === "—") continue;

      switch (col) {
        // ── P1: Touring ───────────────────────────────────────────────────
        case 0:
          if (name.includes("venue cap"))                fd.venue_capacity   = reverseFK(inp);
          if (name.includes("sell-through") || name.includes("sell through"))
                                                          fd.sell_through_pct = reverseFP(inp);
          if (name.includes("market cov"))               fd.market_coverage  = parseSlash(inp);
          if (name.includes("resale sig"))               fd.resale_situation = reverseResale(inp);
          if (name.includes("vip"))                      fd.vip_level        = reverseVip(inp);
          // "Audience Reach" is a derived value — skip
          break;

        // ── P2: Fan Engagement ────────────────────────────────────────────
        case 1:
          if (name.includes("fcr") || name.includes("concentration"))
                                                          fd.fan_concentration_ratio = reverseFP(inp);
          if (name.includes("fan id"))                   fd.p2_fan_identity   = parseSlash(inp);
          if (name.includes("instagram") || name.includes("ig er")) {
            if (inp.endsWith("%"))                        fd.ig_er_pct         = reverseFP(inp);
            else                                          fd.ig_followers      = reverseFK(inp);
          }
          if (name.includes("reddit"))                   fd.reddit_members    = reverseFK(inp);
          if (name.includes("merch sent"))               fd.merch_sentiment   = parseSlash(inp);
          if (name.includes("tiktok")) {
            if (inp.endsWith("%")) {
              // Only calculated ER% is visible; raw followers/views are gone
              warnings.push("TikTok: only ER% available in PDF — enter followers/avg views manually");
            } else {
              fd.tiktok_followers = reverseFK(inp);
            }
          }
          if (name.includes("youtube")) {
            if (inp.endsWith("%"))                        fd.youtube_er_pct      = reverseFP(inp);
            else if (!inp.toLowerCase().includes("excl")) fd.youtube_subscribers = reverseFK(inp);
          }
          if (name.includes("discord") && !inp.toLowerCase().includes("not entered"))
                                                          fd.discord_members = reverseFK(inp);
          break;

        // ── P3: E-Commerce ─────────────────────────────────────────────────
        case 2:
          if (name.includes("store qual"))  fd.store_quality       = parseSlash(inp);
          if (name.includes("merch range")) fd.merch_range         = parseSlash(inp);
          if (name.includes("price"))       fd.price_point_highest = reverseDollar(inp);
          if (name.includes("d2c"))         fd.d2c_level           = parseSlash(inp);
          break;

        // ── P4: Growth ──────────────────────────────────────────────────────
        case 3:
          if (name.includes("spotify yoy")) fd.spotify_yoy_pct  = reverseFP(inp);
          if (name.includes("venue prog"))  fd.venue_progression = reverseProg(inp);
          if (name.includes("ig growth"))   fd.ig_30day_gain     = reverseGain(inp);
          if (name.includes("press"))       fd.press_score       = parseSlash(inp);
          if (name.includes("playlist"))    fd.playlist_score    = parseSlash(inp);
          break;
      }
    }
  }

  // ── DEMOGRAPHICS  (Y 178–200mm) ──────────────────────────────────────────

  const demoItems = allItems.filter((i) => i.y >= 178 && i.y < 200);

  for (const band of groupByY(demoItems, 2.5)) {
    const bandStr = band.map((i) => i.str).join(" ");

    // Age row: "Age:  13–17  15.0%  18–24  42.0% …"
    if (band.some((i) => i.str === "Age:")) {
      const label = band.find((i) => i.str === "Age:")!;
      const rest = band.filter((i) => i.x > label.x).sort((a, b) => a.x - b.x);
      const AGE_KEYS: Array<keyof EvalFormData> = [
        "d_13_17_m", "d_18_24_m", "d_25_34_m", "d_35_44_m", "d_45_64_m", "d_65_m",
      ];
      let ki = 0;
      for (let i = 0; i + 1 < rest.length && ki < AGE_KEYS.length; i++) {
        const cur  = rest[i].str;
        const next = rest[i + 1].str;
        // bracket items contain a dash or plus; pct items end with %
        if ((cur.includes("–") || cur.includes("-") || cur.includes("+")) && next.endsWith("%")) {
          const pct = reverseFP(next);
          if (pct) (fd[AGE_KEYS[ki]] as string) = pct;
          ki++;
          i++; // skip the consumed % item
        }
      }
    }

    // Ethnicity row: "Ethnicity:  White  55.0%  Hispanic  20.0% …"
    if (band.some((i) => i.str === "Ethnicity:")) {
      const label = band.find((i) => i.str === "Ethnicity:")!;
      const rest = band.filter((i) => i.x > label.x).sort((a, b) => a.x - b.x);
      for (let i = 0; i + 1 < rest.length; i++) {
        const grp = rest[i].str.toLowerCase();
        const val = rest[i + 1].str;
        if (val.endsWith("%")) {
          const pct = reverseFP(val);
          if (grp.includes("white"))           fd.eth_white    = pct;
          else if (grp.includes("hisp"))        fd.eth_hispanic = pct;
          else if (grp.includes("afr") || grp.includes("aa") || grp.includes("black"))
                                                fd.eth_aa       = pct;
          else if (grp.includes("asian"))       fd.eth_asian    = pct;
          i++; // skip value
        }
      }
    }

    void bandStr; // suppress "unused variable" lint
  }

  // ── Validation warnings ───────────────────────────────────────────────────

  if (!fd.artist_name) warnings.push("Artist name could not be extracted — please enter it manually");
  if (!fd.genre)       warnings.push("Genre could not be extracted — please enter it manually");
  if (!fd.spotify_monthly_listeners)
    warnings.push(
      "Spotify monthly listeners not shown in PDF — enter manually for accurate FCR & YoY scoring"
    );
  if (!fd.num_dates)
    warnings.push("Number of tour dates not shown in PDF — enter manually if needed");

  return { fd, pdfScore, pdfTier, warnings };
}
