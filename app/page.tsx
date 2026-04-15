import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DashboardClient from "@/components/DashboardClient";
import type { ScoringResult } from "@/lib/scoring-engine";

export type EvaluationRow = {
  id: string;
  artist_name: string;
  genre: string | null;
  results: ScoringResult | null;
  inputs: Record<string, unknown> | null;
  created_at: string;
  evaluator_name: string;
};

export type DraftRow = {
  id: string;
  artist_name: string;
  updated_at: string;
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const isAdmin = profile?.role === "admin";

  let evaluations: EvaluationRow[] = [];
  let drafts: DraftRow[] = [];
  let dbError: string | null = null;

  try {
    // Include results JSONB for accurate weight profile, revenue tier, and sub-scores.
    // Denormalized columns (score_total, tier, etc.) remain as fallback.
    const { data: evals, error: evalsError } = await supabase
      .from("evaluations")
      .select("id, results, score_total, score_p1, score_p2, score_p3, score_p4, tier, action, revenue_tier, evaluated_at, evaluated_by, pillar_weights, artists(name, genre)")
      .eq("status", "complete")
      .order("evaluated_at", { ascending: false });

    if (evalsError) throw evalsError;

    if (evals && evals.length > 0) {
      // Try to resolve evaluator names via profiles (evaluated_by may be a UUID)
      const evaluatorRefs = Array.from(new Set(evals.map((e) => e.evaluated_by).filter(Boolean)));
      const profileMap = new Map<string, string>();
      if (evaluatorRefs.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", evaluatorRefs);
        (profiles ?? []).forEach((p) => profileMap.set(p.id, p.full_name || p.email || p.id));
      }

      evaluations = evals.map((ev) => {
        const artist = ev.artists as unknown as { name: string; genre: string | null } | null;
        const pw = ev.pillar_weights as { p1: number; p2: number; p3: number; p4: number } | null;

        // Prefer stored full ScoringResult; fall back to partial reconstruction
        // from denormalized columns for older rows without the results JSONB.
        const storedResult = ev.results as unknown as ScoringResult | null;
        const partialResult = ev.score_total != null ? ({
          genre: "" as any,
          genre_group: "" as any,
          total_score: ev.score_total,
          tier_label: ev.tier as ScoringResult["tier_label"],
          action: ev.action ?? "",
          revenue_tier: (ev.revenue_tier ?? null) as unknown as ScoringResult["revenue_tier"],
          pillar_weights: pw ?? { p1: 0, p2: 0, p3: 0, p4: 0 },
          age_bracket: 0,
          touring_bracket: 0,
          p1: { sub_scores: {}, weighted_score: ev.score_p1 ?? 0, final_score: ev.score_p1 ?? 0 },
          p2: { sub_scores: {}, weighted_score: ev.score_p2 ?? 0, final_score: ev.score_p2 ?? 0, sub_weights: {}, tiktok_age_adjusted_weight: 0, youtube_excluded: false },
          p3: { sub_scores: {}, weighted_score: ev.score_p3 ?? 0, final_score: ev.score_p3 ?? 0 },
          p4: { sub_scores: {}, weighted_score: ev.score_p4 ?? 0, final_score: ev.score_p4 ?? 0 },
        } as ScoringResult) : null;
        const finalResult = storedResult ?? partialResult;

        return {
          id: ev.id,
          artist_name: artist?.name ?? "",
          genre: artist?.genre ?? null,
          results: finalResult,
          inputs: null, // inputs not stored in current schema
          created_at: ev.evaluated_at,
          evaluator_name: profileMap.get(ev.evaluated_by) ?? ev.evaluated_by ?? "Unknown",
        };
      });
    }
    // Fetch drafts for the current user (up to 10 most recent)
    const { data: draftRows } = await supabase
      .from("evaluations")
      .select("id, artists(name), updated_at")
      .eq("status", "draft")
      .eq("evaluated_by", user.id)
      .order("updated_at", { ascending: false })
      .limit(10);

    if (draftRows) {
      drafts = draftRows.map((d) => ({
        id: d.id,
        artist_name: (d.artists as unknown as { name: string } | null)?.name ?? "Unnamed draft",
        updated_at: d.updated_at,
      }));
    }
  } catch (err) {
    console.error("[DashboardPage] Supabase error:", JSON.stringify(err, null, 2));
    if (err && typeof err === "object") {
      const e = err as { message?: string; details?: string; hint?: string; code?: string };
      dbError = [e.message, e.details, e.hint ? `(hint: ${e.hint})` : null, e.code ? `[${e.code}]` : null]
        .filter(Boolean).join(" — ");
    } else {
      dbError = String(err);
    }
  }

  return <DashboardClient evaluations={evaluations} drafts={drafts} isAdmin={isAdmin} dbError={dbError} />;
}
