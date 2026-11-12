import type { SupabaseClient } from "@supabase/supabase-js";

// Data access for the /api/mcp/* routes. Everything takes the service-role
// client explicitly — the app's server actions use the cookie-based client and
// can't run without a logged-in user.

type SB = SupabaseClient;

export interface LatestEval {
  evaluation_id: string;
  score: number | null;
  tier: string | null;
  evaluated_at: string;
}

export interface PersonContact {
  id: string;
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  company: { id: string; name: string } | null;
}

export interface A3Relationship {
  /** "a3_client" = artist is an A3 client; "shared_team" = a manager/agent also reps an A3 client */
  status: "a3_client" | "shared_team" | "none";
  via: { contact_type: "manager" | "agent"; contact_name: string; a3_artists: string[] }[];
}

/** Escape LIKE wildcards so user input is matched literally. */
export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function unique<T>(xs: (T | null | undefined)[]): T[] {
  return Array.from(new Set(xs.filter((x): x is T => x != null)));
}

/** PostgREST caps rows per request (default 1000) — page through everything. */
export async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
  const PAGE = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return out;
  }
}

/** `.in()` with a long id list can overflow the URL — run it in chunks. */
async function inChunks<T>(
  ids: string[],
  run: (chunk: string[]) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await run(ids.slice(i, i + 150));
    if (error) throw error;
    out.push(...(data ?? []));
  }
  return out;
}

// ─── Evaluations ──────────────────────────────────────────────

/** Latest complete evaluation per artist. Omit artistIds to load all artists. */
export async function getLatestEvals(sb: SB, artistIds?: string[]): Promise<Map<string, LatestEval>> {
  type Row = { id: string; artist_id: string; score_total: number | null; tier: string | null; evaluated_at: string };
  const cols = "id, artist_id, score_total, tier, evaluated_at";
  const rows: Row[] = artistIds
    ? await inChunks<Row>(unique(artistIds), (chunk) =>
        sb.from("evaluations").select(cols).eq("status", "complete").in("artist_id", chunk)
          .order("evaluated_at", { ascending: false }))
    : await fetchAll<Row>((from, to) =>
        sb.from("evaluations").select(cols).eq("status", "complete")
          .order("evaluated_at", { ascending: false }).range(from, to));

  rows.sort((a, b) => (b.evaluated_at ?? "").localeCompare(a.evaluated_at ?? ""));
  const map = new Map<string, LatestEval>();
  for (const r of rows) {
    if (!r.artist_id || map.has(r.artist_id)) continue;
    map.set(r.artist_id, { evaluation_id: r.id, score: r.score_total, tier: r.tier, evaluated_at: r.evaluated_at });
  }
  return map;
}

export async function getProfileNames(sb: SB, ids: string[]): Promise<Map<string, { name: string; email: string | null }>> {
  const map = new Map<string, { name: string; email: string | null }>();
  const list = unique(ids);
  if (list.length === 0) return map;
  const rows = await inChunks<{ id: string; full_name: string | null; email: string | null }>(list, (chunk) =>
    sb.from("profiles").select("id, full_name, email").in("id", chunk));
  for (const p of rows) map.set(p.id, { name: p.full_name || p.email || p.id, email: p.email });
  return map;
}

// ─── Contacts ─────────────────────────────────────────────────

async function companyNames(sb: SB, table: "management_companies" | "agencies", ids: string[]) {
  const map = new Map<string, string>();
  const list = unique(ids);
  if (list.length === 0) return map;
  const rows = await inChunks<{ id: string; name: string }>(list, (chunk) =>
    sb.from(table).select("id, name").in("id", chunk));
  for (const r of rows) map.set(r.id, r.name);
  return map;
}

/** Managers and agents linked to each artist via the junction tables, with company names. */
export async function getLinkedContacts(
  sb: SB,
  artistIds: string[]
): Promise<Map<string, { managers: PersonContact[]; agents: PersonContact[] }>> {
  const result = new Map<string, { managers: PersonContact[]; agents: PersonContact[] }>();
  const ids = unique(artistIds);
  ids.forEach((id) => result.set(id, { managers: [], agents: [] }));
  if (ids.length === 0) return result;

  const [amLinks, aaLinks] = await Promise.all([
    inChunks<{ artist_id: string; manager_id: string; role: string | null }>(ids, (c) =>
      sb.from("artist_managers").select("artist_id, manager_id, role").in("artist_id", c)),
    inChunks<{ artist_id: string; agent_id: string; role: string | null }>(ids, (c) =>
      sb.from("artist_agents").select("artist_id, agent_id, role").in("artist_id", c)),
  ]);

  type Person = { id: string; name: string; email: string | null; phone: string | null };
  const [mgrs, agts] = await Promise.all([
    inChunks<Person & { management_company_id: string | null }>(unique(amLinks.map((l) => l.manager_id)), (c) =>
      sb.from("managers").select("id, name, email, phone, management_company_id").in("id", c)),
    inChunks<Person & { agency_id: string | null }>(unique(aaLinks.map((l) => l.agent_id)), (c) =>
      sb.from("agents").select("id, name, email, phone, agency_id").in("id", c)),
  ]);
  const [compMap, agencyMap] = await Promise.all([
    companyNames(sb, "management_companies", mgrs.map((m) => m.management_company_id) as string[]),
    companyNames(sb, "agencies", agts.map((a) => a.agency_id) as string[]),
  ]);
  const mgrById = new Map(mgrs.map((m) => [m.id, m]));
  const agtById = new Map(agts.map((a) => [a.id, a]));

  for (const l of amLinks) {
    const m = mgrById.get(l.manager_id);
    if (!m) continue;
    const cid = m.management_company_id;
    result.get(l.artist_id)?.managers.push({
      id: m.id, name: m.name, role: l.role, email: m.email, phone: m.phone,
      company: cid ? { id: cid, name: compMap.get(cid) ?? cid } : null,
    });
  }
  for (const l of aaLinks) {
    const a = agtById.get(l.agent_id);
    if (!a) continue;
    const aid = a.agency_id;
    result.get(l.artist_id)?.agents.push({
      id: a.id, name: a.name, role: l.role, email: a.email, phone: a.phone,
      company: aid ? { id: aid, name: agencyMap.get(aid) ?? aid } : null,
    });
  }
  return result;
}

