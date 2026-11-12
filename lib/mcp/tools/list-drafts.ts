import { createAdminClient } from "@/lib/supabase/admin";
import { HttpError } from "@/lib/mcp/http";
import { appUrl, fetchAll, getFirstAdminId } from "@/lib/mcp/data";

type DraftDbRow = {
  id: string;
  artist_id: string | null;
  evaluated_by: string | null;
  evaluated_at: string | null;
  created_at?: string | null;
  inputs: Record<string, unknown> | null;
  artists: { name: string; genre: string | null } | { name: string; genre: string | null }[] | null;
};

const BASE_COLS = "id, artist_id, evaluated_by, evaluated_at, inputs, artists(name, genre)";

// GET /api/mcp/list-drafts?filter=all|mine
// "mine" = drafts owned by the API caller. The API authenticates with a shared
// key, not a user, so API-created drafts are owned by the first admin profile
// (see create-draft.ts) — "mine" returns drafts owned by that profile.
export async function listDrafts(params: { filter?: string }, origin: string) {
  const filter = (params.filter || "all").toLowerCase();
  if (filter !== "all" && filter !== "mine") {
    throw new HttpError(400, `Invalid filter "${filter}"`, { allowed: ["all", "mine"] });
  }

  const sb = createAdminClient();
  const ownerId = filter === "mine" ? await getFirstAdminId(sb) : null;

  const load = (cols: string) =>
    fetchAll<DraftDbRow>((from, to) => {
      let q = sb.from("evaluations").select(cols).eq("status", "draft")
        .order("evaluated_at", { ascending: false }).range(from, to);
      if (ownerId) q = q.eq("evaluated_by", ownerId);
      return q as unknown as PromiseLike<{ data: DraftDbRow[] | null; error: unknown }>;
    });

  // created_at may not exist in every schema — fall back to evaluated_at only
  let rows: DraftDbRow[];
  try {
    rows = await load(`${BASE_COLS}, created_at`);
  } catch {
    rows = await load(BASE_COLS);
  }

  const creatorIds = Array.from(new Set(rows.map((r) => r.evaluated_by).filter((x): x is string => !!x)));
  const creators = new Map<string, { name: string; email: string | null }>();
  for (let i = 0; i < creatorIds.length; i += 150) {
    const { data, error } = await sb.from("profiles").select("id, full_name, email")
      .in("id", creatorIds.slice(i, i + 150));
    if (error) throw error;
    for (const p of data ?? []) creators.set(p.id, { name: p.full_name || p.email || p.id, email: p.email ?? null });
  }

  const base = appUrl(origin);
  const drafts = rows.map((r) => {
    const artist = Array.isArray(r.artists) ? r.artists[0] : r.artists;
    const creator = r.evaluated_by ? creators.get(r.evaluated_by) : undefined;
    return {
      draft_id: r.id,
      artist_id: r.artist_id,
      artist_name: artist?.name ?? (r.inputs?.artist_name as string | undefined) ?? null,
      genre: artist?.genre ?? (r.inputs?.genre as string | undefined) ?? null,
      created_by: creator?.name ?? r.evaluated_by ?? "Unknown",
      created_by_email: creator?.email ?? null,
      created_at: r.created_at ?? r.evaluated_at,
      last_saved_at: r.evaluated_at,
      edit_url: `${base}/evaluations/new?edit=${r.id}`,
    };
  });

  return { filter, total: drafts.length, drafts };
}
