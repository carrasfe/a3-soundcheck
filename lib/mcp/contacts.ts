import type { SupabaseClient } from "@supabase/supabase-js";
import { escapeLike } from "@/lib/mcp/data";
import {
  agentRoleFor, managerRoleFor, parseArtistList, parseManagement, parseOrgs, parseRosterBlocks, type ParsedOrg,
} from "@/lib/mcp/contact-parse";
import type { BookingEntry, ManagementEntry } from "@/app/evaluations/new/types";

// Turns the free-text contact fields an MCP caller sends into real contact
// records: management_companies / managers / agencies / agents, the
// artist_managers / artist_agents links, and known_artists roster rows.
//
// Idempotent: every record is looked up (case-insensitively) before insert,
// and links/roster rows are only added when missing — nothing is deleted.

type SB = SupabaseClient;
type Status = "created" | "existing";

/** Matches the wizard's slot limit (Step1ArtistInfo MAX_SLOTS). */
const MAX_SLOTS = 5;

export const CONTACT_FIELDS = [
  "management_company", "manager_names", "other_mgmt_artists", "booking_agent", "other_agent_artists",
] as const;

/** Per-person roster fields. Not wizard inputs — they only feed known_artists. */
export const ROSTER_FIELDS = ["manager_rosters", "agent_rosters"] as const;

export interface ContactsSummary {
  management_companies: { id: string; name: string; status: Status }[];
  managers: { id: string; name: string; company: string | null; role: string; status: Status }[];
  agencies: { id: string; name: string; territory: string | null; status: Status }[];
  agents: { id: string; name: string; agency: string | null; role: string; status: Status }[];
  /** New artist_managers + artist_agents rows */
  artist_links_added: number;
  /** New known_artists rows (rosters + other_mgmt_artists / other_agent_artists) */
  roster_artists_added: number;
  /** Where roster artists went */
  rosters: { person_type: "manager" | "agent" | "management_company" | "agency"; name: string; id: string; added: number }[];
  /** Roster data that was not applied, and why */
  roster_skipped: string[];
}

export interface ContactInputs {
  management_company?: unknown;
  manager_names?: unknown;
  other_mgmt_artists?: unknown;
  booking_agent?: unknown;
  other_agent_artists?: unknown;
  /** "Person: artist, artist; Person 2: artist" */
  manager_rosters?: unknown;
  agent_rosters?: unknown;
}

const s = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));

/** Pick the non-blank per-person roster fields out of a request body. */
export function rosterFieldsFrom(body: Record<string, unknown>): Partial<Record<(typeof ROSTER_FIELDS)[number], string>> {
  const out: Partial<Record<(typeof ROSTER_FIELDS)[number], string>> = {};
  for (const k of ROSTER_FIELDS) if (s(body[k]).trim()) out[k] = s(body[k]);
  return out;
}

export function hasContactFields(inputs: ContactInputs): boolean {
  return [...CONTACT_FIELDS, ...ROSTER_FIELDS].some((k) => s(inputs[k]).trim() !== "");
}

// ── Lookups ──────────────────────────────────────────────────

async function findOrCreateOrg(sb: SB, table: "management_companies" | "agencies", name: string) {
  const { data, error } = await sb.from(table).select("id, name").ilike("name", escapeLike(name)).limit(1);
  if (error) throw error;
  if (data?.[0]) return { id: data[0].id as string, name: data[0].name as string, status: "existing" as Status };
  const { data: row, error: insErr } = await sb.from(table).insert({ name }).select("id, name").single();
  if (insErr) throw insErr;
  return { id: row.id as string, name: row.name as string, status: "created" as Status };
}

/**
 * Find a person by name at an org; reuse an org-less record with the same name
 * (and attach it to the org); otherwise create one.
 */
