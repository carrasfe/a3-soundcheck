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

  const { data: row, error } = await supabase
    .from("evaluations")
    .select("id, artist_name, genre, results, inputs, created_at, evaluator_id, status")
    .eq("id", params.id)
    .single();

  if (error || !row || row.status !== "complete") {
    notFound();
  }

  const { data: evaluatorProfile } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", row.evaluator_id)
    .single();

  const evaluation: EvaluationRecord = {
    id: row.id,
    artist_name: row.artist_name,
    genre: row.genre,
    results: row.results as ScoringResult,
    inputs: row.inputs as EvalFormData,
    created_at: row.created_at,
    evaluator_name:
      evaluatorProfile?.full_name || evaluatorProfile?.email || "Unknown",
  };

  return (
    <EvaluationDetail
      evaluation={evaluation}
      isAdmin={isAdmin}
    />
  );
}