/** lowercase name → canonical name for every A3 client artist. */
export async function getA3ClientNames(sb: SB): Promise<Map<string, string>> {
  const { data, error } = await sb.from("artists").select("name").eq("is_a3_client", true);
  if (error) throw error;
  return new Map((data ?? []).map((a) => [a.name.toLowerCase(), a.name]));
}

/**
 * A3 client artists represented by each manager / agent — via the junction
 * tables AND known_artists roster entries (same logic as getA3RelationshipForPersons).
 */
export async function getA3ArtistsForPersons(
  sb: SB,
  managerIds: string[],
  agentIds: string[],
  a3Names: Map<string, string>
): Promise<{ managers: Map<string, string[]>; agents: Map<string, string[]> }> {
  const out = { managers: new Map<string, string[]>(), agents: new Map<string, string[]>() };
  const add = (m: Map<string, string[]>, k: string, name: string) => {
    const list = m.get(k) ?? [];
    if (!list.includes(name)) list.push(name);
    m.set(k, list);
  };

  for (const kind of ["manager", "agent"] as const) {
    const ids = unique(kind === "manager" ? managerIds : agentIds);
    if (ids.length === 0) continue;
    const target = kind === "manager" ? out.managers : out.agents;
    const col = `${kind}_id`;

    type Rows = PromiseLike<{ data: Record<string, string>[] | null; error: unknown }>;
    const links = await inChunks<Record<string, string>>(ids, (c) =>
      sb.from(kind === "manager" ? "artist_managers" : "artist_agents")
        .select(`${col}, artist_id` as string).in(col, c) as unknown as Rows);
    const linkedArtistIds = unique(links.map((l) => l.artist_id));
    if (linkedArtistIds.length > 0) {
      const a3 = await inChunks<{ id: string; name: string }>(linkedArtistIds, (c) =>
        sb.from("artists").select("id, name").in("id", c).eq("is_a3_client", true));
      const a3Map = new Map(a3.map((a) => [a.id, a.name]));
      for (const l of links) if (a3Map.has(l.artist_id)) add(target, l[col], a3Map.get(l.artist_id)!);
    }

    const known = await inChunks<Record<string, string>>(ids, (c) =>
      sb.from("known_artists").select(`${col}, name` as string).in(col, c) as unknown as Rows);
    for (const k of known) {
      const canonical = a3Names.get((k.name ?? "").toLowerCase());
      if (canonical && k[col]) add(target, k[col], canonical);
    }
  }
  return out;
}

export function buildA3Relationship(
  artistName: string,
  isA3Client: boolean,
  contacts: { managers: PersonContact[]; agents: PersonContact[] },
  a3ByPerson: { managers: Map<string, string[]>; agents: Map<string, string[]> }
): A3Relationship {
  const self = artistName.toLowerCase();
  const via: A3Relationship["via"] = [];
  for (const m of contacts.managers) {
    const others = (a3ByPerson.managers.get(m.id) ?? []).filter((n) => n.toLowerCase() !== self);
    if (others.length) via.push({ contact_type: "manager", contact_name: m.name, a3_artists: others });
  }
  for (const a of contacts.agents) {
    const others = (a3ByPerson.agents.get(a.id) ?? []).filter((n) => n.toLowerCase() !== self);
    if (others.length) via.push({ contact_type: "agent", contact_name: a.name, a3_artists: others });
  }
  return { status: isA3Client ? "a3_client" : via.length ? "shared_team" : "none", via };
}

// ─── Artists ──────────────────────────────────────────────────

export interface ArtistRow {
  id: string;
  name: string;
  genre: string | null;
  is_a3_client: boolean | null;
  current_merch_provider: string | null;
}

export const ARTIST_COLS = "id, name, genre, is_a3_client, current_merch_provider";

