import { createAdminClient } from "@/lib/supabase/admin";
import { HttpError } from "@/lib/mcp/http";
import { appUrl, escapeLike } from "@/lib/mcp/data";

type DraftRow = {
  id: string;
  artist_id: string | null;
  status: string;
  evaluated_by: string | null;
  evaluated_at: string | null;
  created_at?: string | null;
  weight_profile: string | null;
  inputs: Record<string, unknown> | null;
  artists: { name: string; genre: string | null } | { name: string; genre: string | null }[] | null;
};

const BASE_COLS = "id, artist_id, status, evaluated_by, evaluated_at, weight_profile, inputs, artists(name, genre)";

const isBlank = (v: unknown) =>
  v === null || v === undefined || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && v.length === 0);

// GET /api/mcp/get-draft?draft_id=… | ?artist_name=…
// Read-only. By artist name, returns that artist's most recently saved draft.
export async function getDraft(params: { draft_id?: string; artist_name?: string }, origin: string) {
  const draftId = (params.draft_id ?? "").trim();
  const artistName = (params.artist_name ?? "").trim();
  if (!draftId && !artistName) throw new HttpError(400, "draft_id or artist_name is required");

  const sb = createAdminClient();

  // created_at may not exist in every schema — fall back to evaluated_at only
  const query = async (apply: (cols: string) => PromiseLike<{ data: unknown; error: unknown }>) => {
    const first = await apply(`${BASE_COLS}, created_at`);
    return first.error ? apply(BASE_COLS) : first;
  };

  let row: DraftRow | null = null;
  if (draftId) {
    const { data, error } = await query((cols) =>
      sb.from("evaluations").select(cols).eq("id", draftId).eq("status", "draft").maybeSingle());
    if (error) throw error;
    row = data as DraftRow | null;
    if (!row) throw new HttpError(404, `No draft found with id ${draftId}`);
  } else {
    const { data: artists, error: aErr } = await sb.from("artists").select("id, name")
      .ilike("name", escapeLike(artistName)).limit(1);
    if (aErr) throw aErr;
    const artist = artists?.[0];
    if (!artist) throw new HttpError(404, `No artist named "${artistName}"`);
    const { data, error } = await query((cols) =>
      sb.from("evaluations").select(cols).eq("artist_id", artist.id).eq("status", "draft")
        .order("evaluated_at", { ascending: false }).limit(1));
    if (error) throw error;
    row = ((data as DraftRow[] | null) ?? [])[0] ?? null;
    if (!row) throw new HttpError(404, `${artist.name} has no draft evaluation`);
  }

  let createdBy: { name: string; email: string | null } | null = null;
  if (row.evaluated_by) {
    const { data: p } = await sb.from("profiles").select("full_name, email").eq("id", row.evaluated_by).maybeSingle();
    createdBy = p ? { name: p.full_name || p.email || row.evaluated_by, email: p.email ?? null } : null;
  }

  const artist = Array.isArray(row.artists) ? row.artists[0] : row.artists;
  const inputs = row.inputs ?? {};
  const keys = Object.keys(inputs);

  return {
    draft_id: row.id,
    artist_id: row.artist_id,
    artist_name: artist?.name ?? (inputs.artist_name as string | undefined) ?? null,
    genre: (inputs.genre as string | undefined) || artist?.genre || null,
    status: row.status,
    created_by: createdBy?.name ?? row.evaluated_by ?? "Unknown",
    created_by_email: createdBy?.email ?? null,
    created_at: row.created_at ?? row.evaluated_at,
    last_saved_at: row.evaluated_at,
    weight_profile: row.weight_profile,
    edit_url: `${appUrl(origin)}/evaluations/new?edit=${row.id}`,
    filled_fields: keys.filter((k) => !isBlank(inputs[k])),
    blank_fields: keys.filter((k) => isBlank(inputs[k])),
    inputs,
  };
}
