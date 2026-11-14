import { createAdminClient } from "@/lib/supabase/admin";
import { HttpError } from "@/lib/mcp/http";
import { appUrl, escapeLike } from "@/lib/mcp/data";
import { buildFormData, createDraft } from "@/lib/mcp/tools/create-draft";
import { CONTACT_FIELDS, applyContactEntries, linkContacts, type ContactsSummary } from "@/lib/mcp/contacts";
import { VALID_GENRES, getAgeProfileLabel, type EvalFormData } from "@/app/evaluations/new/types";

type DraftRow = { id: string; artist_id: string | null; inputs: Record<string, unknown> | null };

// POST /api/mcp/update-draft
// Body: { draft_id? , artist_name?, genre?, ...any wizard input fields }  (fields may also be nested under "inputs")
//
// Finds the draft by draft_id, or by artist name (most recently saved draft for
// that artist). Only the fields provided are changed — blank values are skipped
// so existing data is never cleared. If the artist has no draft, one is created.
export async function updateDraft(body: Record<string, unknown>, origin: string) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new HttpError(400, "Body must be a JSON object");

  const draftId = String(body.draft_id ?? "").trim();
  const artistName = String(body.artist_name ?? body.name ?? "").trim();
  if (!draftId && !artistName) throw new HttpError(400, "draft_id or artist_name is required");

  let genre: string | undefined;
  if (body.genre != null && String(body.genre).trim() !== "") {
    const raw = String(body.genre).trim().toLowerCase();
    genre = VALID_GENRES.find((g) => g.toLowerCase() === raw);
    if (!genre) throw new HttpError(400, `Invalid genre "${body.genre}"`, { allowed_genres: VALID_GENRES });
  }

  const sb = createAdminClient();

  // ── Locate the draft ──
  let draft: DraftRow | null = null;
  let artistGenre: string | null = null;

  if (draftId) {
    const { data, error } = await sb.from("evaluations").select("id, artist_id, inputs")
      .eq("id", draftId).eq("status", "draft").maybeSingle();
    if (error) throw error;
    draft = data as DraftRow | null;
    if (!draft && !artistName) throw new HttpError(404, `No draft found with id ${draftId}`);
  }

  if (!draft && artistName) {
    const { data: artists, error: aErr } = await sb.from("artists").select("id, genre")
      .ilike("name", escapeLike(artistName)).limit(1);
    if (aErr) throw aErr;
    const artist = artists?.[0];
    if (artist) {
      artistGenre = artist.genre ?? null;
      const { data, error } = await sb.from("evaluations").select("id, artist_id, inputs")
        .eq("artist_id", artist.id).eq("status", "draft")
        .order("evaluated_at", { ascending: false }).limit(1);
      if (error) throw error;
      draft = (data?.[0] as DraftRow | undefined) ?? null;
    }
  }

  // ── No draft: create one ──
  if (!draft) {
    const createGenre = genre ?? artistGenre ?? undefined;
    if (!createGenre) {
      throw new HttpError(400, `No draft found for "${artistName}" — pass genre to create one`, { allowed_genres: VALID_GENRES });
    }
    const created = await createDraft({ ...body, artist_name: artistName, genre: createGenre }, origin);
    return { ...created, action: "created" };
  }

  // ── Merge only the provided, non-blank fields ──
  const nested = body.inputs && typeof body.inputs === "object" && !Array.isArray(body.inputs)
    ? (body.inputs as Record<string, unknown>) : {};
  const { fd, applied, ignored } = buildFormData({ ...nested, ...body });

  const merged: Record<string, unknown> = { ...(draft.inputs ?? {}) };
  const updated: string[] = [];
  for (const key of applied) {
    const v = fd[key];
    if (typeof v === "string" && v.trim() === "") continue;
    if (Array.isArray(v) && v.length === 0) continue;
    merged[key] = v;
    updated.push(key);
  }
  if (genre) { merged.genre = genre; updated.push("genre"); }

  // ── Contacts: re-link when any contact field was sent. Uses the merged values,
  // so e.g. sending only other_mgmt_artists attaches the roster to the draft's
  // existing managers. Idempotent — safe to repeat.
  let contacts: ContactsSummary | null = null;
  let contactsError: string | null = null;
  if (draft.artist_id && updated.some((k) => (CONTACT_FIELDS as readonly string[]).includes(k))) {
    try {
      let name = typeof merged.artist_name === "string" ? merged.artist_name : artistName;
      if (!name) {
        const { data: a } = await sb.from("artists").select("name").eq("id", draft.artist_id).maybeSingle();
        name = a?.name ?? "";
      }
      const linked = await linkContacts(sb, draft.artist_id, name, merged);
      contacts = linked.summary;
      applyContactEntries(merged, linked.managementEntries, linked.bookingEntries);
    } catch (err) {
      contactsError = err && typeof err === "object" && "message" in err ? String(err.message) : String(err);
      console.error("[update_draft] Contact linking failed:", JSON.stringify({ draftId: draft.id, err }));
    }
  }

  const { error: updErr } = await sb.from("evaluations").update({
    inputs: merged,
    weight_profile: getAgeProfileLabel(merged as unknown as EvalFormData),
    evaluated_at: new Date().toISOString(),
  }).eq("id", draft.id).eq("status", "draft");
  if (updErr) {
    console.error("[update_draft] Update failed:", JSON.stringify({ draftId: draft.id, updErr }));
    throw updErr;
  }

  // Fill blank artist fields only — never overwrite data from completed evaluations
  if (draft.artist_id) {
    const { data: artist } = await sb.from("artists").select("genre, current_merch_provider")
      .eq("id", draft.artist_id).maybeSingle();
    const fill: Record<string, string> = {};
    if (artist && !artist.genre && genre) fill.genre = genre;
    if (artist && !artist.current_merch_provider && typeof merged.merch_provider === "string" && merged.merch_provider)
      fill.current_merch_provider = merged.merch_provider;
    if (Object.keys(fill).length) {
      await sb.from("artists").update({ ...fill, updated_at: new Date().toISOString() }).eq("id", draft.artist_id);
    }
  }

  console.log("[update_draft] Draft updated:", JSON.stringify({ draft_id: draft.id, fields_updated: updated.length }));

  return {
    action: "updated",
    draft_id: draft.id,
    artist_id: draft.artist_id,
    status: "draft",
    edit_url: `${appUrl(origin)}/evaluations/new?edit=${draft.id}`,
    fields_updated: updated,
    fields_ignored: ignored,
    contacts,
    ...(contactsError ? { contacts_error: contactsError } : {}),
  };
}
