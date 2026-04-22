"use server";

import { createClient } from "@/lib/supabase/server";

// ─── Types ────────────────────────────────────────────────────

export interface KnownArtistRow {
  id: string;
  name: string;
  manager_id: string | null;
  agent_id: string | null;
  management_company_id: string | null;
  agency_id: string | null;
  matched_artist_id: string | null; // computed: matching artist in artists table
}

export interface LinkedArtistRow {
  id: string;
  name: string;
  role: string;
  latest_score: number | null;
  latest_tier: string | null;
  is_a3_client?: boolean;
}

export interface ManagerRow {
  id: string;
  name: string;
  management_company_id: string | null;
  management_company_name: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  is_active: boolean;
  artists: LinkedArtistRow[];
}

export interface ManagementCompanyRow {
  id: string;
  name: string;
  website: string | null;
  notes: string | null;
  created_at: string;
  managers: ManagerRow[];
}

export interface AgentRow {
  id: string;
  name: string;
  agency_id: string | null;
  agency_name: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  is_active: boolean;
  artists: LinkedArtistRow[];
}

export interface AgencyRow {
  id: string;
  name: string;
  website: string | null;
  notes: string | null;
  created_at: string;
  agents: AgentRow[];
}

// ─── Contacts page data ───────────────────────────────────────

export async function getContactsPageData(): Promise<{
  companies: ManagementCompanyRow[];
  unassignedManagers: ManagerRow[];
  agencies: AgencyRow[];
  unassignedAgents: AgentRow[];
  error: string | null;
}> {
  const supabase = await createClient();
  const empty = { companies: [], unassignedManagers: [], agencies: [], unassignedAgents: [], error: null };

  try {
    const [
      { data: companies, error: e1 },
      { data: agencies, error: e2 },
      { data: managers, error: e3 },
      { data: agents, error: e4 },
      { data: amLinks },
      { data: aaLinks },
    ] = await Promise.all([
      supabase.from("management_companies").select("*").order("name"),
      supabase.from("agencies").select("*").order("name"),
      supabase.from("managers").select("*").order("name"),
      supabase.from("agents").select("*").order("name"),
      supabase.from("artist_managers").select("id, artist_id, manager_id, role"),
      supabase.from("artist_agents").select("id, artist_id, agent_id, role"),
    ]);

    if (e1 || e2 || e3 || e4) {
      return { ...empty, error: (e1 ?? e2 ?? e3 ?? e4)!.message };
    }

    // Collect all artist IDs
    const artistIds = Array.from(
      new Set([
        ...(amLinks ?? []).map((l) => l.artist_id),
        ...(aaLinks ?? []).map((l) => l.artist_id),
      ])
    );

    let artistMap = new Map<string, { name: string; is_a3_client: boolean }>();
    let evalMap = new Map<string, { score_total: number | null; tier: string | null }>();

    if (artistIds.length > 0) {
      const { data: artistRows } = await supabase
        .from("artists")
        .select("id, name, is_a3_client")
        .in("id", artistIds);

      for (const a of artistRows ?? []) {
        artistMap.set(a.id, { name: a.name, is_a3_client: a.is_a3_client ?? false });
      }

      const { data: evalRows } = await supabase
        .from("evaluations")
        .select("artist_id, score_total, tier, evaluated_at")
        .eq("status", "complete")
        .in("artist_id", artistIds)
        .order("evaluated_at", { ascending: false });

      for (const ev of evalRows ?? []) {
        if (!evalMap.has(ev.artist_id)) {
          evalMap.set(ev.artist_id, { score_total: ev.score_total, tier: ev.tier });
        }
      }
    }

    // Build manager rows with linked artists
    const companyMap = new Map<string, { name: string }>();
    for (const c of companies ?? []) companyMap.set(c.id, { name: c.name });

    const agencyMap = new Map<string, { name: string }>();
    for (const a of agencies ?? []) agencyMap.set(a.id, { name: a.name });

    const buildManagerRow = (m: Record<string, unknown>): ManagerRow => {
      const myLinks = (amLinks ?? []).filter((l) => l.manager_id === m.id);
      const artists: LinkedArtistRow[] = myLinks.map((l) => ({
        id: l.artist_id,
        name: artistMap.get(l.artist_id)?.name ?? "Unknown",
        role: l.role,
        latest_score: evalMap.get(l.artist_id)?.score_total ?? null,
        latest_tier: evalMap.get(l.artist_id)?.tier ?? null,
        is_a3_client: artistMap.get(l.artist_id)?.is_a3_client ?? false,
      }));
      return {
        id: m.id as string,
        name: m.name as string,
        management_company_id: (m.management_company_id as string) ?? null,
        management_company_name: m.management_company_id
          ? (companyMap.get(m.management_company_id as string)?.name ?? null)
          : null,
        email: (m.email as string) ?? null,
        phone: (m.phone as string) ?? null,
        notes: (m.notes as string) ?? null,
        is_active: (m.is_active as boolean) ?? true,
        artists,
      };
    };

    const buildAgentRow = (a: Record<string, unknown>): AgentRow => {
      const myLinks = (aaLinks ?? []).filter((l) => l.agent_id === a.id);
      const artists: LinkedArtistRow[] = myLinks.map((l) => ({
        id: l.artist_id,
        name: artistMap.get(l.artist_id)?.name ?? "Unknown",
        role: l.role,
        latest_score: evalMap.get(l.artist_id)?.score_total ?? null,
        latest_tier: evalMap.get(l.artist_id)?.tier ?? null,
        is_a3_client: artistMap.get(l.artist_id)?.is_a3_client ?? false,
      }));
      return {
        id: a.id as string,
        name: a.name as string,
        agency_id: (a.agency_id as string) ?? null,
        agency_name: a.agency_id
          ? (agencyMap.get(a.agency_id as string)?.name ?? null)
          : null,
        email: (a.email as string) ?? null,
        phone: (a.phone as string) ?? null,
        notes: (a.notes as string) ?? null,
        is_active: (a.is_active as boolean) ?? true,
        artists,
      };
    };

    // Group managers by company
    const companiesWithManagers: ManagementCompanyRow[] = (companies ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      website: c.website ?? null,
      notes: c.notes ?? null,
      created_at: c.created_at,
      managers: (managers ?? [])
        .filter((m) => m.management_company_id === c.id)
        .map(buildManagerRow),
    }));

    const unassignedManagers = (managers ?? [])
      .filter((m) => !m.management_company_id)
      .map(buildManagerRow);

    const agenciesWithAgents: AgencyRow[] = (agencies ?? []).map((ag) => ({
      id: ag.id,
      name: ag.name,
      website: ag.website ?? null,
      notes: ag.notes ?? null,
      created_at: ag.created_at,
      agents: (agents ?? [])
        .filter((a) => a.agency_id === ag.id)
        .map(buildAgentRow),
    }));

    const unassignedAgents = (agents ?? [])
      .filter((a) => !a.agency_id)
      .map(buildAgentRow);

    return {
      companies: companiesWithManagers,
      unassignedManagers,
      agencies: agenciesWithAgents,
      unassignedAgents,
      error: null,
    };
  } catch (err) {
    return { ...empty, error: String(err) };
  }
}