async function findOrCreatePerson(
  sb: SB, table: "managers" | "agents", orgCol: "management_company_id" | "agency_id",
  name: string, orgId: string | null
) {
  const { data, error } = await sb.from(table).select(`id, name, ${orgCol}`).ilike("name", escapeLike(name));
  if (error) throw error;
  const rows = (data ?? []) as unknown as Record<string, string | null>[];
  const atOrg = rows.find((r) => (r[orgCol] ?? null) === orgId);
  if (atOrg) return { id: atOrg.id as string, name: atOrg.name as string, status: "existing" as Status };
  if (orgId) {
    const orphan = rows.find((r) => !r[orgCol]);
    if (orphan) {
      const { error: updErr } = await sb.from(table).update({ [orgCol]: orgId }).eq("id", orphan.id);
      if (updErr) throw updErr;
      return { id: orphan.id as string, name: orphan.name as string, status: "existing" as Status };
    }
  } else if (rows[0]) {
    // No org given — reuse an existing person with this name wherever they are
    return { id: rows[0].id as string, name: rows[0].name as string, status: "existing" as Status };
  }
  const { data: row, error: insErr } = await sb.from(table)
    .insert({ name, [orgCol]: orgId }).select("id, name").single();
  if (insErr) throw insErr;
  return { id: row.id as string, name: row.name as string, status: "created" as Status };
}

/** Insert artist↔person links that don't exist yet. Returns how many were added. */
async function linkArtist(
  sb: SB, table: "artist_managers" | "artist_agents", personCol: "manager_id" | "agent_id",
  artistId: string, people: { id: string; role: string }[]
): Promise<number> {
  if (people.length === 0) return 0;
  const { data, error } = await sb.from(table).select(personCol).eq("artist_id", artistId);
  if (error) throw error;
  const have = new Set((data ?? []).map((r) => (r as Record<string, string>)[personCol]));
  const toAdd = dedupeBy(people, (p) => p.id).filter((p) => !have.has(p.id));
  if (toAdd.length === 0) return 0;
  const { error: insErr } = await sb.from(table)
    .insert(toAdd.map((p) => ({ artist_id: artistId, [personCol]: p.id, role: p.role })));
  if (insErr) throw insErr;
  return toAdd.length;
}

/** Add roster names to known_artists for one owner (manager/agent/company/agency), skipping existing. */
async function addRoster(
  sb: SB, ownerCol: "manager_id" | "agent_id" | "management_company_id" | "agency_id",
  ownerId: string, names: string[]
): Promise<number> {
  if (names.length === 0) return 0;
  let q = sb.from("known_artists").select("name").eq(ownerCol, ownerId);
  // Company/agency-level rows are the ones not tied to a specific person
  if (ownerCol === "management_company_id") q = q.is("manager_id", null);
  if (ownerCol === "agency_id") q = q.is("agent_id", null);
  const { data, error } = await q;
  if (error) throw error;
  const have = new Set((data ?? []).map((r) => String(r.name).trim().toLowerCase()));
  const toAdd = names.filter((n) => !have.has(n.toLowerCase()));
  if (toAdd.length === 0) return 0;
  const { error: insErr } = await sb.from("known_artists").insert(toAdd.map((name) => ({ name, [ownerCol]: ownerId })));
  if (insErr) throw insErr;
  return toAdd.length;
}

// ── Main entry point ─────────────────────────────────────────

