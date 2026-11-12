import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { mcpHandler, preflight, HttpError } from "@/lib/mcp/http";
import { ARTIST_COLS, appUrl, fetchAll, getLatestEvals, type ArtistRow } from "@/lib/mcp/data";

export const dynamic = "force-dynamic";

const TIER_FILTERS: Record<string, string> = {
  priority: "Priority", active: "Active", watch: "Watch", pass: "Pass",
};

// GET /api/mcp/list-artists?filter=all|a3clients|priority|active|watch|pass&limit=N
// Tier filters match the tier of each artist's most recent complete evaluation.
export const GET = mcpHandler(async (req: NextRequest) => {
  const filter = (req.nextUrl.searchParams.get("filter") ?? "all").toLowerCase();
  if (filter !== "all" && filter !== "a3clients" && !TIER_FILTERS[filter]) {
    throw new HttpError(400, `Invalid filter "${filter}"`, {
      allowed: ["all", "a3clients", ...Object.keys(TIER_FILTERS)],
    });
  }
  const limitParam = parseInt(req.nextUrl.searchParams.get("limit") ?? "", 10);
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : 500;

  const sb = createAdminClient();
  const [artists, latest] = await Promise.all([
    fetchAll<ArtistRow>((from, to) => {
      let q = sb.from("artists").select(ARTIST_COLS).order("name").range(from, to);
      if (filter === "a3clients") q = q.eq("is_a3_client", true);
      return q;
    }),
    getLatestEvals(sb),
  ]);

  const base = appUrl(req.nextUrl.origin);
  const tier = TIER_FILTERS[filter];
  const rows = artists
    .map((a) => {
      const ev = latest.get(a.id);
      return {
        id: a.id,
        name: a.name,
        genre: a.genre,
        latest_score: ev?.score ?? null,
        latest_tier: ev?.tier ?? null,
        latest_evaluated_at: ev?.evaluated_at ?? null,
        is_a3_client: !!a.is_a3_client,
        merch_provider: a.current_merch_provider,
        url: `${base}/artists/${a.id}`,
      };
    })
    .filter((r) => !tier || r.latest_tier === tier)
    .sort((a, b) => (b.latest_score ?? -1) - (a.latest_score ?? -1) || a.name.localeCompare(b.name));

  return { filter, total: rows.length, artists: rows.slice(0, limit) };
});

export const OPTIONS = preflight;
