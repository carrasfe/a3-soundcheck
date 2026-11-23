import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ArtistDetailClient from "@/components/ArtistDetailClient";
import {
  getArtistLinkedContacts, fuzzyMatchArtistContacts, getA3RelationshipForPersons,
  getKnownArtistsForManagerIds, getKnownArtistsForAgentIds,
} from "@/app/contacts/actions";

export type ArtistRef = { id: string; name: string };
export type RosterEntry = { name: string; artist_id: string | null; is_a3_client: boolean };

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
  // Grouped contacts (new — managers grouped by company, agents by agency)
  management_groups: { company: { id: string; name: string } | null; managers: { id: string; name: string; role: string }[] }[];
  booking_groups: { agency: { id: string; name: string } | null; agents: { id: string; name: string; role: string }[] }[];
  // Flat lists kept for A3 relationship lookup
  linked_managers: { id: string; name: string; role: string }[];
  linked_agents: { id: string; name: string; role: string }[];
  // Legacy single-company fields (kept for backward compat display fallback)
  linked_management_company: { id: string; name: string } | null;
  linked_booking_agency: { id: string; name: string } | null;
  // Fuzzy-matched contacts (fallback for legacy text data)
  fuzzy_management_company: { id: string; name: string } | null;
  fuzzy_managers: { id: string; name: string }[];
  fuzzy_booking_agency: { id: string; name: string } | null;
  fuzzy_agents: { id: string; name: string }[];
  unmatched_agency_text: string | null;
  unmatched_agent_names: string[];
  // A3 relationship: which A3 client artists each linked contact also works with
  // (the artist being viewed is excluded)
  a3_relationships: {
    managers: Record<string, ArtistRef[]>;
    agents: Record<string, ArtistRef[]>;
  };
  // known_artists roster per linked manager / agent id
  rosters: Record<string, RosterEntry[]>;
  // Team text from the artist record / latest evaluation, for the "Link now" prompt
  team_text: { management_company: string | null; manager_names: string | null; booking_agent: string | null };
};

export default async function ArtistDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: artist, error }, { data: evals }, linkedContacts, { data: a3Clients }] = await Promise.all([
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
    supabase.from("artists").select("id, name").eq("is_a3_client", true),
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
    management_groups: linkedContacts.managementEntries,
    booking_groups: linkedContacts.bookingEntries,
    linked_managers: linkedContacts.managers,
    linked_agents: linkedContacts.agents,
    linked_management_company: linkedContacts.managementCompany,
    linked_booking_agency: linkedContacts.bookingAgency,
    fuzzy_management_company: null,
    fuzzy_managers: [],
    fuzzy_booking_agency: null,
    fuzzy_agents: [],
    unmatched_agency_text: null,
    unmatched_agent_names: [],
    a3_relationships: { managers: {}, agents: {} },
    rosters: {},
    team_text: {
      management_company: artist.management_company ?? null,
      manager_names: artist.manager_names ?? null,
      booking_agent: artist.booking_agent ?? null,
    },
  };

  // A3 client lookup: lowercase name → artist (for links + roster highlighting)
  const a3ByName = new Map((a3Clients ?? []).map((a) => [a.name.toLowerCase(), { id: a.id as string, name: a.name as string }]));
  const toRefs = (names: string[]) =>
    names
      .map((n) => a3ByName.get(n.toLowerCase()) ?? { id: "", name: n })
      .filter((a) => a.id !== artist.id && a.name.toLowerCase() !== artist.name.toLowerCase());

  // A3 relationships + rosters for all linked people
  const a3ManagerIds = artistDetail.linked_managers.map((m) => m.id);
  const a3AgentIds = artistDetail.linked_agents.map((a) => a.id);
  if (a3ManagerIds.length > 0 || a3AgentIds.length > 0) {
    const [rel, mgrRoster, agtRoster] = await Promise.all([
      getA3RelationshipForPersons({ managerIds: a3ManagerIds, agentIds: a3AgentIds }),
      getKnownArtistsForManagerIds(a3ManagerIds),
      getKnownArtistsForAgentIds(a3AgentIds),
    ]);
    for (const [id, names] of Object.entries(rel.managers)) {
      const refs = toRefs(names);
      if (refs.length) artistDetail.a3_relationships.managers[id] = refs;
    }
    for (const [id, names] of Object.entries(rel.agents)) {
      const refs = toRefs(names);
      if (refs.length) artistDetail.a3_relationships.agents[id] = refs;
    }
    for (const k of [...mgrRoster, ...agtRoster]) {
      const owner = k.manager_id ?? k.agent_id;
      if (!owner) continue;
      const a3 = a3ByName.get(k.name.toLowerCase());
      (artistDetail.rosters[owner] ??= []).push({
        name: k.name,
        artist_id: k.matched_artist_id ?? a3?.id ?? null,
        is_a3_client: !!a3,
      });
    }
  }

  // Team text: fall back to the latest completed evaluation when the artist record is blank
  const tt = artistDetail.team_text;
  if (evalRows[0] && !tt.management_company && !tt.manager_names && !tt.booking_agent) {
    const { data: latest } = await supabase.from("evaluations")
      .select("management_company:inputs->>management_company, manager_names:inputs->>manager_names, booking_agent:inputs->>booking_agent")
      .eq("id", evalRows[0].id).maybeSingle();
    const l = (latest ?? {}) as Record<string, string | null>;
    tt.management_company = l.management_company || null;
    tt.manager_names = l.manager_names || null;
    tt.booking_agent = l.booking_agent || null;
  }

  // Fuzzy-match legacy text fields for any contact dimension without junction links
  const needsMgmtFuzzy = !linkedContacts.managementCompany && !!tt.management_company;
  const needsMgrFuzzy  = linkedContacts.managers.length === 0 && !!tt.manager_names;
  const needsBookingFuzzy = !linkedContacts.bookingAgency && linkedContacts.agents.length === 0 && !!tt.booking_agent;

  if (needsMgmtFuzzy || needsMgrFuzzy || needsBookingFuzzy) {
    const fuzzy = await fuzzyMatchArtistContacts({
      management_company: needsMgmtFuzzy ? tt.management_company : null,
      manager_names: needsMgrFuzzy ? tt.manager_names : null,
      booking_agent: needsBookingFuzzy ? tt.booking_agent : null,
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
