import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { HttpError } from "@/lib/mcp/http";
import { escapeLike } from "@/lib/mcp/data";

// Destructive cleanup tools for the contacts database: fix bad roster entries,
// artist links and junk contact records created by mistake.
// Cascades mirror the app's own delete actions in app/contacts/actions.ts.

type SB = SupabaseClient;
type PersonType = "manager" | "agent";
type ContactType = "management_company" | "agency" | "manager" | "agent";

const PERSON = {
  manager: { table: "managers", col: "manager_id", junction: "artist_managers", orgCol: "management_company_id", orgTable: "management_companies" },
  agent:   { table: "agents",   col: "agent_id",   junction: "artist_agents",   orgCol: "agency_id",             orgTable: "agencies" },
} as const;

const str = (v: unknown) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim());

function personType(v: unknown, field = "person_type"): PersonType {
  const t = str(v).toLowerCase();
  if (t !== "manager" && t !== "agent") throw new HttpError(400, `${field} must be "manager" or "agent"`);
  return t;
}

/**
 * Find exactly one record by id or case-insensitive exact name. Several people
 * can share a name (at different companies), so ambiguity is an error that
 * lists the candidates — the caller can retry with an id.
 */
async function resolveOne(
  sb: SB, table: string, label: string, name: string, id: string, orgCol?: string, orgTable?: string
): Promise<{ id: string; name: string }> {
  if (!name && !id) throw new HttpError(400, `${label} name or id is required`);
  const cols = orgCol ? `id, name, ${orgCol}` : "id, name";
  const q = sb.from(table).select(cols);
  const { data, error } = id ? await q.eq("id", id) : await q.ilike("name", escapeLike(name));
  if (error) throw error;
  const rows = (data ?? []) as unknown as Record<string, string | null>[];
  if (rows.length === 0) throw new HttpError(404, `No ${label} found ${id ? `with id ${id}` : `named "${name}"`}`);
  if (rows.length > 1) {
    let orgNames = new Map<string, string>();
    if (orgCol && orgTable) {
      const orgIds = rows.map((r) => r[orgCol]).filter((x): x is string => !!x);
      if (orgIds.length) {
        const { data: orgs } = await sb.from(orgTable).select("id, name").in("id", orgIds);
        orgNames = new Map((orgs ?? []).map((o) => [o.id as string, o.name as string]));
      }
    }
    throw new HttpError(409, `${rows.length} ${label}s named "${name}" — pass the id to choose one`, {
      candidates: rows.map((r) => ({
        id: r.id, name: r.name, ...(orgCol ? { organization: r[orgCol] ? orgNames.get(r[orgCol]!) ?? null : null } : {}),
      })),
    });
  }
  return { id: rows[0].id as string, name: rows[0].name as string };
}

function resolvePerson(sb: SB, type: PersonType, args: Record<string, unknown>) {
  const p = PERSON[type];
  return resolveOne(sb, p.table, type, str(args.person_name), str(args.person_id), p.orgCol, p.orgTable);
}

/** delete … returning the deleted ids, so counts are exact. */
async function del(sb: SB, table: string, apply: (q: any) => any): Promise<number> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const { data, error } = await apply(sb.from(table).delete()).select("id");
  if (error) throw error;
  return (data ?? []).length;
}

// ── remove_known_artists ─────────────────────────────────────
export async function removeKnownArtists(args: Record<string, unknown>) {
  const type = personType(args.person_type);
  const raw = args.artist_names;
  const list = Array.isArray(raw) ? raw.map(str) : typeof raw === "string" ? raw.split(",").map(str) : [];
  const names = Array.from(new Set(list.filter(Boolean)));
  if (names.length === 0) throw new HttpError(400, "artist_names must be a non-empty array of artist names");

  const sb = createAdminClient();
  const person = await resolvePerson(sb, type, args);
  const col = PERSON[type].col;

  const { data, error } = await sb.from("known_artists").select("id, name").eq(col, person.id);
  if (error) throw error;
  const rows = data ?? [];

  const removed: string[] = [];
  const notFound: string[] = [];
  const ids: string[] = [];
  for (const n of names) {
    const hits = rows.filter((r) => String(r.name).trim().toLowerCase() === n.toLowerCase());
    if (hits.length) { removed.push(hits[0].name as string); ids.push(...hits.map((h) => h.id as string)); }
    else notFound.push(n);
  }
  if (ids.length) await del(sb, "known_artists", (q) => q.in("id", ids));

  return {
    person_type: type, person: person.name, person_id: person.id,
    removed, not_found: notFound, remaining: rows.length - ids.length,
  };
}

