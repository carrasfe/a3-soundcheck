import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ArtistDetailClient from "@/components/ArtistDetailClient";
import { getArtistLinkedContacts, fuzzyMatchArtistContacts } from "@/app/contacts/actions";

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
  is_a3_client: boolean;
  is_archived: boolean;
  evaluations: ArtistEvaluation[];
  linked_management_company: { id: string; name: string } | null;
  linked_managers: { id: string; name: string; role: string }[];
  linked_booking_agency: { id: string; name: string } | null;
  linked_agents: { id: string; name: string; role: string }[];
  // Fuzzy-matched contacts (fallback for legacy text data)
  fuzzy_management_company: { id: string; name: string } | null;
  fuzzy_managers: { id: string; name: string }[];
  fuzzy_booking_agency: { id: string; name: string } | null;
  fuzzy_agents: { id: string; name: string }[];
  unmatched_agency_text: string | null;
  unmatched_agent_names: string[];
};

export default async function ArtistDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: artist, error }, { data: evals }, linkedContacts] = await Promise.all([
    supabase
      .from("artists")
      .select("id, name, genre, merch_provider:current_merch_provider, management_company, manager_names, booking_agent, is_a3_client, is_archived")
      .eq("id", params.id)
      .single(),
    supabase
      .from("evaluations")
      .select("id, score_total, tier, evaluated_at, evaluated_by")
      .eq("artist_id", params.id)
      .eq("status", "complete")
      .order("evaluated_at", { ascending: false }),
    getArtistLinkedContacts(params.id),
  ]);

  if (error || !artist) notFound();

  const evalRows = evals ?? [];

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
    is_a3_client: artist.is_a3_client ?? false,
    is_archived: artist.is_archived ?? false,
    evaluations: evalRows.map((ev) => ({
      id: ev.id,
      created_at: ev.evaluated_at,
      evaluator_name: evaluatorMap.get(ev.evaluated_by) ?? ev.evaluated_by ?? "Unknown",
      total_score: ev.score_total ?? null,
      tier_label: ev.tier ?? null,
      revenue_tier: null,
    })),
    linked_management_company: linkedContacts.managementCompany,
    linked_managers: linkedContacts.managers,
    linked_booking_agency: linkedContacts.bookingAgency,
    linked_agents: linkedContacts.agents,
    fuzzy_management_company: null,
    fuzzy_managers: [],
    fuzzy_booking_agency: null,
    fuzzy_agents: [],
    unmatched_agency_text: null,
    unmatched_agent_names: [],
  };

  // Fuzzy-match legacy text fields for any contact dimension without junction links
  const needsMgmtFuzzy = !linkedContacts.managementCompany && !!artist.management_company;
  const needsMgrFuzzy  = linkedContacts.managers.length === 0 && !!artist.manager_names;
  const needsBookingFuzzy = !linkedContacts.bookingAgency && linkedContacts.agents.length === 0 && !!artist.booking_agent;

  if (needsMgmtFuzzy || needsMgrFuzzy || needsBookingFuzzy) {
    const fuzzy = await fuzzyMatchArtistContacts({
      management_company: needsMgmtFuzzy ? artist.management_company : null,
      manager_names: needsMgrFuzzy ? artist.manager_names : null,
      booking_agent: needsBookingFuzzy ? artist.booking_agent : null,
    });
    artistDetail.fuzzy_management_company = fuzzy.managementCompany;
    artistDetail.fuzzy_managers = fuzzy.managers;
    artistDetail.fuzzy_booking_agency = fuzzy.bookingAgency;
    artistDetail.fuzzy_agents = fuzzy.agents;
    artistDetail.unmatched_agency_text = fuzzy.unmatchedAgencyText;
    artistDetail.unmatched_agent_names = fuzzy.unmatchedAgentNames;
  }

  return <ArtistDetailClient artist={artistDetail} />;
}
