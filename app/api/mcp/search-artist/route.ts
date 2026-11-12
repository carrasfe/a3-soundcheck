import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { mcpHandler, preflight, HttpError } from "@/lib/mcp/http";
import { ARTIST_COLS, appUrl, escapeLike, summarizeArtists, type ArtistRow } from "@/lib/mcp/data";

export const dynamic = "force-dynamic";

// GET /api/mcp/search-artist?q=<name>
// Case-insensitive partial match on artists + known_artists (contact rosters).
export const GET = mcpHandler(async (req: NextRequest) => {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) throw new HttpError(400, "Missing required query parameter: q");

  const sb = createAdminClient();
  const pattern = `%${escapeLike(q)}%`;

  const [{ data: artists, error }, { data: known, error: knownErr }] = await Promise.all([
    sb.from("artists").select(ARTIST_COLS).ilike("name", pattern).order("name").limit(25),
    sb.from("known_artists")
      .select("id, name, manager_id, agent_id, management_company_id, agency_id")
      .ilike("name", pattern).order("name").limit(50),
  ]);
  if (error) throw error;
  if (knownErr) throw knownErr;

  const base = appUrl(req.nextUrl.origin);
  const results = await summarizeArtists(sb, (artists ?? []) as ArtistRow[], base);

  // Resolve the managers / agents / companies whose rosters list the matched name
  const knownRows = known ?? [];
  const ids = (k: keyof (typeof knownRows)[number]) =>
    Array.from(new Set(knownRows.map((r) => r[k]).filter(Boolean))) as string[];
  const lookup = async (table: string, cols: string, list: string[]) =>
    list.length ? ((await sb.from(table).select(cols).in("id", list)).data ?? []) as unknown as Record<string, string | null>[] : [];
  const [mgrs, agts] = await Promise.all([
    lookup("managers", "id, name, management_company_id", ids("manager_id")),
    lookup("agents", "id, name, agency_id", ids("agent_id")),
  ]);
  const [comps, agencies] = await Promise.all([
    lookup("management_companies", "id, name", [...ids("management_company_id"), ...mgrs.map((m) => m.management_company_id)].filter(Boolean) as string[]),
    lookup("agencies", "id, name", [...ids("agency_id"), ...agts.map((a) => a.agency_id)].filter(Boolean) as string[]),
  ]);
  const byId = (rows: Record<string, string | null>[]) => new Map(rows.map((r) => [r.id as string, r]));
  const mgrMap = byId(mgrs), agtMap = byId(agts), compMap = byId(comps), agencyMap = byId(agencies);
  const soundcheckIdByName = new Map(results.map((r) => [r.name.toLowerCase(), r.id]));

  const known_artist_matches = knownRows.map((k) => {
    const m = k.manager_id ? mgrMap.get(k.manager_id) : undefined;
    const a = k.agent_id ? agtMap.get(k.agent_id) : undefined;
    const companyId = k.management_company_id ?? m?.management_company_id ?? null;
    const agencyId = k.agency_id ?? a?.agency_id ?? null;
    return {
      name: k.name,
      manager: m ? { id: m.id, name: m.name } : null,
      management_company: companyId ? { id: companyId, name: compMap.get(companyId)?.name ?? null } : null,
      agent: a ? { id: a.id, name: a.name } : null,
      agency: agencyId ? { id: agencyId, name: agencyMap.get(agencyId)?.name ?? null } : null,
      soundcheck_artist_id: soundcheckIdByName.get(k.name.toLowerCase()) ?? null,
    };
  });

  return { query: q, artists: results, known_artist_matches };
});

export const OPTIONS = preflight;
