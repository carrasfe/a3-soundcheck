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

// A4 landscape: 297 × 210 mm.
// PCOL_W = (277 - 3*3) / 4 = 67 mm,  ML = 10 mm
// PCOL_X = [10, 80, 150, 220] mm
const ML     = 10;
const PCOL_W = 67;
const PCOL_X = [10, 80, 150, 220] as const;
const NW     = PCOL_W * 0.46; // name column width ≈ 30.82 mm

// ─── Format reversers ─────────────────────────────────────────────────────────

/** "5.5K" → "5500", "2.3M" → "2300000", "1,234" → "1234", "—" → "" */
function reverseFK(s: string): string {
  if (!s || s === "—") return "";
  const c = s.replace(/,/g, "").trim();
  const upper = c.toUpperCase();
  if (upper.endsWith("M")) return String(Math.round(parseFloat(c) * 1_000_000));
  if (upper.endsWith("K")) return String(Math.round(parseFloat(c) * 1_000));
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
  if (l.includes("tiered")) return "tiered_high";
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
  return "same";
}

/**
 * Split a compound input like "2.06% (22K flwrs)" into its main value and
 * optional parenthetical.  Returns { main, paren } where paren may be null.
 */
function splitParen(s: string): { main: string; paren: string | null } {
  const m = s?.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  return m ? { main: m[1].trim(), paren: m[2].trim() } : { main: s?.trim() ?? "", paren: null };
}

/**
 * Extract a K/M number from parenthetical text like "22K flwrs", "1.4M", "4.5K subs".
 * Strips trailing words (flwrs, subs, listeners, etc.) before parsing.
 */
