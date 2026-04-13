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
  let dbError: string | null = null;

  try {
    const { data: evals, error: evalsError } = await supabase
      .from("evaluations")
      .select("id, results, inputs, created_at, evaluator_id, artists(name, genre)")
      .eq("status", "complete")
      .order("created_at", { ascending: false });

    if (evalsError) throw evalsError;

    if (evals && evals.length > 0) {
      const evaluatorIds = Array.from(new Set(evals.map((e) => e.evaluator_id).filter(Boolean)));
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", evaluatorIds);

      const profileMap = new Map(
        (profiles ?? []).map((p) => [p.id, p.full_name || p.email || "Unknown"])
      );

      evaluations = evals.map((e) => {
        const artist = e.artists as unknown as { name: string; genre: string | null } | null;
        return {
          id: e.id,
          artist_name: artist?.name ?? "",
          genre: artist?.genre ?? null,
          results: e.results as ScoringResult | null,
          inputs: e.inputs,
          created_at: e.created_at,
          evaluator_name: profileMap.get(e.evaluator_id) ?? "Unknown",
        };
      });
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

  return <DashboardClient evaluations={evaluations} isAdmin={isAdmin} dbError={dbError} />;
}
