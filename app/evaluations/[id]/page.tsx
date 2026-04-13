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

  // Actual schema: score_total, score_p1-p4, tier, action, evaluated_at, evaluated_by,
  // pillar_weights — joined to artists(name, genre) via artist_id FK
  const { data: row, error } = await supabase
    .from("evaluations")
    .select("id, score_total, score_p1, score_p2, score_p3, score_p4, tier, action, evaluated_at, evaluated_by, pillar_weights, status, artists(name, genre)")
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
  const pw = row.pillar_weights as { p1: number; p2: number; p3: number; p4: number } | null;

  // Reconstruct a partial ScoringResult from the denormalized DB columns.
  // revenue_tier, age_bracket, touring_bracket, and sub_scores are not stored yet.
  const partialResult = ({
    genre: "" as any,
    genre_group: "" as any,
    total_score: row.score_total ?? 0,
    tier_label: (row.tier ?? "Pass") as ScoringResult["tier_label"],
    action: row.action ?? "",
    revenue_tier: null as unknown as ScoringResult["revenue_tier"],
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
    results: partialResult,
    inputs: {} as EvalFormData, // inputs not stored in current DB schema
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