// ─── For form dropdowns ───────────────────────────────────────

export async function getContactsForForm(): Promise<{
  management_companies: { id: string; name: string }[];
  agencies: { id: string; name: string }[];
  managers: { id: string; name: string; management_company_id: string | null }[];
  agents: { id: string; name: string; agency_id: string | null }[];
}> {
  const supabase = await createClient();
  const [
    { data: companies },
    { data: agencies },
    { data: managers },
    { data: agents },
  ] = await Promise.all([
    supabase.from("management_companies").select("id, name").order("name"),
    supabase.from("agencies").select("id, name").order("name"),
    supabase.from("managers").select("id, name, management_company_id").eq("is_active", true).order("name"),
    supabase.from("agents").select("id, name, agency_id").eq("is_active", true).order("name"),
  ]);
  return {
    management_companies: companies ?? [],
    agencies: agencies ?? [],
    managers: managers ?? [],
    agents: agents ?? [],
  };
}

// ─── Company CRUD ─────────────────────────────────────────────

export async function createManagementCompany(data: {
  name: string;
  website?: string;
  notes?: string;
}): Promise<{ id: string | null; error: string | null }> {
  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("management_companies")
    .insert({ name: data.name.trim(), website: data.website || null, notes: data.notes || null })
    .select("id")
    .single();
  if (error) return { id: null, error: error.message };
  return { id: row.id, error: null };
}

export async function updateManagementCompany(
  id: string,
  data: { name?: string; website?: string; notes?: string }
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("management_companies")
    .update({
      ...(data.name !== undefined && { name: data.name.trim() }),
      ...(data.website !== undefined && { website: data.website || null }),
      ...(data.notes !== undefined && { notes: data.notes || null }),
    })
    .eq("id", id);
  return { error: error?.message ?? null };
}

// ─── Agency CRUD ──────────────────────────────────────────────

export async function createAgency(data: {
  name: string;
  website?: string;
  notes?: string;
}): Promise<{ id: string | null; error: string | null }> {
  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("agencies")
    .insert({ name: data.name.trim(), website: data.website || null, notes: data.notes || null })
    .select("id")
    .single();
  if (error) return { id: null, error: error.message };
  return { id: row.id, error: null };
}

export async function updateAgency(
  id: string,
  data: { name?: string; website?: string; notes?: string }
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("agencies")
    .update({
      ...(data.name !== undefined && { name: data.name.trim() }),
      ...(data.website !== undefined && { website: data.website || null }),
      ...(data.notes !== undefined && { notes: data.notes || null }),
    })
    .eq("id", id);
  return { error: error?.message ?? null };
}

// ─── Manager CRUD ─────────────────────────────────────────────

export async function createManager(data: {
  name: string;
  management_company_id?: string | null;
  email?: string;
  phone?: string;
  notes?: string;
}): Promise<{ id: string | null; error: string | null }> {
  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("managers")
    .insert({
      name: data.name.trim(),
      management_company_id: data.management_company_id || null,
      email: data.email || null,
      phone: data.phone || null,
      notes: data.notes || null,
    })
    .select("id")
    .single();
  if (error) return { id: null, error: error.message };
  return { id: row.id, error: null };
}

export async function updateManager(
  id: string,
  data: {
    name?: string;
    management_company_id?: string | null;
    email?: string | null;
    phone?: string | null;
    notes?: string | null;
    is_active?: boolean;
  }
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("managers")
    .update({
      ...(data.name !== undefined && { name: data.name.trim() }),
      ...(data.management_company_id !== undefined && { management_company_id: data.management_company_id || null }),
      ...(data.email !== undefined && { email: data.email || null }),
      ...(data.phone !== undefined && { phone: data.phone || null }),
      ...(data.notes !== undefined && { notes: data.notes || null }),
      ...(data.is_active !== undefined && { is_active: data.is_active }),
    })
    .eq("id", id);
  return { error: error?.message ?? null };
}

// ─── Agent CRUD ───────────────────────────────────────────────

export async function createAgent(data: {
  name: string;
  agency_id?: string | null;
  email?: string;
  phone?: string;
  notes?: string;
}): Promise<{ id: string | null; error: string | null }> {
  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("agents")
    .insert({
      name: data.name.trim(),
      agency_id: data.agency_id || null,
      email: data.email || null,
      phone: data.phone || null,
      notes: data.notes || null,
    })
    .select("id")
    .single();
  if (error) return { id: null, error: error.message };
  return { id: row.id, error: null };
}

export async function updateAgent(
  id: string,
  data: {
    name?: string;
    agency_id?: string | null;
    email?: string | null;
    phone?: string | null;
    notes?: string | null;
    is_active?: boolean;
  }
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("agents")
    .update({
      ...(data.name !== undefined && { name: data.name.trim() }),
      ...(data.agency_id !== undefined && { agency_id: data.agency_id || null }),
      ...(data.email !== undefined && { email: data.email || null }),
      ...(data.phone !== undefined && { phone: data.phone || null }),
      ...(data.notes !== undefined && { notes: data.notes || null }),
      ...(data.is_active !== undefined && { is_active: data.is_active }),
    })
    .eq("id", id);
  return { error: error?.message ?? null };
}