function parenFK(paren: string | null): string {
  if (!paren) return "";
  const cleaned = paren.replace(/\s*(flwrs?|subs?|listeners?)\s*$/i, "").trim();
  return reverseFK(cleaned);
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

// ─── Sub-row extraction ───────────────────────────────────────────────────────

interface SubRow {
  col: number;
  name: string;   // lowercased, joined from name-zone items
  input: string;  // raw joined string from input-zone items (may include parenthetical)
}

/**
 * For a Y-band, extract {col, name, input} for each of the 4 pillar columns.
 *
 * Column layout (each 67mm wide, separated by 3mm gaps):
 *   Name zone :  [colX,       colX + NW)          ← metric label
 *   Input zone:  [colX + NW,  colX + PCOL_W - 7)  ← input value (+ optional parenthetical)
 *   Score zone:  [colX + PCOL_W - 7, …)            ← score (right-aligned, excluded)
 *
 * A row is only emitted if BOTH name items AND input items are found.
 * Items whose left edge is in the input zone are captured even if the rendered
 * text visually extends into the score zone.
 */
function extractSubRows(band: TItem[]): SubRow[] {
  const results: SubRow[] = [];
  for (let ci = 0; ci < 4; ci++) {
    const colX      = PCOL_X[ci];
    const nwBound   = colX + NW;           // ≈ colX + 30.82
    const scoreEdge = colX + PCOL_W - 7;  // right edge cutoff for input zone

    const colItems = band
      .filter((i) => i.x >= colX && i.x < colX + PCOL_W + 3)
      .sort((a, b) => a.x - b.x);
    if (!colItems.length) continue;

    // Name items: left of the NW boundary (with 1mm tolerance for fp rounding)
    const nameItems  = colItems.filter((i) => i.x < nwBound + 1.0);
    // Input items: starts at or after NW boundary, before score zone
    const inputItems = colItems.filter((i) => i.x >= nwBound - 1.0 && i.x < scoreEdge);

    // Deduplicate: if an item could be in both zones, assign it to input zone
    const nameFinal  = nameItems.filter((i) => i.x < nwBound - 1.0);
    const inputFinal = inputItems; // already bounded above

    if (nameFinal.length && inputFinal.length) {
      results.push({
        col:   ci,
        name:  nameFinal.map((i) => i.str).join(" ").toLowerCase().trim(),
        input: inputFinal.map((i) => i.str).join(" ").trim(),
      });
    }
  }
  return results;
}

// ─── pdfjs-dist version (must match node_modules/pdfjs-dist) ─────────────────

const PDFJS_VERSION = "5.6.205";
const PDFJS_CDN     = `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/build`;

// ─── Main parser ──────────────────────────────────────────────────────────────

export async function parsePDFScorecard(file: File): Promise<PDFParseResult> {
  // pdfjs-dist/build/pdf.mjs is itself a webpack bundle (__webpack_require__
  // runtime included). When Next.js's webpack tries to re-bundle it the two
  // webpack runtimes collide → "Object.defineProperty called on non-object".
  //
  // Fix: load pdfjs directly from the CDN at runtime using webpackIgnore so
  // Next.js's bundler never touches it. The worker URL already uses unpkg, so
  // we already depend on CDN availability at parse time.
  let pdfjs: typeof import("pdfjs-dist");
  try {
    pdfjs = await import(
      /* webpackIgnore: true */
      `${PDFJS_CDN}/pdf.min.mjs`
    ) as typeof import("pdfjs-dist");
  } catch (loadErr) {
    console.error("[PDF Parser] Failed to load pdfjs-dist from CDN:", loadErr);
    throw new Error(
      "Could not load PDF library — check your internet connection and try again."
    );
  }

  // Worker must run on the same CDN so versions are guaranteed to match.
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = `${PDFJS_CDN}/pdf.worker.min.mjs`;
  }

  let buffer: ArrayBuffer;
  let pdf: Awaited<ReturnType<typeof pdfjs.getDocument>["promise"]>;

  try {
    buffer = await file.arrayBuffer();
    const loadTask = pdfjs.getDocument({ data: buffer, useSystemFonts: true });
    pdf = await loadTask.promise;
  } catch (openErr) {
    console.error("[PDF Parser] Failed to open PDF:", openErr);
    throw new Error(
      `Could not open PDF file: ${openErr instanceof Error ? openErr.message : String(openErr)}`
    );
  }

  try {
    return await _parsePDF(pdf);
  } catch (parseErr) {
    console.error("[PDF Parser] Extraction error:", parseErr);
    throw new Error(
      `Failed to extract data from PDF: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`
    );
  }
}

