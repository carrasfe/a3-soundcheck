import { createAdminClient } from "@/lib/supabase/admin";
import { HttpError } from "@/lib/mcp/http";
import { appUrl, escapeLike, getFirstAdminId } from "@/lib/mcp/data";
import { INITIAL_FORM_DATA, VALID_GENRES, getAgeProfileLabel, type EvalFormData } from "@/app/evaluations/new/types";

/**
 * Coerce caller-supplied values onto the wizard's form shape. The wizard keeps
 * every field as a string (or boolean/array for a few), so numbers become
 * strings and unknown keys are reported back rather than stored.
 */
function buildFormData(fields: Record<string, unknown>) {
  const fd: Record<string, unknown> = { ...INITIAL_FORM_DATA };
  const applied: string[] = [];
  const ignored: string[] = [];
  for (const [key, value] of Object.entries(fields)) {
    if (key === "artist_name" || key === "name" || key === "genre" || key === "inputs") continue;
    if (!(key in INITIAL_FORM_DATA)) { ignored.push(key); continue; }
    if (value === null || value === undefined) continue;
    const initial = (INITIAL_FORM_DATA as unknown as Record<string, unknown>)[key];
    if (Array.isArray(initial)) {
      if (!Array.isArray(value)) { ignored.push(key); continue; }
      fd[key] = value;
    } else if (typeof initial === "boolean") {
      fd[key] = value === true || value === "true";
    } else if (typeof value === "string" || typeof value === "number") {
      fd[key] = String(value);
    } else {
      ignored.push(key);
      continue;
    }
    applied.push(key);
  }
  return { fd, applied, ignored };
}

// POST /api/mcp/create-draft
// Body: { artist_name, genre, ...any wizard input fields }  (fields may also be nested under "inputs")
export async function createDraft(body: Record<string, unknown>, origin: string) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new HttpError(400, "Body must be a JSON object");

  const artistName = String(body.artist_name ?? body.name ?? "").trim();
  if (!artistName) throw new HttpError(400, "artist_name is required");

  const genreRaw = String(body.genre ?? "").trim().toLowerCase();
  const genre = VALID_GENRES.find((g) => g.toLowerCase() === genreRaw);
  if (!genre) throw new HttpError(400, `Invalid or missing genre "${body.genre ?? ""}"`, { allowed_genres: VALID_GENRES });

  const nested = body.inputs && typeof body.inputs === "object" && !Array.isArray(body.inputs)
    ? (body.inputs as Record<string, unknown>) : {};
  const { fd, applied, ignored } = buildFormData({ ...nested, ...body });
  fd.artist_name = artistName;
  fd.genre = genre;
  const formData = fd as unknown as EvalFormData;

  const sb = createAdminClient();
  const evaluatedBy = await getFirstAdminId(sb);

  // ── Match or create the artist ──
  // Existing artists only get blank fields filled — a draft shouldn't
  // overwrite data from completed evaluations.
  let artistCreated = false;
  const { data: existing, error: findErr } = await sb.from("artists")
    .select("id, genre, current_merch_provider").ilike("name", escapeLike(artistName)).limit(1);
  if (findErr) throw findErr;

  let artistId: string;
  if (existing?.[0]) {
    artistId = existing[0].id;
    const fill: Record<string, string> = {};
    if (!existing[0].genre) fill.genre = genre;
    if (!existing[0].current_merch_provider && formData.merch_provider) fill.current_merch_provider = formData.merch_provider;
    if (Object.keys(fill).length) {
      await sb.from("artists").update({ ...fill, updated_at: new Date().toISOString() }).eq("id", artistId);
    }
  } else {
    const { data: inserted, error: insErr } = await sb.from("artists").insert({
      name: artistName,
      genre,
      management_company: formData.management_company || null,
      manager_names: formData.manager_names || null,
      booking_agent: formData.booking_agent || null,
      current_merch_provider: formData.merch_provider || null,
    }).select("id").single();
    if (insErr) {
      console.error("[create_draft] Artist insert failed:", JSON.stringify({ artistName, insErr }));
      throw insErr;
    }
    artistId = inserted.id;
    artistCreated = true;
  }

  // ── Insert the draft ──
  const { data: draft, error: draftErr } = await sb.from("evaluations").insert({
    artist_id: artistId,
    evaluated_by: evaluatedBy,
    status: "draft",
    evaluated_at: new Date().toISOString(),
    weight_profile: getAgeProfileLabel(formData),
    inputs: formData as unknown as Record<string, unknown>,
    results: null,
  }).select("id").single();
  if (draftErr) {
    console.error("[create_draft] Draft insert failed:", JSON.stringify({ artistName, artistId, evaluatedBy, draftErr }));
    throw draftErr;
  }
  console.log("[create_draft] Draft created:", JSON.stringify({
    draft_id: draft.id, artist_id: artistId, artist_name: artistName, artist_created: artistCreated,
    evaluated_by: evaluatedBy, fields_applied: applied.length, fields_ignored: ignored,
  }));

  await sb.from("audit_log").insert({
    event_type: "mcp_draft_created",
    user_id: evaluatedBy,
    target_id: draft.id,
    details: { artist_name: artistName, genre, source: "mcp_api", fields: applied },
  }).then(null, () => {});

  return {
    draft_id: draft.id,
    artist_id: artistId,
    artist_created: artistCreated,
    status: "draft",
    edit_url: `${appUrl(origin)}/evaluations/new?edit=${draft.id}`,
    fields_applied: applied,
    fields_ignored: ignored,
  };
}