// ─── Junction record management ───────────────────────────────

export async function saveArtistManagers(
  artistId: string,
  selections: { manager_id: string; role: string }[]
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  // Delete existing links for this artist
  await supabase.from("artist_managers").delete().eq("artist_id", artistId);
  if (selections.length === 0) return { error: null };
  const { error } = await supabase.from("artist_managers").insert(
    selections.map((s) => ({ artist_id: artistId, manager_id: s.manager_id, role: s.role }))
  );
  return { error: error?.message ?? null };
}

export async function saveArtistAgents(
  artistId: string,
  selections: { agent_id: string; role: string }[]
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  await supabase.from("artist_agents").delete().eq("artist_id", artistId);
  if (selections.length === 0) return { error: null };
  const { error } = await supabase.from("artist_agents").insert(
    selections.map((s) => ({ artist_id: artistId, agent_id: s.agent_id, role: s.role }))
  );
  return { error: error?.message ?? null };
}

// ─── Detail page loaders ──────────────────────────────────────

export async function getManagementCompanyDetail(id: string): Promise<{
  company: ManagementCompanyRow | null;
  error: string | null;
}> {
  const supabase = await createClient();
  const { data: company, error: e1 } = await supabase
    .from("management_companies")
    .select("*")
    .eq("id", id)
    .single();
  if (e1 || !company) return { company: null, error: e1?.message ?? "Not found" };

  const { data: managers } = await supabase
    .from("managers")
    .select("*")
    .eq("management_company_id", id)
    .order("name");

  const managerIds = (managers ?? []).map((m) => m.id);
  let amLinks: { artist_id: string; manager_id: string; role: string }[] = [];
  if (managerIds.length > 0) {
    const { data } = await supabase
      .from("artist_managers")
      .select("artist_id, manager_id, role")
      .in("manager_id", managerIds);
    amLinks = data ?? [];
  }

  const artistIds = Array.from(new Set(amLinks.map((l) => l.artist_id)));
  let artistMap = new Map<string, { name: string }>();
  let evalMap = new Map<string, { score_total: number | null; tier: string | null }>();

  if (artistIds.length > 0) {
    const { data: artistRows } = await supabase.from("artists").select("id, name").in("id", artistIds);
    for (const a of artistRows ?? []) artistMap.set(a.id, { name: a.name });
    const { data: evalRows } = await supabase
      .from("evaluations")
      .select("artist_id, score_total, tier, evaluated_at")
      .eq("status", "complete")
      .in("artist_id", artistIds)
      .order("evaluated_at", { ascending: false });
    for (const ev of evalRows ?? []) {
      if (!evalMap.has(ev.artist_id))
        evalMap.set(ev.artist_id, { score_total: ev.score_total, tier: ev.tier });
    }
  }

  const result: ManagementCompanyRow = {
    id: company.id,
    name: company.name,
    website: company.website ?? null,
    notes: company.notes ?? null,
    created_at: company.created_at,
    managers: (managers ?? []).map((m) => {
      const myLinks = amLinks.filter((l) => l.manager_id === m.id);
      return {
        id: m.id,
        name: m.name,
        management_company_id: m.management_company_id ?? null,
        management_company_name: company.name,
        email: m.email ?? null,
        phone: m.phone ?? null,
        notes: m.notes ?? null,
        is_active: m.is_active ?? true,
        artists: myLinks.map((l) => ({
          id: l.artist_id,
          name: artistMap.get(l.artist_id)?.name ?? "Unknown",
          role: l.role,
          latest_score: evalMap.get(l.artist_id)?.score_total ?? null,
          latest_tier: evalMap.get(l.artist_id)?.tier ?? null,
        })),
      };
    }),
  };
  return { company: result, error: null };
}

export async function getAgencyDetail(id: string): Promise<{
  agency: AgencyRow | null;
  error: string | null;
}> {
  const supabase = await createClient();
  const { data: agency, error: e1 } = await supabase
    .from("agencies")
    .select("*")
    .eq("id", id)
    .single();
  if (e1 || !agency) return { agency: null, error: e1?.message ?? "Not found" };

  const { data: agents } = await supabase
    .from("agents")
    .select("*")
    .eq("agency_id", id)
    .order("name");

  const agentIds = (agents ?? []).map((a) => a.id);
  let aaLinks: { artist_id: string; agent_id: string; role: string }[] = [];
  if (agentIds.length > 0) {
    const { data } = await supabase
      .from("artist_agents")
      .select("artist_id, agent_id, role")
      .in("agent_id", agentIds);
    aaLinks = data ?? [];
  }

  const artistIds = Array.from(new Set(aaLinks.map((l) => l.artist_id)));
  let artistMap = new Map<string, { name: string }>();
  let evalMap = new Map<string, { score_total: number | null; tier: string | null }>();

  if (artistIds.length > 0) {
    const { data: artistRows } = await supabase.from("artists").select("id, name").in("id", artistIds);
    for (const a of artistRows ?? []) artistMap.set(a.id, { name: a.name });
    const { data: evalRows } = await supabase
      .from("evaluations")
      .select("artist_id, score_total, tier, evaluated_at")
      .eq("status", "complete")
      .in("artist_id", artistIds)
      .order("evaluated_at", { ascending: false });
    for (const ev of evalRows ?? []) {
      if (!evalMap.has(ev.artist_id))
        evalMap.set(ev.artist_id, { score_total: ev.score_total, tier: ev.tier });
    }
  }

  const result: AgencyRow = {
    id: agency.id,
    name: agency.name,
    website: agency.website ?? null,
    notes: agency.notes ?? null,
    created_at: agency.created_at,
    agents: (agents ?? []).map((a) => {
      const myLinks = aaLinks.filter((l) => l.agent_id === a.id);
      return {
        id: a.id,
        name: a.name,
        agency_id: a.agency_id ?? null,
        agency_name: agency.name,
        email: a.email ?? null,
        phone: a.phone ?? null,
        notes: a.notes ?? null,
        is_active: a.is_active ?? true,
        artists: myLinks.map((l) => ({
          id: l.artist_id,
          name: artistMap.get(l.artist_id)?.name ?? "Unknown",
          role: l.role,
          latest_score: evalMap.get(l.artist_id)?.score_total ?? null,
          latest_tier: evalMap.get(l.artist_id)?.tier ?? null,
        })),
      };
    }),
  };
  return { agency: result, error: null };
}

