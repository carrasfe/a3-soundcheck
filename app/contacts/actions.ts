"use server";

import { createClient } from "@/lib/supabase/server";

// ─── Types ────────────────────────────────────────────────────

export interface LinkedArtistRow {
  id: string;
  name: string;
  role: string;
  latest_score: number | null;
  latest_tier: string | null;
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

    let artistMap = new Map<string, { name: string }>();
    let evalMap = new Map<string, { score_total: number | null; tier: string | null }>();

    if (artistIds.length > 0) {
      const { data: artistRows } = await supabase
        .from("artists")
        .select("id, name")
        .in("id", artistIds);

      for (const a of artistRows ?? []) {
        artistMap.set(a.id, { name: a.name });
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
  let artistMap = new Map<string, { name: string }>();
  let evalMap = new Map<string, { score_total: number | null; tier: string | null }>();

  if (artistIds.length > 0) {
    const { data: artistRows } = await supabase.from("artists").select("id, name").in("id", artistIds);
    for (const ar of artistRows ?? []) artistMap.set(ar.id, { name: ar.name });
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
      })),
    },
    error: null,
  };
}