/** Full artist summaries (score, tier, contacts, A3 relationship) for a set of artist rows. */
export async function summarizeArtists(sb: SB, artists: ArtistRow[], appUrl: string) {
  const ids = artists.map((a) => a.id);
  const [latest, contacts, a3Names] = await Promise.all([
    getLatestEvals(sb, ids),
    getLinkedContacts(sb, ids),
    getA3ClientNames(sb),
  ]);
  const allContacts = Array.from(contacts.values());
  const a3ByPerson = await getA3ArtistsForPersons(
    sb,
    allContacts.flatMap((c) => c.managers.map((m) => m.id)),
    allContacts.flatMap((c) => c.agents.map((a) => a.id)),
    a3Names
  );

  return artists.map((a) => {
    const c = contacts.get(a.id) ?? { managers: [], agents: [] };
    const ev = latest.get(a.id) ?? null;
    return {
      id: a.id,
      name: a.name,
      genre: a.genre,
      latest_score: ev?.score ?? null,
      latest_tier: ev?.tier ?? null,
      latest_evaluated_at: ev?.evaluated_at ?? null,
      merch_provider: a.current_merch_provider,
      is_a3_client: !!a.is_a3_client,
      managers: c.managers,
      agents: c.agents,
      a3_relationship: buildA3Relationship(a.name, !!a.is_a3_client, c, a3ByPerson),
      url: `${appUrl}/artists/${a.id}`,
    };
  });
}

// ─── Roster (for contacts) ────────────────────────────────────

/** Known-artist roster + linked Soundcheck artists for a group of managers/agents/companies. */
export async function getRoster(
  sb: SB,
  opts: { managerIds?: string[]; agentIds?: string[]; companyId?: string; agencyId?: string },
  a3Names: Map<string, string>
) {
  const managerIds = unique(opts.managerIds ?? []);
  const agentIds = unique(opts.agentIds ?? []);

  const knownQueries: PromiseLike<{ data: { name: string }[] | null; error: unknown }>[] = [];
  if (managerIds.length) knownQueries.push(sb.from("known_artists").select("name").in("manager_id", managerIds));
  if (agentIds.length) knownQueries.push(sb.from("known_artists").select("name").in("agent_id", agentIds));
  if (opts.companyId) knownQueries.push(sb.from("known_artists").select("name").eq("management_company_id", opts.companyId));
  if (opts.agencyId) knownQueries.push(sb.from("known_artists").select("name").eq("agency_id", opts.agencyId));

  const [knownResults, amLinks, aaLinks] = await Promise.all([
    Promise.all(knownQueries),
    managerIds.length ? sb.from("artist_managers").select("artist_id").in("manager_id", managerIds) : null,
    agentIds.length ? sb.from("artist_agents").select("artist_id").in("agent_id", agentIds) : null,
  ]);

  const knownByLower = new Map<string, string>();
  for (const r of knownResults) for (const k of r.data ?? []) {
    if (k.name && !knownByLower.has(k.name.toLowerCase())) knownByLower.set(k.name.toLowerCase(), k.name);
  }

  const artistIds = unique([...(amLinks?.data ?? []), ...(aaLinks?.data ?? [])].map((l) => l.artist_id as string));
  let soundcheck: { id: string; name: string; genre: string | null; is_a3_client: boolean; latest_score: number | null; latest_tier: string | null }[] = [];
  if (artistIds.length) {
    const [rows, latest] = await Promise.all([
      inChunks<ArtistRow>(artistIds, (c) => sb.from("artists").select(ARTIST_COLS).in("id", c)),
      getLatestEvals(sb, artistIds),
    ]);
    soundcheck = rows.map((a) => ({
      id: a.id, name: a.name, genre: a.genre, is_a3_client: !!a.is_a3_client,
      latest_score: latest.get(a.id)?.score ?? null,
      latest_tier: latest.get(a.id)?.tier ?? null,
    }));
  }

  const a3 = new Set<string>(soundcheck.filter((a) => a.is_a3_client).map((a) => a.name));
  knownByLower.forEach((_, lower) => {
    const canonical = a3Names.get(lower);
    if (canonical) a3.add(canonical);
  });

  return {
    known_artists: Array.from(knownByLower.values()).sort((a, b) => a.localeCompare(b)),
    soundcheck_artists: soundcheck.sort((a, b) => a.name.localeCompare(b.name)),
    a3_client_artists: Array.from(a3).sort((a, b) => a.localeCompare(b)),
  };
}

// ─── Users ────────────────────────────────────────────────────

/** First admin user — owner of drafts created through the MCP API. */
export async function getFirstAdminId(sb: SB): Promise<string> {
  const ordered = await sb.from("profiles").select("id").eq("role", "admin")
    .order("created_at", { ascending: true }).limit(1);
  // Fall back to an unordered lookup if profiles has no created_at column
  const { data, error } = ordered.error
    ? await sb.from("profiles").select("id").eq("role", "admin").limit(1)
    : ordered;
  if (error) throw error;
  if (!data?.[0]) throw new Error("No admin user found to own the draft");
  return data[0].id as string;
}

export function appUrl(reqOrigin: string): string {
  return (process.env.SOUNDCHECK_APP_URL || reqOrigin).replace(/\/$/, "");
}