export async function getManagerDetail(id: string): Promise<{
  manager: ManagerRow | null;
  error: string | null;
}> {
  const supabase = await createClient();
  const { data: m, error } = await supabase
    .from("managers")
    .select("*, management_companies(name)")
    .eq("id", id)
    .single();
  if (error || !m) return { manager: null, error: error?.message ?? "Not found" };

  const { data: links } = await supabase
    .from("artist_managers")
    .select("artist_id, role")
    .eq("manager_id", id);

  const artistIds = (links ?? []).map((l) => l.artist_id);
  let artistMap = new Map<string, { name: string; is_a3_client: boolean }>();
  let evalMap = new Map<string, { score_total: number | null; tier: string | null }>();

  if (artistIds.length > 0) {
    const { data: artistRows } = await supabase.from("artists").select("id, name, is_a3_client").in("id", artistIds);
    for (const a of artistRows ?? []) artistMap.set(a.id, { name: a.name, is_a3_client: a.is_a3_client ?? false });
    const { data: evalRows } = await supabase
      .from("evaluations")
      .select("artist_id, score_total, tier, evaluated_at")
      .eq("status", "complete")
      .in("artist_id", artistIds)
      .order("evaluated_at", { ascending: false });
    for (const ev of evalRows ?? []) {
      if (!evalMap.has(ev.artist_id))
        evalMap.set(ev.artist_id, { score_total: ev.score_total, tier: ev.tier });
    }
  }

  const companyName = (m.management_companies as { name: string } | null)?.name ?? null;

  return {
    manager: {
      id: m.id,
      name: m.name,
      management_company_id: m.management_company_id ?? null,
      management_company_name: companyName,
      email: m.email ?? null,
      phone: m.phone ?? null,
      notes: m.notes ?? null,
      is_active: m.is_active ?? true,
      artists: (links ?? []).map((l) => ({
        id: l.artist_id,
        name: artistMap.get(l.artist_id)?.name ?? "Unknown",
        role: l.role,
        latest_score: evalMap.get(l.artist_id)?.score_total ?? null,
        latest_tier: evalMap.get(l.artist_id)?.tier ?? null,
        is_a3_client: artistMap.get(l.artist_id)?.is_a3_client ?? false,
      })),
    },
    error: null,
  };
}

export async function getAgentDetail(id: string): Promise<{
  agent: AgentRow | null;
  error: string | null;
}> {
  const supabase = await createClient();
  const { data: a, error } = await supabase
    .from("agents")
    .select("*, agencies(name)")
    .eq("id", id)
    .single();
  if (error || !a) return { agent: null, error: error?.message ?? "Not found" };

  const { data: links } = await supabase
    .from("artist_agents")
    .select("artist_id, role")
    .eq("agent_id", id);

  const artistIds = (links ?? []).map((l) => l.artist_id);
  let artistMap = new Map<string, { name: string; is_a3_client: boolean }>();
  let evalMap = new Map<string, { score_total: number | null; tier: string | null }>();

  if (artistIds.length > 0) {
    const { data: artistRows } = await supabase.from("artists").select("id, name, is_a3_client").in("id", artistIds);
    for (const ar of artistRows ?? []) artistMap.set(ar.id, { name: ar.name, is_a3_client: ar.is_a3_client ?? false });
    const { data: evalRows } = await supabase
      .from("evaluations")
      .select("artist_id, score_total, tier, evaluated_at")
      .eq("status", "complete")
      .in("artist_id", artistIds)
      .order("evaluated_at", { ascending: false });
    for (const ev of evalRows ?? []) {
      if (!evalMap.has(ev.artist_id))
        evalMap.set(ev.artist_id, { score_total: ev.score_total, tier: ev.tier });
    }
  }

  const agencyName = (a.agencies as { name: string } | null)?.name ?? null;

  return {
    agent: {
      id: a.id,
      name: a.name,
      agency_id: a.agency_id ?? null,
      agency_name: agencyName,
      email: a.email ?? null,
      phone: a.phone ?? null,
      notes: a.notes ?? null,
      is_active: a.is_active ?? true,
      artists: (links ?? []).map((l) => ({
        id: l.artist_id,
        name: artistMap.get(l.artist_id)?.name ?? "Unknown",
        role: l.role,
        latest_score: evalMap.get(l.artist_id)?.score_total ?? null,
        latest_tier: evalMap.get(l.artist_id)?.tier ?? null,
        is_a3_client: artistMap.get(l.artist_id)?.is_a3_client ?? false,
      })),
    },
    error: null,
  };
}

// ─── known_artists helpers ────────────────────────────────────

async function matchArtistIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  names: string[]
): Promise<Map<string, string>> {
  if (names.length === 0) return new Map();
  const { data } = await supabase.from("artists").select("id, name");
  const lower = new Set(names.map((n) => n.toLowerCase()));
  const result = new Map<string, string>();
  for (const a of data ?? []) {
    if (lower.has(a.name.toLowerCase())) result.set(a.name.toLowerCase(), a.id);
  }
  return result;
}

function annotateMatches(
  rows: { id: string; name: string; manager_id: string | null; agent_id: string | null; management_company_id: string | null; agency_id: string | null }[],
  nameToId: Map<string, string>
): KnownArtistRow[] {
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    manager_id: r.manager_id,
    agent_id: r.agent_id,
    management_company_id: r.management_company_id,
    agency_id: r.agency_id,
    matched_artist_id: nameToId.get(r.name.toLowerCase()) ?? null,
  }));
}

// ─── known_artists queries ────────────────────────────────────

