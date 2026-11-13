"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { tryCreateAdminClient } from "@/lib/supabase/admin";
import { escapeLike } from "@/lib/mcp/data";
import { createDraft } from "@/lib/mcp/tools/create-draft";
import { VALID_GENRES } from "@/app/evaluations/new/types";

const MAX_RESEARCH_BATCH = 10; // keep in sync with QuickResearchModal

export type ResearchDraftResult = {
  artist_name: string;
  genre: string;
  draft_id: string | null;
  /** "created" = new draft; "existing" = artist already had a draft, reused it */
  status: "created" | "existing" | "error";
  error?: string;
};

/**
 * Create (or reuse) a draft for each artist in a Quick Research batch, so the
 * Chrome / Artist Scores research can push data into it with update_draft.
 */
export async function createResearchDrafts(
  artists: { name: string; genre: string }[]
): Promise<{ results: ResearchDraftResult[]; error: string | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { results: [], error: "Not authenticated" };

  const admin = tryCreateAdminClient();
  if (!admin) return { results: [], error: "Server is missing SUPABASE_SERVICE_ROLE_KEY" };

  const cleaned = artists
    .map((a) => ({ name: a.name.trim(), genre: a.genre }))
    .filter((a) => a.name);
  if (cleaned.length === 0) return { results: [], error: "Add at least one artist" };
  if (cleaned.length > MAX_RESEARCH_BATCH) return { results: [], error: `Max ${MAX_RESEARCH_BATCH} artists per batch` };

  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host") ?? "localhost:3000"}`;

  const results: ResearchDraftResult[] = [];
  for (const a of cleaned) {
    const genre = VALID_GENRES.find((g) => g === a.genre) ?? "Rock / Alt / Indie";
    try {
      // Reuse an existing draft for this artist rather than creating a duplicate
      const { data: match } = await admin.from("artists").select("id")
        .ilike("name", escapeLike(a.name)).limit(1);
      if (match?.[0]) {
        const { data: existing } = await admin.from("evaluations").select("id")
          .eq("artist_id", match[0].id).eq("status", "draft")
          .order("evaluated_at", { ascending: false }).limit(1);
        if (existing?.[0]) {
          results.push({ artist_name: a.name, genre, draft_id: existing[0].id, status: "existing" });
          continue;
        }
      }
      const created = await createDraft(
        { artist_name: a.name, genre },
        origin,
        { evaluatedBy: user.id, source: "quick_research" }
      );
      results.push({ artist_name: a.name, genre, draft_id: created.draft_id, status: "created" });
    } catch (err) {
      const message = err && typeof err === "object" && "message" in err ? String(err.message) : String(err);
      console.error("[createResearchDrafts] Failed for", a.name, err);
      results.push({ artist_name: a.name, genre, draft_id: null, status: "error", error: message });
    }
  }

  revalidatePath("/");
  return { results, error: null };
}