// Split into a private helper so the outer function stays focused on loading/error handling.
async function _parsePDF(
  pdf: Awaited<ReturnType<typeof import("pdfjs-dist").getDocument>["promise"]>
): Promise<PDFParseResult> {
  if (pdf.numPages < 1) throw new Error("Empty PDF");

  const page = await pdf.getPage(1);
  const vp   = page.getViewport({ scale: 1.0 });
  const tc   = await page.getTextContent();

  // pt → mm (72 pt = 25.4 mm)
  const PT       = 25.4 / 72;
  const pageH_mm = vp.height * PT; // ≈ 210 mm for A4 landscape

  console.log(`[PDF Parser] Page size: ${(vp.width * PT).toFixed(1)} × ${pageH_mm.toFixed(1)} mm, ${tc.items.length} text items`);

  // Build TItem array — filter empty strings and items without transforms
  const allItems: TItem[] = (
    tc.items as Array<{ str?: string; transform?: number[] }>
  )
    .filter((item) => typeof item.str === "string" && item.str.trim() !== "" && item.transform)
    .map((item) => ({
      str: item.str!.trim(),
      x:   item.transform![4] * PT,
      y:   pageH_mm - item.transform![5] * PT,
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
  let pdfTier:  string | null = null;

  // ── HEADER  (Y 0–25 mm) ──────────────────────────────────────────────────────

  const hdr = allItems.filter((i) => i.y < 25);

  // Artist name — left side (X < 150), Y ≈ 13–18 mm
  const nameBand = hdr.filter((i) => i.y > 12 && i.y < 19 && i.x < 150);
  if (nameBand.length) {
    fd.artist_name = nameBand.sort((a, b) => a.x - b.x).map((i) => i.str).join(" ");
  }

  // Genre — left side, Y ≈ 19–24 mm
  const infoItems = hdr.filter((i) => i.y > 19 && i.y < 24 && i.x < 220);
  if (infoItems.length) {
    const infoStr = infoItems.sort((a, b) => a.x - b.x).map((i) => i.str).join("  ");
    const parts = infoStr.split(/\s*[·•]\s*/).map((p) => p.trim()).filter(Boolean);
    if (parts[0]) fd.genre = parts[0];
  }

  // Total score — right score badge (X > 220), Y ≈ 12–20 mm (sz 18 font)
  // Look for the largest valid score number in the badge area
  const scoreCandidates = hdr
    .filter((i) => i.y > 11 && i.y < 21 && i.x > 220)
    .map((i) => parseFloat(i.str))
    .filter((n) => !isNaN(n) && n >= 1.0 && n <= 5.0)
    .sort((a, b) => b - a); // descending — total score should be the largest
  if (scoreCandidates.length) pdfScore = scoreCandidates[0];

  // Tier — right side, Y ≈ 19–24 mm
  const tierItems = hdr.filter((i) => i.y > 18 && i.y < 25 && i.x > 200);
  const tierStr   = tierItems.map((i) => i.str).join(" ").toUpperCase();
  if      (tierStr.includes("PRIORITY"))              pdfTier = "Priority";
  else if (tierStr.includes("ACTIVE"))                pdfTier = "Active";
  else if (tierStr.includes("WATCH"))                 pdfTier = "Watch";
  else if (tierStr.includes("BELOW") || tierStr.includes("PASS")) pdfTier = "Pass";

  // ── MANAGEMENT STRIP  (Y 25–45 mm) ──────────────────────────────────────────

  const mgmtItems = allItems.filter((i) => i.y >= 25 && i.y < 45);
  for (const band of groupByY(mgmtItems, 2.5)) {
    const mgmt = band.find((i) => i.str === "MANAGEMENT");
    if (mgmt) {
      const val   = band.filter((i) => i.x > mgmt.x + 5).sort((a, b) => a.x - b.x).map((i) => i.str).join(" ");
      const parts = val.split(/\s*[—–-]\s*/);
      if (parts[0] && parts[0] !== "—") fd.management_company = parts[0].trim();
      if (parts[1])                      fd.manager_names       = parts[1].trim();
    }

    const agent = band.find((i) => i.str === "AGENT");
    if (agent) {
      const val = band.filter((i) => i.x > agent.x + 5).sort((a, b) => a.x - b.x).map((i) => i.str).join(" ");
      if (val && val !== "—") fd.booking_agent = val;
    }

    const merch = band.find((i) => i.str.includes("MERCH PROVIDER") || i.str === "MERCH");
    if (merch) {
      const val = band.filter((i) => i.x > merch.x + 5).sort((a, b) => a.x - b.x).map((i) => i.str).join(" ");
      if (val && val !== "—") fd.merch_provider = val;
    }
  }

  // ── PILLAR ROWS  (Y 53–148 mm) ───────────────────────────────────────────────
  //
  // Each row band contains up to 4 items per pillar column (name, input, score).
  // extractSubRows splits them by column and returns {col, name, input}.

  const pillarItems = allItems.filter((i) => i.y >= 53 && i.y < 148);

  for (const band of groupByY(pillarItems, 1.8)) {
    for (const row of extractSubRows(band)) {
      const { col, name, input: rawInp } = row;

      // splitParen: handles "2.06% (22K flwrs)" → { main: "2.06%", paren: "22K flwrs" }
      const { main: inp, paren } = splitParen(rawInp);

      switch (col) {
        // ── P1: Touring ─────────────────────────────────────────────────────────
        case 0:
          if (!inp || inp === "—") break;
          if (name.includes("venue cap"))
            fd.venue_capacity   = reverseFK(inp);
          else if (name.includes("sell-through") || name.includes("sell through"))
            fd.sell_through_pct = reverseFP(inp);
          else if (name.includes("market cov"))
            fd.market_coverage  = parseSlash(inp);
          else if (name.includes("resale sig"))
            fd.resale_situation = reverseResale(inp);
          else if (name.includes("vip"))
            fd.vip_level        = reverseVip(inp);
          // "Audience Reach" is derived — skip
          break;

        // ── P2: Fan Engagement ───────────────────────────────────────────────────
        case 1:
          if (name.includes("spotify fcr") || name === "spotify fcr" ||
              (name.includes("fcr") && !name.includes("spotify yoy"))) {
            // "Spotify FCR  88.7%" — direct percentage
            if (inp && inp !== "—") fd.fan_concentration_ratio = reverseFP(inp);
          }
          else if (name.includes("fan identity") || name.includes("fan id")) {
            if (inp && inp !== "—") fd.p2_fan_identity = parseSlash(inp);
          }
          else if (name.includes("instagram er") || name.includes("instagram")) {
            if (!inp || inp === "—") break;
            if (inp.endsWith("%")) {
              fd.ig_er_pct = reverseFP(inp);
              // Parenthetical: "2.06% (22K flwrs)" → ig_followers
              if (paren) fd.ig_followers = parenFK(paren);
            } else {
              // PDF shows followers directly (no ER% entered)
              fd.ig_followers = reverseFK(inp);
            }
          }
          else if (name === "reddit" || name.startsWith("reddit")) {
            // Input: plain number or K-formatted, e.g. "365" or "1.3K"
            if (inp && inp !== "—") fd.reddit_members = reverseFK(inp);
          }
          else if (name.includes("merch sentiment") || name.includes("merch sent")) {
            if (inp && inp !== "—") fd.merch_sentiment = parseSlash(inp);
          }
          else if (name.includes("tiktok er") || name.includes("tiktok")) {
            if (!inp || inp === "—") break;
            if (inp.endsWith("%")) {
              // ER% shown; followers may be in parenthetical
              if (paren) {
                fd.tiktok_followers = parenFK(paren);
                // avg_views not recoverable from ER alone — warn if paren absent
              } else {
                warnings.push(
                  "TikTok: only ER% shown in PDF — enter TikTok followers & avg views manually"
                );
              }
            } else {
              // PDF shows raw followers (ER not available)
              fd.tiktok_followers = reverseFK(inp);
            }
          }
          else if (name.includes("youtube er") || name.includes("youtube")) {
            if (name.includes("excl")) break; // "YouTube (excl.)" bonus row — skip
            if (!inp || inp === "—" || inp.toLowerCase().includes("not entered")) break;
            if (inp.endsWith("%")) {
              fd.youtube_er_pct = reverseFP(inp);
              // Parenthetical: "2.37% (4.5K subs)" → youtube_subscribers
              if (paren) fd.youtube_subscribers = parenFK(paren);
            } else {
              fd.youtube_subscribers = reverseFK(inp);
            }
          }
          else if (name.includes("discord")) {
            // "Discord Bonus — +0.00" — "—" means 0/not entered; don't skip
            if (inp && inp !== "—") fd.discord_members = reverseFK(inp);
            // If inp === "—", leave discord_members as "" (not entered)
          }
          break;

        // ── P3: E-Commerce ───────────────────────────────────────────────────────
        case 2:
          if (!inp || inp === "—") break;
          if (name.includes("store qual"))
            fd.store_quality       = parseSlash(inp);
          else if (name.includes("merch range"))
            fd.merch_range         = parseSlash(inp);
          else if (name.includes("price"))
            fd.price_point_highest = reverseDollar(inp);
          else if (name.includes("d2c"))
            fd.d2c_level           = parseSlash(inp);
          break;

        // ── P4: Growth ───────────────────────────────────────────────────────────
        case 3:
          if (!inp || inp === "—") break;
          if (name.includes("spotify yoy")) {
            fd.spotify_yoy_pct = reverseFP(inp);
            // Parenthetical: "9.7% (1.4M)" → spotify_monthly_listeners
            if (paren) fd.spotify_monthly_listeners = parenFK(paren);
          }
          else if (name.includes("venue prog"))
            fd.venue_progression = reverseProg(inp);
          else if (name.includes("ig growth")) {
            fd.ig_30day_gain = reverseGain(inp);
            // Parenthetical: "+374 (22K)" → ig_followers (if not already set by P2)
            if (paren && !fd.ig_followers) fd.ig_followers = parenFK(paren);
          }
          else if (name.includes("press"))
            fd.press_score   = parseSlash(inp);
          else if (name.includes("playlist"))
            fd.playlist_score = parseSlash(inp);
          break;
      }
    }
  }

  // ── DEMOGRAPHICS  (Y 178–200 mm) ─────────────────────────────────────────────

  const demoItems = allItems.filter((i) => i.y >= 178 && i.y < 200);

  for (const band of groupByY(demoItems, 2.5)) {
    // Age row: "Age:  13–17  15.0%  18–24  42.0% …"
    if (band.some((i) => i.str === "Age:")) {
      const label = band.find((i) => i.str === "Age:")!;
      const rest  = band.filter((i) => i.x > label.x).sort((a, b) => a.x - b.x);
      const AGE_KEYS: Array<keyof EvalFormData> = [
        "d_13_17_m", "d_18_24_m", "d_25_34_m", "d_35_44_m", "d_45_64_m", "d_65_m",
      ];
      let ki = 0;
      for (let i = 0; i + 1 < rest.length && ki < AGE_KEYS.length; i++) {
        const cur  = rest[i].str;
        const next = rest[i + 1].str;
        if ((cur.includes("–") || cur.includes("-") || cur.includes("+")) && next.endsWith("%")) {
          const pct = reverseFP(next);
          if (pct) (fd[AGE_KEYS[ki]] as string) = pct;
          ki++;
          i++; // skip the consumed % token
        }
      }
    }

    // Ethnicity row: "Ethnicity:  White  55.0%  Hispanic  20.0% …"
    if (band.some((i) => i.str === "Ethnicity:")) {
      const label = band.find((i) => i.str === "Ethnicity:")!;
      const rest  = band.filter((i) => i.x > label.x).sort((a, b) => a.x - b.x);
      for (let i = 0; i + 1 < rest.length; i++) {
        const grp = rest[i].str.toLowerCase();
        const val = rest[i + 1].str;
        if (val.endsWith("%")) {
          const pct = reverseFP(val);
          if      (grp.includes("white"))                          fd.eth_white    = pct;
          else if (grp.includes("hisp"))                           fd.eth_hispanic = pct;
          else if (grp.includes("afr") || grp.includes("black"))   fd.eth_aa       = pct;
          else if (grp.includes("asian"))                          fd.eth_asian    = pct;
          i++; // skip value token
        }
      }
    }
  }

  // ── Validation warnings ───────────────────────────────────────────────────────

  if (!fd.artist_name)
    warnings.push("Artist name could not be extracted — please enter manually");
  if (!fd.genre)
    warnings.push("Genre could not be extracted — please enter manually");
  if (!fd.spotify_monthly_listeners)
    warnings.push(
      "Spotify monthly listeners not in PDF — enter manually for accurate FCR & YoY scoring"
    );
  if (!fd.num_dates)
    warnings.push("Number of tour dates not in PDF — enter manually if needed");

  return { fd, pdfScore, pdfTier, warnings };
}