export async function linkContacts(
  sb: SB, artistId: string, artistName: string, inputs: ContactInputs
): Promise<{ summary: ContactsSummary; managementEntries: ManagementEntry[]; bookingEntries: BookingEntry[] }> {
  const summary: ContactsSummary = {
    management_companies: [], managers: [], agencies: [], agents: [],
    artist_links_added: 0, roster_artists_added: 0, rosters: [], roster_skipped: [],
  };
  const managementEntries: ManagementEntry[] = [];
  const bookingEntries: BookingEntry[] = [];

  // ── Management ──
  const mgmtOrgs: ParsedOrg[] = parseManagement(s(inputs.management_company), s(inputs.manager_names)).slice(0, MAX_SLOTS);
  const managerLinks: { id: string; role: string }[] = [];
  const companyIds: string[] = [];
  for (const org of mgmtOrgs) {
    const company = org.name ? await findOrCreateOrg(sb, "management_companies", org.name) : null;
    if (company) { summary.management_companies.push(company); companyIds.push(company.id); }
    const entry: ManagementEntry = { company_id: company?.id ?? "", company_name: company?.name ?? "", manager_selections: [] };
    for (const p of org.people) {
      const m = await findOrCreatePerson(sb, "managers", "management_company_id", p.name, company?.id ?? null);
      const role = managerRoleFor(p.note);
      summary.managers.push({ ...m, company: company?.name ?? null, role });
      managerLinks.push({ id: m.id, role });
      entry.manager_selections.push({ manager_id: m.id, role, manager_name: m.name });
    }
    managementEntries.push(entry);
  }

  // ── Booking ──
  const agencyOrgs = parseOrgs(s(inputs.booking_agent)).slice(0, MAX_SLOTS);
  const agentLinks: { id: string; role: string }[] = [];
  const agencyIds: string[] = [];
  for (const org of agencyOrgs) {
    const agency = org.name ? await findOrCreateOrg(sb, "agencies", org.name) : null;
    if (agency) { summary.agencies.push({ ...agency, territory: org.territory }); agencyIds.push(agency.id); }
    const entry: BookingEntry = { agency_id: agency?.id ?? "", agency_name: agency?.name ?? "", agent_selections: [] };
    for (const p of org.people) {
      const a = await findOrCreatePerson(sb, "agents", "agency_id", p.name, agency?.id ?? null);
      const role = agentRoleFor(org.territory, p.note);
      summary.agents.push({ ...a, agency: agency?.name ?? null, role });
      agentLinks.push({ id: a.id, role });
      entry.agent_selections.push({ agent_id: a.id, role, agent_name: a.name });
    }
    bookingEntries.push(entry);
  }

  // ── Artist links ──
  summary.artist_links_added += await linkArtist(sb, "artist_managers", "manager_id", artistId, managerLinks);
  summary.artist_links_added += await linkArtist(sb, "artist_agents", "agent_id", artistId, agentLinks);

  // ── Rosters ──
  await applyRosters(sb, summary, artistName, "manager", {
    flat: s(inputs.other_mgmt_artists), perPerson: s(inputs.manager_rosters),
    people: summary.managers, orgs: summary.management_companies,
  });
  await applyRosters(sb, summary, artistName, "agent", {
    flat: s(inputs.other_agent_artists), perPerson: s(inputs.agent_rosters),
    people: summary.agents, orgs: summary.agencies,
  });

  return { summary, managementEntries, bookingEntries };
}

// ── Rosters ──────────────────────────────────────────────────

/**
 * Roster rules (avoid cross-contaminating rosters):
 *  - Per-person blocks ("Person: a, b; Person 2: c") go to exactly that person —
 *    one of the people in this call, or a unique match by name in the database.
 *  - A flat list (other_*_artists) only applies when it's unambiguous: exactly
 *    one person in this call, or no people and exactly one company/agency.
 */
