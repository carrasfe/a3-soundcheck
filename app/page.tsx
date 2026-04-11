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

  try {
    const { data: evals } = await supabase
      .from("evaluations")
      .select("id, artist_name, genre, results, inputs, created_at, evaluator_id")
      .eq("status", "complete")
      .order("created_at", { ascending: false });

    if (evals && evals.length > 0) {
      const evaluatorIds = Array.from(new Set(evals.map((e) => e.evaluator_id).filter(Boolean)));
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", evaluatorIds);

      const profileMap = new Map(
        (profiles ?? []).map((p) => [p.id, p.full_name || p.email || "Unknown"])
      );

      evaluations = evals.map((e) => ({
        id: e.id,
        artist_name: e.artist_name,
        genre: e.genre,
        results: e.results as ScoringResult | null,
        inputs: e.inputs,
        created_at: e.created_at,
        evaluator_name: profileMap.get(e.evaluator_id) ?? "Unknown",
      }));
    }
  } catch {
    // DB not set up — show empty dashboard
  }

  return <DashboardClient evaluations={evaluations} isAdmin={isAdmin} />;
}
