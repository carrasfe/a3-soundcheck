import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import EvaluationDetail from "./EvaluationDetail";
import type { ScoringResult } from "@/lib/scoring-engine";
import type { EvalFormData } from "@/app/evaluations/new/types";

export type EvaluationRecord = {
  id: string;
  artist_name: string;
  genre: string | null;
  results: ScoringResult;
  inputs: EvalFormData;
  created_at: string;
  evaluator_name: string;
};

export default async function EvaluationDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const isAdmin = profile?.role === "admin";

  // Select full JSONB blobs (results, inputs) for complete breakdown display,
  // plus denormalized columns as fallback for older rows without JSONB data.
  const { data: row, error } = await supabase
    .from("evaluations")
    .select("id, results, inputs, score_total, score_p1, score_p2, score_p3, score_p4, tier, action, revenue_tier, evaluated_at, evaluated_by, pillar_weights, status, artists(name, genre)")
    .eq("id", params.id)
    .single();

  if (error || !row || row.status !== "complete") {
    notFound();
  }

  const { data: evaluatorProfile } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", row.evaluated_by)
    .single();

  const artist = row.artists as unknown as { name: string; genre: string | null } | null;

  // Prefer the stored full ScoringResult JSONB; fall back to partial reconstruction
  // from denormalized columns for evaluations saved before the results column was added.
  const storedResult = row.results as ScoringResult | null;
  const pw = row.pillar_weights as { p1: number; p2: number; p3: number; p4: number } | null;

  const finalResult: ScoringResult = storedResult ?? ({
    genre: "" as any,
    genre_group: "" as any,
    total_score: row.score_total ?? 0,
    tier_label: (row.tier ?? "Pass") as ScoringResult["tier_label"],
    action: row.action ?? "",
    revenue_tier: (row.revenue_tier ?? null) as unknown as ScoringResult["revenue_tier"],
    pillar_weights: pw ?? { p1: 0, p2: 0, p3: 0, p4: 0 },
    age_bracket: 0,
    touring_bracket: 0,
    p1: { sub_scores: {}, weighted_score: row.score_p1 ?? 0, final_score: row.score_p1 ?? 0 },
    p2: { sub_scores: {}, weighted_score: row.score_p2 ?? 0, final_score: row.score_p2 ?? 0, sub_weights: {}, tiktok_age_adjusted_weight: 0, youtube_excluded: false },
    p3: { sub_scores: {}, weighted_score: row.score_p3 ?? 0, final_score: row.score_p3 ?? 0 },
    p4: { sub_scores: {}, weighted_score: row.score_p4 ?? 0, final_score: row.score_p4 ?? 0 },
  } as ScoringResult);

  const evaluation: EvaluationRecord = {
    id: row.id,
    artist_name: artist?.name ?? "",
    genre: artist?.genre ?? null,
    results: finalResult,
    inputs: (row.inputs as EvalFormData | null) ?? ({} as EvalFormData),
    created_at: row.evaluated_at,
    evaluator_name:
      evaluatorProfile?.full_name || evaluatorProfile?.email || row.evaluated_by || "Unknown",
  };

  return (
    <EvaluationDetail
      evaluation={evaluation}
      isAdmin={isAdmin}
    />
  );
}