export async function getKnownArtistsForManager(managerId: string): Promise<KnownArtistRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("known_artists").select("*").eq("manager_id", managerId).order("name");
  const rows = data ?? [];
  return annotateMatches(rows, await matchArtistIds(supabase, rows.map((r) => r.name)));
}

export async function getKnownArtistsForAgent(agentId: string): Promise<KnownArtistRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("known_artists").select("*").eq("agent_id", agentId).order("name");
  const rows = data ?? [];
  return annotateMatches(rows, await matchArtistIds(supabase, rows.map((r) => r.name)));
}

export async function getKnownArtistsForManagerIds(managerIds: string[]): Promise<KnownArtistRow[]> {
  if (managerIds.length === 0) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("known_artists").select("*").in("manager_id", managerIds).order("name");
  const rows = data ?? [];
  return annotateMatches(rows, await matchArtistIds(supabase, rows.map((r) => r.name)));
}

export async function getKnownArtistsForAgentIds(agentIds: string[]): Promise<KnownArtistRow[]> {
  if (agentIds.length === 0) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("known_artists").select("*").in("agent_id", agentIds).order("name");
  const rows = data ?? [];
  return annotateMatches(rows, await matchArtistIds(supabase, rows.map((r) => r.name)));
}

export async function getKnownArtistsForCompany(companyId: string): Promise<KnownArtistRow[]> {
  const supabase = await createClient();
  const { data: mgrs } = await supabase.from("managers").select("id").eq("management_company_id", companyId);
  const managerIds = (mgrs ?? []).map((m) => m.id);

  let query = supabase.from("known_artists").select("*");
  if (managerIds.length > 0) {
    query = query.or(`management_company_id.eq.${companyId},manager_id.in.(${managerIds.join(",")})`);
  } else {
    query = query.eq("management_company_id", companyId);
  }
  const { data } = await query.order("name");
  const rows = data ?? [];
  return annotateMatches(rows, await matchArtistIds(supabase, rows.map((r) => r.name)));
}

export async function getKnownArtistsForAgency(agencyId: string): Promise<KnownArtistRow[]> {
  const supabase = await createClient();
  const { data: ags } = await supabase.from("agents").select("id").eq("agency_id", agencyId);
  const agentIds = (ags ?? []).map((a) => a.id);

  let query = supabase.from("known_artists").select("*");
  if (agentIds.length > 0) {
    query = query.or(`agency_id.eq.${agencyId},agent_id.in.(${agentIds.join(",")})`);
  } else {
    query = query.eq("agency_id", agencyId);
  }
  const { data } = await query.order("name");
  const rows = data ?? [];
  return annotateMatches(rows, await matchArtistIds(supabase, rows.map((r) => r.name)));
}

// ─── known_artists mutations ──────────────────────────────────

export async function addKnownArtists(
  names: string[],
  opts: {
    managerId?: string;
    agentId?: string;
    managementCompanyId?: string;
    agencyId?: string;
  }
): Promise<{ items: KnownArtistRow[]; error: string | null }> {
  const trimmed = names.map((n) => n.trim()).filter(Boolean);
  if (trimmed.length === 0) return { items: [], error: null };
  const supabase = await createClient();

  const records = trimmed.map((name) => ({
    name,
    manager_id: opts.managerId ?? null,
    agent_id: opts.agentId ?? null,
    management_company_id: opts.managementCompanyId ?? null,
    agency_id: opts.agencyId ?? null,
  }));

  const { data, error } = await supabase.from("known_artists").insert(records).select("*");
  if (error) return { items: [], error: error.message };
  const rows = data ?? [];
  return { items: annotateMatches(rows, await matchArtistIds(supabase, rows.map((r) => r.name))), error: null };
}

export async function removeKnownArtist(id: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.from("known_artists").delete().eq("id", id);
  return { error: error?.message ?? null };
}

// ─── Fuzzy match free-text fields against contacts DB ────────

function parseBookingAgentText(raw: string): { agencyName: string | null; agentNames: string[] } {
  const dashIdx = raw.indexOf(" - ");
  if (dashIdx > -1) {
    const agencyName = raw.substring(0, dashIdx).trim();
    const agentNames = raw.substring(dashIdx + 3).split(/[/,]/).map((n) => n.trim()).filter(Boolean);
    return { agencyName, agentNames };
  }
  // No dash — treat whole string as a potential agency name; also expose as agent names fallback
  return { agencyName: null, agentNames: raw.split(/[/,]/).map((n) => n.trim()).filter(Boolean) };
}

export interface FuzzyMatchedContacts {
  managementCompany: { id: string; name: string } | null;
  managers: { id: string; name: string }[];
  bookingAgency: { id: string; name: string } | null;
  agents: { id: string; name: string }[];
  unmatchedAgencyText: string | null;
  unmatchedAgentNames: string[];
}

export async function fuzzyMatchArtistContacts(inputs: {
  management_company: string | null;
  manager_names: string | null;
  booking_agent: string | null;
}): Promise<FuzzyMatchedContacts> {
  const supabase = await createClient();

  let managementCompany: { id: string; name: string } | null = null;
  const managers: { id: string; name: string }[] = [];
  let bookingAgency: { id: string; name: string } | null = null;
  const agents: { id: string; name: string }[] = [];
  let unmatchedAgencyText: string | null = null;
  const unmatchedAgentNames: string[] = [];

  if (inputs.management_company?.trim()) {
    const { data } = await supabase
      .from("management_companies").select("id, name")
      .ilike("name", inputs.management_company.trim()).limit(1);
    if (data?.[0]) managementCompany = { id: data[0].id, name: data[0].name };
  }

  if (inputs.manager_names?.trim()) {
    const names = inputs.manager_names.trim().split(/[/,]/).map((n) => n.trim()).filter(Boolean);
    for (const name of names) {
      const { data } = await supabase
        .from("managers").select("id, name").ilike("name", name).limit(1);
      if (data?.[0]) managers.push({ id: data[0].id, name: data[0].name });
    }
  }

  if (inputs.booking_agent?.trim()) {
    const raw = inputs.booking_agent.trim();
    const { agencyName, agentNames } = parseBookingAgentText(raw);

    if (agencyName) {
      const { data } = await supabase
        .from("agencies").select("id, name").ilike("name", agencyName).limit(1);
      if (data?.[0]) bookingAgency = { id: data[0].id, name: data[0].name };
      else unmatchedAgencyText = agencyName;
    }

    if (agentNames.length > 0) {
      for (const name of agentNames) {
        const { data } = await supabase
          .from("agents").select("id, name").ilike("name", name).limit(1);
        if (data?.[0]) agents.push({ id: data[0].id, name: data[0].name });
        else unmatchedAgentNames.push(name);
      }
    } else if (!agencyName) {
      // No dash, no split — try whole string as agency name
      const { data } = await supabase
        .from("agencies").select("id, name").ilike("name", raw).limit(1);
      if (data?.[0]) bookingAgency = { id: data[0].id, name: data[0].name };
      else unmatchedAgencyText = raw;
    }
  }

  return { managementCompany, managers, bookingAgency, agents, unmatchedAgencyText, unmatchedAgentNames };
}

