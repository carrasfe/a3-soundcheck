import { createAdminClient } from "@/lib/supabase/admin";
import { HttpError } from "@/lib/mcp/http";
import { appUrl, escapeLike, getA3ClientNames, getRoster } from "@/lib/mcp/data";

type Row = Record<string, any>;

// GET /api/mcp/get-contacts?q=<name>
// Searches management companies, agencies, managers and agents by name.
export async function getContacts(params: { q?: string }, origin: string) {
  const q = params.q?.trim();
  if (!q) throw new HttpError(400, "Missing required query parameter: q");

  const sb = createAdminClient();
  const pattern = `%${escapeLike(q)}%`;
  const base = appUrl(origin);

  const search = async (table: string, cols: string) => {
    const { data, error } = await sb.from(table).select(cols).ilike("name", pattern).order("name").limit(10);
    if (error) throw error;
    return (data ?? []) as unknown as Row[];
  };
  const [companies, agencies, managers, agents, a3Names] = await Promise.all([
    search("management_companies", "id, name, website, notes"),
    search("agencies", "id, name, website, notes"),
    search("managers", "id, name, email, phone, notes, is_active, management_company_id"),
    search("agents", "id, name, email, phone, notes, is_active, agency_id"),
    getA3ClientNames(sb),
  ]);

  const nameOf = async (table: string, id: string | null) => {
    if (!id) return null;
    const { data } = await sb.from(table).select("id, name").eq("id", id).maybeSingle();
    return data ?? null;
  };
  const person = (p: Row) => ({
    id: p.id, name: p.name, email: p.email ?? null, phone: p.phone ?? null, is_active: p.is_active ?? true,
  });

  const management_companies = await Promise.all(companies.map(async (c) => {
    const { data: mgrs } = await sb.from("managers")
      .select("id, name, email, phone, is_active").eq("management_company_id", c.id).order("name");
    const roster = await getRoster(sb, { managerIds: (mgrs ?? []).map((m) => m.id), companyId: c.id }, a3Names);
    return {
      id: c.id, name: c.name, website: c.website, notes: c.notes,
      managers: (mgrs ?? []).map(person), ...roster,
      url: `${base}/contacts/management/${c.id}`,
    };
  }));

  const agencyResults = await Promise.all(agencies.map(async (a) => {
    const { data: agts } = await sb.from("agents")
      .select("id, name, email, phone, is_active").eq("agency_id", a.id).order("name");
    const roster = await getRoster(sb, { agentIds: (agts ?? []).map((x) => x.id), agencyId: a.id }, a3Names);
    return {
      id: a.id, name: a.name, website: a.website, notes: a.notes,
      agents: (agts ?? []).map(person), ...roster,
      url: `${base}/contacts/agencies/${a.id}`,
    };
  }));

  const managerResults = await Promise.all(managers.map(async (m) => ({
    ...person(m), notes: m.notes,
    management_company: await nameOf("management_companies", m.management_company_id),
    ...(await getRoster(sb, { managerIds: [m.id] }, a3Names)),
    url: `${base}/contacts/managers/${m.id}`,
  })));

  const agentResults = await Promise.all(agents.map(async (a) => ({
    ...person(a), notes: a.notes,
    agency: await nameOf("agencies", a.agency_id),
    ...(await getRoster(sb, { agentIds: [a.id] }, a3Names)),
    url: `${base}/contacts/agents/${a.id}`,
  })));

  return {
    query: q,
    management_companies,
    agencies: agencyResults,
    managers: managerResults,
    agents: agentResults,
  };
}