async function applyRosters(
  sb: SB, summary: ContactsSummary, artistName: string, type: "manager" | "agent",
  src: { flat: string; perPerson: string; people: { id: string; name: string }[]; orgs: { id: string; name: string }[] }
) {
  const personCol = type === "manager" ? "manager_id" : "agent_id";
  const orgCol = type === "manager" ? "management_company_id" : "agency_id";
  const orgType = type === "manager" ? "management_company" : "agency";
  const flatField = type === "manager" ? "other_mgmt_artists" : "other_agent_artists";
  const blockField = type === "manager" ? "manager_rosters" : "agent_rosters";
  const people = dedupeBy(src.people, (p) => p.id);
  const add = async (
    personType: ContactsSummary["rosters"][number]["person_type"], col: typeof personCol | typeof orgCol,
    owner: { id: string; name: string }, names: string[]
  ) => {
    const added = await addRoster(sb, col, owner.id, names);
    summary.roster_artists_added += added;
    summary.rosters.push({ person_type: personType, name: owner.name, id: owner.id, added });
  };

  // Flat list
  const flat = parseArtistList(src.flat, artistName);
  if (flat.length) {
    if (people.length === 1) await add(type, personCol, people[0], flat);
    else if (people.length === 0 && src.orgs.length === 1) await add(orgType, orgCol, src.orgs[0], flat);
    else if (people.length > 1) {
      summary.roster_skipped.push(
        `${flatField} not applied: ${people.length} ${type}s (${people.map((p) => p.name).join(", ")}) — ` +
        `ambiguous. Send ${blockField} as "Name: artist, artist; Name 2: artist" instead.`
      );
    } else {
      summary.roster_skipped.push(`${flatField} not applied: no ${type} or single ${orgType.replace("_", " ")} to attach it to.`);
    }
  }

  // Per-person blocks
  const { rosters, invalid } = parseRosterBlocks(src.perPerson, artistName);
  for (const bad of invalid) summary.roster_skipped.push(`${blockField} block "${bad}" ignored: expected "Name: artist, artist".`);
  for (const r of rosters) {
    if (r.artists.length === 0) continue;
    let owner: { id: string; name: string } | undefined = people.find((p) => p.name.toLowerCase() === r.person.toLowerCase());
    if (!owner) {
      const { data, error } = await sb.from(type === "manager" ? "managers" : "agents")
        .select("id, name").ilike("name", escapeLike(r.person));
      if (error) throw error;
      if ((data ?? []).length === 1) owner = { id: data![0].id as string, name: data![0].name as string };
      else {
        summary.roster_skipped.push(
          (data ?? []).length === 0
            ? `${blockField}: no ${type} named "${r.person}" — add them via ${type === "manager" ? "manager_names" : "booking_agent"} first.`
            : `${blockField}: ${data!.length} ${type}s named "${r.person}" — ambiguous, not applied.`
        );
        continue;
      }
    }
    await add(type, personCol, owner, r.artists);
  }
}

// ── Draft inputs ─────────────────────────────────────────────

/**
 * Merge linked contacts into a draft's inputs so the wizard opens with them
 * selected. Existing selections are kept; empty placeholder slots are dropped.
 */
export function applyContactEntries(
  inputs: Record<string, unknown>, managementEntries: ManagementEntry[], bookingEntries: BookingEntry[]
) {
  const mgmt = mergeEntries(
    (inputs.management_entries as ManagementEntry[] | undefined) ?? [], managementEntries,
    (e) => e.company_id || `name:${e.company_name.toLowerCase()}`,
    (e) => e.manager_selections, (e, sel) => ({ ...e, manager_selections: sel }), (x) => x.manager_id
  );
  const booking = mergeEntries(
    (inputs.booking_entries as BookingEntry[] | undefined) ?? [], bookingEntries,
    (e) => e.agency_id || `name:${e.agency_name.toLowerCase()}`,
    (e) => e.agent_selections, (e, sel) => ({ ...e, agent_selections: sel }), (x) => x.agent_id
  );
  if (managementEntries.length) {
    inputs.management_entries = mgmt;
    inputs.management_company_id = mgmt[0]?.company_id ?? "";
    inputs.manager_selections = mgmt.flatMap((e) => e.manager_selections);
  }
  if (bookingEntries.length) {
    inputs.booking_entries = booking;
    inputs.booking_agency_id = booking[0]?.agency_id ?? "";
    inputs.agent_selections = booking.flatMap((e) => e.agent_selections);
  }
  return inputs;
}

function mergeEntries<E, P>(
  existing: E[], incoming: E[], key: (e: E) => string,
  sels: (e: E) => P[], withSels: (e: E, s: P[]) => E, personKey: (p: P) => string
): E[] {
  const out = new Map<string, E>();
  for (const e of [...existing, ...incoming]) {
    const k = key(e);
    if (k === "name:" && sels(e).length === 0) continue; // empty wizard slot
    const prev = out.get(k);
    out.set(k, prev ? withSels(prev, dedupeBy([...sels(prev), ...sels(e)], personKey)) : e);
  }
  return Array.from(out.values()).slice(0, MAX_SLOTS);
}

function dedupeBy<T>(xs: T[], key: (x: T) => string): T[] {
  const seen = new Set<string>();
  return xs.filter((x) => (seen.has(key(x)) ? false : (seen.add(key(x)), true)));
}