// ─── Artist linked contacts (from junction tables) ────────────

export interface ArtistLinkedContacts {
  managementCompany: { id: string; name: string } | null;
  managers: { id: string; name: string; role: string }[];
  bookingAgency: { id: string; name: string } | null;
  agents: { id: string; name: string; role: string }[];
}

export async function getArtistLinkedContacts(artistId: string): Promise<ArtistLinkedContacts> {
  const supabase = await createClient();
  const [{ data: amLinks }, { data: aaLinks }] = await Promise.all([
    supabase.from("artist_managers").select("manager_id, role").eq("artist_id", artistId),
    supabase.from("artist_agents").select("agent_id, role").eq("artist_id", artistId),
  ]);

  const managerIds = (amLinks ?? []).map((l) => l.manager_id);
  const agentIds = (aaLinks ?? []).map((l) => l.agent_id);
  const roleByManager = new Map((amLinks ?? []).map((l) => [l.manager_id, l.role]));
  const roleByAgent = new Map((aaLinks ?? []).map((l) => [l.agent_id, l.role]));

  let managementCompany: { id: string; name: string } | null = null;
  let managers: { id: string; name: string; role: string }[] = [];
  let bookingAgency: { id: string; name: string } | null = null;
  let agents: { id: string; name: string; role: string }[] = [];

  if (managerIds.length > 0) {
    const { data: mgrRows } = await supabase
      .from("managers").select("id, name, management_company_id").in("id", managerIds);
    managers = (mgrRows ?? []).map((m) => ({
      id: m.id, name: m.name, role: roleByManager.get(m.id) ?? "Lead",
    }));
    const companyId = (mgrRows ?? []).find((m) => m.management_company_id)?.management_company_id;
    if (companyId) {
      const { data: c } = await supabase
        .from("management_companies").select("id, name").eq("id", companyId).single();
      if (c) managementCompany = { id: c.id, name: c.name };
    }
  }

  if (agentIds.length > 0) {
    const { data: agentRows } = await supabase
      .from("agents").select("id, name, agency_id").in("id", agentIds);
    agents = (agentRows ?? []).map((a) => ({
      id: a.id, name: a.name, role: roleByAgent.get(a.id) ?? "Primary",
    }));
    const agencyId = (agentRows ?? []).find((a) => a.agency_id)?.agency_id;
    if (agencyId) {
      const { data: ag } = await supabase
        .from("agencies").select("id, name").eq("id", agencyId).single();
      if (ag) bookingAgency = { id: ag.id, name: ag.name };
    }
  }

  return { managementCompany, managers, bookingAgency, agents };
}

// ─── Artist contacts by name (for Step 1 auto-load) ──────────

export async function getArtistContactsByName(name: string): Promise<{
  artistId: string | null;
  managementCompanyId: string | null;
  managementCompanyName: string | null;
  managerSelections: { manager_id: string; role: string }[];
  bookingAgencyId: string | null;
  bookingAgencyName: string | null;
  agentSelections: { agent_id: string; role: string }[];
  hasContacts: boolean;
}> {
  const empty = {
    artistId: null, managementCompanyId: null, managementCompanyName: null,
    managerSelections: [], bookingAgencyId: null, bookingAgencyName: null,
    agentSelections: [], hasContacts: false,
  };
  if (!name.trim()) return empty;
  const supabase = await createClient();
  const { data: artist } = await supabase
    .from("artists").select("id").ilike("name", name.trim()).limit(1).maybeSingle();
  if (!artist) return empty;
  const contacts = await getArtistLinkedContacts(artist.id);
  const hasContacts = !!(
    contacts.managementCompany || contacts.managers.length > 0 ||
    contacts.bookingAgency || contacts.agents.length > 0
  );
  return {
    artistId: artist.id,
    managementCompanyId: contacts.managementCompany?.id ?? null,
    managementCompanyName: contacts.managementCompany?.name ?? null,
    managerSelections: contacts.managers.map((m) => ({ manager_id: m.id, role: m.role })),
    bookingAgencyId: contacts.bookingAgency?.id ?? null,
    bookingAgencyName: contacts.bookingAgency?.name ?? null,
    agentSelections: contacts.agents.map((a) => ({ agent_id: a.id, role: a.role })),
    hasContacts,
  };
}

// ─── Roster crossover — agent ─────────────────────────────────

export interface RosterCrossoverEntry {
  artist_id: string | null;
  artist_name: string;
  other_agents: { id: string; name: string; agency_id: string | null; agency_name: string | null }[];
}

