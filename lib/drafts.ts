import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Delete drafts that were superseded by a completed evaluation for the same
 * artist — i.e. a complete evaluation exists whose evaluated_at is at or after
 * the draft's evaluated_at (drafts bump evaluated_at on every save).
 *
 * A draft that is NEWER than the artist's latest completed evaluation is a
 * genuine re-evaluation in progress (e.g. created via the MCP create_draft
 * tool for an already-scored artist) and is kept.
 *
 * Must be called with the service-role client so it sees every user's drafts.
 * Returns the number of drafts deleted.
 */
export async function cleanupSupersededDrafts(sb: SupabaseClient): Promise<number> {
  const { data: drafts, error: draftErr } = await sb
    .from("evaluations")
    .select("id, artist_id, evaluated_at")
    .eq("status", "draft")
    .not("artist_id", "is", null);
  if (draftErr) throw draftErr;
  if (!drafts || drafts.length === 0) return 0;

  const artistIds = Array.from(new Set(drafts.map((d) => d.artist_id as string)));
  const latestComplete = new Map<string, number>();
  for (let i = 0; i < artistIds.length; i += 150) {
    const { data: completes, error } = await sb
      .from("evaluations")
      .select("artist_id, evaluated_at")
      .eq("status", "complete")
      .in("artist_id", artistIds.slice(i, i + 150));
    if (error) throw error;
    for (const c of completes ?? []) {
      const t = c.evaluated_at ? new Date(c.evaluated_at).getTime() : 0;
      if (t > (latestComplete.get(c.artist_id) ?? -Infinity)) latestComplete.set(c.artist_id, t);
    }
  }

  const staleIds = drafts
    .filter((d) => {
      const completedAt = latestComplete.get(d.artist_id as string);
      if (completedAt === undefined) return false;
      const draftAt = d.evaluated_at ? new Date(d.evaluated_at).getTime() : 0;
      return completedAt >= draftAt;
    })
    .map((d) => d.id as string);

  for (let i = 0; i < staleIds.length; i += 150) {
    const { error } = await sb
      .from("evaluations")
      .delete()
      .in("id", staleIds.slice(i, i + 150))
      .eq("status", "draft");
    if (error) throw error;
  }
  return staleIds.length;
}

/**
 * Delete every draft for an artist (called right after an evaluation for that
 * artist is saved as complete). `keepId` protects the just-saved row.
 */
export async function deleteDraftsForArtist(sb: SupabaseClient, artistId: string, keepId?: string) {
  let q = sb.from("evaluations").delete().eq("status", "draft").eq("artist_id", artistId);
  if (keepId) q = q.neq("id", keepId);
  const { error } = await q;
  if (error) throw error;
}
