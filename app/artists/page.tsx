import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ArtistsClient from "@/components/ArtistsClient";

export type ArtistRow = {
  id: string;
  name: string;
  genre: string | null;
  merch_provider: string | null;
  management_company: string | null;
  latest_score: number | null;
  latest_tier: string | null;
  latest_revenue_tier: string | null;
  last_evaluated: string | null;
  eval_count: number;
};

export default async function ArtistsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  let artists: ArtistRow[] = [];
  let dbError: string | null = null;

  try {
    const { data: artistRows, error: artistsError } = await supabase
      .from("artists")
      .select("id, name, genre, merch_provider:current_merch_provider, management_company")
      .order("name");

    if (artistsError) throw artistsError;

    if (artistRows && artistRows.length > 0) {
      const artistIds = artistRows.map((a) => a.id);

      // Fetch all completed evaluations for these artists in one query
      // Actual schema uses: score_total, tier, evaluated_at (not results jsonb or created_at)
      const { data: evals } = await supabase
        .from("evaluations")
        .select("id, artist_id, score_total, tier, evaluated_at")
        .eq("status", "complete")
        .in("artist_id", artistIds)
        .order("evaluated_at", { ascending: false });

      // Build: latest eval per artist + count per artist
      const latestEvalMap = new Map<string, { score_total: number | null; tier: string | null; evaluated_at: string }>();
      const countMap = new Map<string, number>();

      for (const ev of evals ?? []) {
        if (!latestEvalMap.has(ev.artist_id)) {
          latestEvalMap.set(ev.artist_id, {
            score_total: ev.score_total,
            tier: ev.tier,
            evaluated_at: ev.evaluated_at,
          });
        }
        countMap.set(ev.artist_id, (countMap.get(ev.artist_id) ?? 0) + 1);
      }

      artists = artistRows.map((a) => {
        const latest = latestEvalMap.get(a.id);
        return {
          id: a.id,
          name: a.name,
          genre: a.genre,
          merch_provider: a.merch_provider,
          management_company: a.management_company,
          latest_score: latest?.score_total ?? null,
          latest_tier: latest?.tier ?? null,
          latest_revenue_tier: null, // revenue_tier not in current DB schema
          last_evaluated: latest?.evaluated_at ?? null,
          eval_count: countMap.get(a.id) ?? 0,
        };
      });
    }
  } catch (err) {
    console.error("[ArtistsPage] Supabase error:", JSON.stringify(err, null, 2));
    if (err && typeof err === "object") {
      const e = err as { message?: string; details?: string; hint?: string; code?: string };
      dbError = [e.message, e.details, e.hint ? `(hint: ${e.hint})` : null, e.code ? `[${e.code}]` : null]
        .filter(Boolean).join(" — ");
    } else {
      dbError = String(err);
    }
  }

  return <ArtistsClient artists={artists} dbError={dbError} />;
}