export async function getRosterCrossoverForAgent(agentId: string): Promise<RosterCrossoverEntry[]> {
  const supabase = await createClient();
  const [{ data: myLinks }, { data: myKnown }] = await Promise.all([
    supabase.from("artist_agents").select("artist_id").eq("agent_id", agentId),
    supabase.from("known_artists").select("name").eq("agent_id", agentId),
  ]);

  const myArtistIds = (myLinks ?? []).map((l) => l.artist_id);
  const crossovers: RosterCrossoverEntry[] = [];

  if (myArtistIds.length > 0) {
    const { data: otherLinks } = await supabase
      .from("artist_agents").select("artist_id, agent_id")
      .in("artist_id", myArtistIds).neq("agent_id", agentId);

    if (otherLinks && otherLinks.length > 0) {
      const { data: artists } = await supabase
        .from("artists").select("id, name").in("id", myArtistIds);
      const artistNameMap = new Map((artists ?? []).map((a) => [a.id, a.name]));

      const otherAgentIds = Array.from(new Set(otherLinks.map((l) => l.agent_id)));
      const { data: otherAgents } = await supabase
        .from("agents").select("id, name, agency_id, agencies(name)").in("id", otherAgentIds);
      const otherAgentMap = new Map((otherAgents ?? []).map((a) => [a.id, a]));

      const byArtist = new Map<string, string[]>();
      for (const l of otherLinks) {
        if (!byArtist.has(l.artist_id)) byArtist.set(l.artist_id, []);
        if (!byArtist.get(l.artist_id)!.includes(l.agent_id))
          byArtist.get(l.artist_id)!.push(l.agent_id);
      }

      for (const [artistId, agentIds] of Array.from(byArtist)) {
        crossovers.push({
          artist_id: artistId,
          artist_name: artistNameMap.get(artistId) ?? "Unknown",
          other_agents: agentIds.map((id: string) => {
            const a = otherAgentMap.get(id);
            if (!a) return { id, name: "Unknown", agency_id: null, agency_name: null };
            return {
              id: a.id, name: a.name, agency_id: a.agency_id ?? null,
              agency_name: (a.agencies as unknown as { name: string } | null)?.name ?? null,
            };
          }),
        });
      }
    }
  }

  const knownNames = (myKnown ?? []).map((k) => k.name);
  if (knownNames.length > 0) {
    const { data: crossoverKnown } = await supabase
      .from("known_artists").select("name, agent_id")
      .in("name", knownNames).neq("agent_id", agentId).not("agent_id", "is", null);

    if (crossoverKnown && crossoverKnown.length > 0) {
      const otherAgentIds = Array.from(new Set(
        crossoverKnown.map((k) => k.agent_id).filter((id): id is string => !!id)
      ));
      const { data: otherAgents } = await supabase
        .from("agents").select("id, name, agency_id, agencies(name)").in("id", otherAgentIds);
      const otherAgentMap = new Map((otherAgents ?? []).map((a) => [a.id, a]));

      const byName = new Map<string, string[]>();
      for (const k of crossoverKnown) {
        if (!k.agent_id) continue;
        if (!byName.has(k.name)) byName.set(k.name, []);
        if (!byName.get(k.name)!.includes(k.agent_id)) byName.get(k.name)!.push(k.agent_id);
      }

      for (const [name, agentIds] of Array.from(byName)) {
        if (!crossovers.find((c) => c.artist_name.toLowerCase() === name.toLowerCase())) {
          crossovers.push({
            artist_id: null, artist_name: name,
            other_agents: agentIds.map((id: string) => {
              const a = otherAgentMap.get(id);
              if (!a) return { id, name: "Unknown", agency_id: null, agency_name: null };
              return {
                id: a.id, name: a.name, agency_id: a.agency_id ?? null,
                agency_name: (a.agencies as unknown as { name: string } | null)?.name ?? null,
              };
            }),
          });
        }
      }
    }
  }

  return crossovers.sort((a, b) => a.artist_name.localeCompare(b.artist_name));
}

// ─── Roster crossover — agency ────────────────────────────────


export interface AgencyCrossoverEntry {
  artist_id: string | null;
  artist_name: string;
  other_agencies: { id: string; name: string }[];
}

export async function getRosterCrossoverForAgency(agencyId: string): Promise<AgencyCrossoverEntry[]> {
  const supabase = await createClient();
  const [{ data: agencyAgents }, { data: myKnown }] = await Promise.all([
    supabase.from("agents").select("id").eq("agency_id", agencyId),
    supabase.from("known_artists").select("name").eq("agency_id", agencyId),
  ]);

  const myAgentIds = (agencyAgents ?? []).map((a) => a.id);
  const myAgentSet = new Set(myAgentIds);
  const crossovers: AgencyCrossoverEntry[] = [];

  if (myAgentIds.length > 0) {
    const { data: myLinks } = await supabase
      .from("artist_agents").select("artist_id").in("agent_id", myAgentIds);
    const myArtistIds = Array.from(new Set((myLinks ?? []).map((l) => l.artist_id)));

    if (myArtistIds.length > 0) {
      const { data: allLinks } = await supabase
        .from("artist_agents").select("artist_id, agent_id").in("artist_id", myArtistIds);
      const filteredLinks = (allLinks ?? []).filter((l) => !myAgentSet.has(l.agent_id));

      if (filteredLinks.length > 0) {
        const { data: artists } = await supabase
          .from("artists").select("id, name").in("id", myArtistIds);
        const artistNameMap = new Map((artists ?? []).map((a) => [a.id, a.name]));

        const otherAgentIds = Array.from(new Set(filteredLinks.map((l) => l.agent_id)));
        const { data: otherAgents } = await supabase
          .from("agents").select("id, agency_id, agencies(id, name)").in("id", otherAgentIds);

        const agentToAgency = new Map<string, { id: string; name: string }>();
        for (const a of otherAgents ?? []) {
          if (a.agency_id) {
            const ag = a.agencies as unknown as { id: string; name: string } | null;
            if (ag) agentToAgency.set(a.id, { id: ag.id, name: ag.name });
          }
        }

        const byArtist = new Map<string, Map<string, { id: string; name: string }>>();
        for (const link of filteredLinks) {
          const agency = agentToAgency.get(link.agent_id);
          if (!agency) continue;
          if (!byArtist.has(link.artist_id)) byArtist.set(link.artist_id, new Map());
          byArtist.get(link.artist_id)!.set(agency.id, agency);
        }

        for (const [artistId, agenciesMap] of Array.from(byArtist)) {
          crossovers.push({
            artist_id: artistId,
            artist_name: artistNameMap.get(artistId) ?? "Unknown",
            other_agencies: Array.from(agenciesMap.values()),
          });
        }
      }
    }
  }

  const knownNames = (myKnown ?? []).map((k) => k.name);
  if (knownNames.length > 0) {
    const { data: crossoverKnown } = await supabase
      .from("known_artists").select("name, agency_id")
      .in("name", knownNames).neq("agency_id", agencyId).not("agency_id", "is", null);

    if (crossoverKnown && crossoverKnown.length > 0) {
      const otherAgencyIds = Array.from(new Set(
        crossoverKnown.map((k) => k.agency_id).filter((id): id is string => !!id)
      ));
      const { data: otherAgencies } = await supabase
        .from("agencies").select("id, name").in("id", otherAgencyIds);
      const agencyInfoMap = new Map((otherAgencies ?? []).map((a) => [a.id, a]));

      const byName = new Map<string, Map<string, { id: string; name: string }>>();
      for (const k of crossoverKnown) {
        if (!k.agency_id) continue;
        const ag = agencyInfoMap.get(k.agency_id);
        if (!ag) continue;
        if (!byName.has(k.name)) byName.set(k.name, new Map());
        byName.get(k.name)!.set(ag.id, { id: ag.id, name: ag.name });
      }

      for (const [name, agenciesMap] of Array.from(byName)) {
        if (!crossovers.find((c) => c.artist_name.toLowerCase() === name.toLowerCase())) {
          crossovers.push({
            artist_id: null, artist_name: name,
            other_agencies: Array.from(agenciesMap.values()),
          });
        }
      }
    }
  }

  return crossovers.sort((a, b) => a.artist_name.localeCompare(b.artist_name));
}