// ── clear_roster ─────────────────────────────────────────────
export async function clearRoster(args: Record<string, unknown>) {
  const type = personType(args.person_type);
  const sb = createAdminClient();
  const person = await resolvePerson(sb, type, args);
  const deleted = await del(sb, "known_artists", (q) => q.eq(PERSON[type].col, person.id));
  return { person_type: type, person: person.name, person_id: person.id, deleted };
}

// ── unlink_artist ────────────────────────────────────────────
export async function unlinkArtist(args: Record<string, unknown>) {
  const type = personType(args.person_type);
  const sb = createAdminClient();
  const artist = await resolveOne(sb, "artists", "artist", str(args.artist_name), str(args.artist_id));
  const person = await resolvePerson(sb, type, args);
  const p = PERSON[type];
  const removed = await del(sb, p.junction, (q) => q.eq("artist_id", artist.id).eq(p.col, person.id));
  return {
    success: removed > 0,
    status: removed > 0 ? "unlinked" : "not_found",
    artist: artist.name, artist_id: artist.id,
    person_type: type, person: person.name, person_id: person.id,
    ...(removed === 0 ? { message: `${artist.name} was not linked to ${type} ${person.name}` } : {}),
  };
}

// ── delete_contact ───────────────────────────────────────────
export async function deleteContact(args: Record<string, unknown>) {
  const type = str(args.contact_type).toLowerCase() as ContactType;
  if (!["management_company", "agency", "manager", "agent"].includes(type)) {
    throw new HttpError(400, 'contact_type must be "management_company", "agency", "manager" or "agent"');
  }
  const sb = createAdminClient();
  const name = str(args.name);
  const id = str(args.id);

  if (type === "manager" || type === "agent") {
    const p = PERSON[type];
    const person = await resolveOne(sb, p.table, type, name, id, p.orgCol, p.orgTable);
    const knownArtists = await del(sb, "known_artists", (q) => q.eq(p.col, person.id));
    const artistLinks = await del(sb, p.junction, (q) => q.eq(p.col, person.id));
    await del(sb, p.table, (q) => q.eq("id", person.id));
    return {
      deleted: { contact_type: type, id: person.id, name: person.name },
      cascade: { known_artists: knownArtists, artist_links: artistLinks },
    };
  }

  // Company / agency: cascades to its people, their links and rosters (same as the app)
  const p = type === "management_company" ? PERSON.manager : PERSON.agent;
  const org = await resolveOne(sb, p.orgTable, type.replace("_", " "), name, id);
  const { data: people, error } = await sb.from(p.table).select("id, name").eq(p.orgCol, org.id);
  if (error) throw error;
  const personIds = (people ?? []).map((x) => x.id as string);
  let knownArtists = 0;
  let artistLinks = 0;
  if (personIds.length) {
    knownArtists += await del(sb, "known_artists", (q) => q.in(p.col, personIds));
    artistLinks += await del(sb, p.junction, (q) => q.in(p.col, personIds));
  }
  knownArtists += await del(sb, "known_artists", (q) => q.eq(p.orgCol, org.id));
  const peopleDeleted = await del(sb, p.table, (q) => q.eq(p.orgCol, org.id));
  await del(sb, p.orgTable, (q) => q.eq("id", org.id));
  return {
    deleted: { contact_type: type, id: org.id, name: org.name },
    cascade: {
      [type === "management_company" ? "managers" : "agents"]: (people ?? []).map((x) => x.name),
      [type === "management_company" ? "managers_deleted" : "agents_deleted"]: peopleDeleted,
      known_artists: knownArtists,
      artist_links: artistLinks,
    },
  };
}
