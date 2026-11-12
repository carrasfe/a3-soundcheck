import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { mcpHandler, preflight, HttpError } from "@/lib/mcp/http";
import {
  ARTIST_COLS, appUrl, escapeLike, getProfileNames, summarizeArtists, type ArtistRow,
} from "@/lib/mcp/data";

export const dynamic = "force-dynamic";

const AGE_BRACKETS = ["13_17", "18_24", "25_34", "35_44", "45_64", "65"] as const;
const ETHNICITIES = { white: "eth_white", african_american: "eth_aa", hispanic: "eth_hispanic", asian: "eth_asian" };

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

function demographicsFrom(inputs: Record<string, unknown> | null) {
  if (!inputs) return null;
  const age_gender = Object.fromEntries(AGE_BRACKETS.map((b) => [
    b === "65" ? "65+" : b.replace("_", "-"),
    { male_pct: num(inputs[`d_${b}_m`]), female_pct: num(inputs[`d_${b}_f`]) },
  ]));
  const ethnicity = Object.fromEntries(
    Object.entries(ETHNICITIES).map(([label, key]) => [label, num(inputs[key])])
  );
  return { age_gender, ethnicity };
}

// GET /api/mcp/get-evaluation?artist_id=<uuid>  or  ?artist_name=<name>
// Returns the most recent complete evaluation for the artist.
export const GET = mcpHandler(async (req: NextRequest) => {
  const params = req.nextUrl.searchParams;
  const artistId = params.get("artist_id")?.trim();
  const artistName = params.get("artist_name")?.trim();
  if (!artistId && !artistName) throw new HttpError(400, "Provide artist_id or artist_name");

  const sb = createAdminClient();

  // ── Resolve the artist ──
  let artist: ArtistRow | null = null;
  if (artistId) {
    const { data, error } = await sb.from("artists").select(ARTIST_COLS).eq("id", artistId).maybeSingle();
    if (error) throw error;
    artist = data as ArtistRow | null;
  } else {
    const exact = await sb.from("artists").select(ARTIST_COLS).ilike("name", escapeLike(artistName!)).limit(1);
    if (exact.error) throw exact.error;
    artist = (exact.data?.[0] as ArtistRow | undefined) ?? null;
    if (!artist) {
      const partial = await sb.from("artists").select(ARTIST_COLS)
        .ilike("name", `%${escapeLike(artistName!)}%`).order("name").limit(10);
      if (partial.error) throw partial.error;
      const matches = (partial.data ?? []) as ArtistRow[];
      if (matches.length > 1) {
        throw new HttpError(409, `Multiple artists match "${artistName}" — retry with artist_id`, {
          candidates: matches.map((m) => ({ id: m.id, name: m.name, genre: m.genre })),
        });
      }
      artist = matches[0] ?? null;
    }
  }
  if (!artist) throw new HttpError(404, `Artist not found: ${artistId ?? artistName}`);

  // ── Latest complete evaluation ──
  const { data: evals, error: evalErr } = await sb.from("evaluations")
    .select("*").eq("artist_id", artist.id).eq("status", "complete")
    .order("evaluated_at", { ascending: false }).limit(1);
  if (evalErr) throw evalErr;
  const ev = evals?.[0];
  if (!ev) throw new HttpError(404, `No complete evaluation found for ${artist.name}`, { artist_id: artist.id });

  const { count: evaluationCount } = await sb.from("evaluations")
    .select("id", { count: "exact", head: true }).eq("artist_id", artist.id).eq("status", "complete");

  const base = appUrl(req.nextUrl.origin);
  const [[summary], profiles] = await Promise.all([
    summarizeArtists(sb, [artist], base),
    getProfileNames(sb, [ev.evaluated_by]),
  ]);

  const inputs = (ev.inputs ?? null) as Record<string, unknown> | null;
  const results = (ev.results ?? null) as Record<string, any> | null;
  const pillar = (k: "p1" | "p2" | "p3" | "p4") => {
    const p = results?.[k];
    return {
      weighted_score: p?.weighted_score ?? ev[`score_${k}`] ?? null,
      final_score: p?.final_score ?? ev[`score_${k}`] ?? null,
      bonus: p?.bonus ?? null,
      weight: results?.pillar_weights?.[k] ?? ev.pillar_weights?.[k] ?? null,
      sub_scores: p?.sub_scores ?? null,
      sub_weights: p?.sub_weights ?? null,
    };
  };
  const evaluator = profiles.get(ev.evaluated_by);

  return {
    artist: summary,
    evaluation: {
      id: ev.id,
      evaluated_at: ev.evaluated_at,
      evaluated_by: evaluator ? { id: ev.evaluated_by, ...evaluator } : { id: ev.evaluated_by },
      total_score: results?.total_score ?? ev.score_total ?? null,
      tier: results?.tier_label ?? ev.tier ?? null,
      action: results?.action ?? ev.action ?? null,
      revenue_tier: results?.revenue_tier ?? ev.revenue_tier ?? null,
      weight_profile: ev.weight_profile ?? null,
      pillar_weights: results?.pillar_weights ?? ev.pillar_weights ?? null,
      pillars: {
        p1_touring: pillar("p1"),
        p2_fan_engagement: pillar("p2"),
        p3_ecommerce: pillar("p3"),
        p4_growth: pillar("p4"),
      },
      demographics: demographicsFrom(inputs),
      management_entries: inputs?.management_entries ?? [],
      booking_entries: inputs?.booking_entries ?? [],
      inputs,
      results,
      url: `${base}/evaluations/${ev.id}`,
    },
    complete_evaluation_count: evaluationCount ?? 1,
  };
});

export const OPTIONS = preflight;