// ─── Auto-create known_artist for evaluated artist ────────────

export async function ensureKnownArtistForEval(
  artistName: string,
  managerIds: string[],
  agentIds: string[]
): Promise<void> {
  if (!artistName.trim()) return;
  const supabase = await createClient();
  const name = artistName.trim();

  for (const managerId of managerIds) {
    const { data: existing } = await supabase
      .from("known_artists").select("id").eq("manager_id", managerId).ilike("name", name).limit(1);
    if (!existing || existing.length === 0) {
      await supabase.from("known_artists").insert({ name, manager_id: managerId });
    }
  }
  for (const agentId of agentIds) {
    const { data: existing } = await supabase
      .from("known_artists").select("id").eq("agent_id", agentId).ilike("name", name).limit(1);
    if (!existing || existing.length === 0) {
      await supabase.from("known_artists").insert({ name, agent_id: agentId });
    }
  }
}

// ─── A3 Relationship helpers ──────────────────────────────────

export async function getA3RelationshipForPersons(opts: {
  managerIds: string[];
  agentIds: string[];
}): Promise<{
  managers: Record<string, string[]>;
  agents: Record<string, string[]>;
}> {
  const supabase = await createClient();
  const result = { managers: {} as Record<string, string[]>, agents: {} as Record<string, string[]> };

  if (opts.managerIds.length > 0) {
    const { data: amLinks } = await supabase
      .from("artist_managers").select("manager_id, artist_id")
      .in("manager_id", opts.managerIds);
    const artistIds = Array.from(new Set((amLinks ?? []).map((l) => l.artist_id)));
    if (artistIds.length > 0) {
      const { data: a3 } = await supabase
        .from("artists").select("id, name")
        .in("id", artistIds).eq("is_a3_client", true);
      const a3Map = new Map((a3 ?? []).map((a) => [a.id, a.name]));
      for (const link of (amLinks ?? [])) {
        if (a3Map.has(link.artist_id)) {
          if (!result.managers[link.manager_id]) result.managers[link.manager_id] = [];
          result.managers[link.manager_id].push(a3Map.get(link.artist_id)!);
        }
      }
    }
  }

  if (opts.agentIds.length > 0) {
    const { data: aaLinks } = await supabase
      .from("artist_agents").select("agent_id, artist_id")
      .in("agent_id", opts.agentIds);
    const artistIds = Array.from(new Set((aaLinks ?? []).map((l) => l.artist_id)));
    if (artistIds.length > 0) {
      const { data: a3 } = await supabase
        .from("artists").select("id, name")
        .in("id", artistIds).eq("is_a3_client", true);
      const a3Map = new Map((a3 ?? []).map((a) => [a.id, a.name]));
      for (const link of (aaLinks ?? [])) {
        if (a3Map.has(link.artist_id)) {
          if (!result.agents[link.agent_id]) result.agents[link.agent_id] = [];
          result.agents[link.agent_id].push(a3Map.get(link.artist_id)!);
        }
      }
    }
  }

  return result;
}

export async function getArtistIdsWithA3Relationship(): Promise<Set<string>> {
  const supabase = await createClient();
  const { data: a3Artists } = await supabase
    .from("artists").select("id").eq("is_a3_client", true);
  const a3ArtistIds = (a3Artists ?? []).map((a) => a.id);
  if (a3ArtistIds.length === 0) return new Set();

  const [{ data: amLinks }, { data: aaLinks }] = await Promise.all([
    supabase.from("artist_managers").select("manager_id").in("artist_id", a3ArtistIds),
    supabase.from("artist_agents").select("agent_id").in("artist_id", a3ArtistIds),
  ]);

  const a3ManagerIds = (amLinks ?? []).map((l) => l.manager_id);
  const a3AgentIds = (aaLinks ?? []).map((l) => l.agent_id);
  const result = new Set<string>();

  await Promise.all([
    a3ManagerIds.length > 0
      ? supabase.from("artist_managers").select("artist_id").in("manager_id", a3ManagerIds)
          .then(({ data }) => (data ?? []).forEach((l) => result.add(l.artist_id)))
      : Promise.resolve(),
    a3AgentIds.length > 0
      ? supabase.from("artist_agents").select("artist_id").in("agent_id", a3AgentIds)
          .then(({ data }) => (data ?? []).forEach((l) => result.add(l.artist_id)))
      : Promise.resolve(),
  ]);

  return result;
}
