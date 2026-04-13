import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ArtistDetailClient from "@/components/ArtistDetailClient";

export type ArtistEvaluation = {
  id: string;
  created_at: string;
  evaluator_name: string;
  total_score: number | null;
  tier_label: string | null;
  revenue_tier: string | null;
};

export type ArtistDetail = {
  id: string;
  name: string;
  genre: string | null;
  merch_provider: string | null;
  management_company: string | null;
  manager_names: string | null;
  booking_agent: string | null;
  evaluations: ArtistEvaluation[];
};

export default async function ArtistDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: artist, error } = await supabase
    .from("artists")
    .select("id, name, genre, merch_provider:current_merch_provider, management_company, manager_names, booking_agent")
    .eq("id", params.id)
    .single();

  if (error || !artist) notFound();

  // All completed evaluations for this artist, newest first
  // Actual schema: score_total, tier, evaluated_at, evaluated_by (not results jsonb, created_at, or evaluator_id)
  const { data: evals } = await supabase
    .from("evaluations")
    .select("id, score_total, tier, evaluated_at, evaluated_by")
    .eq("artist_id", artist.id)
    .eq("status", "complete")
    .order("evaluated_at", { ascending: false });

  const evalRows = evals ?? [];

  // Try to resolve evaluator display names from profiles
  let evaluatorMap = new Map<string, string>();
  if (evalRows.length > 0) {
    const evaluatorRefs = Array.from(new Set(evalRows.map((e) => e.evaluated_by).filter(Boolean)));
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", evaluatorRefs);
    evaluatorMap = new Map(
      (profiles ?? []).map((p) => [p.id, p.full_name || p.email || "Unknown"])
    );
  }

  const artistDetail: ArtistDetail = {
    ...artist,
    evaluations: evalRows.map((ev) => ({
      id: ev.id,
      created_at: ev.evaluated_at,
      evaluator_name: evaluatorMap.get(ev.evaluated_by) ?? ev.evaluated_by ?? "Unknown",
      total_score: ev.score_total ?? null,
      tier_label: ev.tier ?? null,
      revenue_tier: null, // revenue_tier not in current DB schema
    })),
  };

  return <ArtistDetailClient artist={artistDetail} />;
}
