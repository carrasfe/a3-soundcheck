import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ArtistDetailClient from "@/components/ArtistDetailClient";
import type { ScoringResult } from "@/lib/scoring-engine";

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
  const { data: evals } = await supabase
    .from("evaluations")
    .select("id, results, created_at, evaluator_id")
    .eq("artist_id", artist.id)
    .eq("status", "complete")
    .order("created_at", { ascending: false });

  const evalRows = evals ?? [];

  // Fetch evaluator display names
  let evaluatorMap = new Map<string, string>();
  if (evalRows.length > 0) {
    const evaluatorIds = Array.from(new Set(evalRows.map((e) => e.evaluator_id)));
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", evaluatorIds);
    evaluatorMap = new Map(
      (profiles ?? []).map((p) => [p.id, p.full_name || p.email || "Unknown"])
    );
  }

  const artistDetail: ArtistDetail = {
    ...artist,
    evaluations: evalRows.map((ev) => {
      const r = ev.results as ScoringResult | null;
      return {
        id: ev.id,
        created_at: ev.created_at,
        evaluator_name: evaluatorMap.get(ev.evaluator_id) ?? "Unknown",
        total_score: r?.total_score ?? null,
        tier_label: r?.tier_label ?? null,
        revenue_tier: r?.revenue_tier ?? null,
      };
    }),
  };

  return <ArtistDetailClient artist={artistDetail} />;
}
