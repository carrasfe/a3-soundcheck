"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ArtistDetail, ArtistRef, RosterEntry } from "@/app/artists/[id]/page";
import { linkArtistTeam, type TeamSelection } from "@/app/artists/actions";
import { getContactsForForm } from "@/app/contacts/actions";

const A3_GREEN = "#27AE60";

/** Agencies have no territory of their own — derive it from the agents' booking roles. */
const ROLE_TERRITORY: Record<string, string> = {
  "US Booking": "North America",
  "UK/EU Booking": "UK/EU",
  Global: "Worldwide",
  Festivals: "Festivals",
};

type Person = { id: string; name: string; role: string };

// ─── Person row ───────────────────────────────────────────────

function PersonRow({
  person, kind, a3, roster,
}: {
  person: Person;
  kind: "manager" | "agent";
  a3: ArtistRef[] | undefined;
  roster: RosterEntry[] | undefined;
}) {
  const [open, setOpen] = useState(false);
  const count = roster?.length ?? 0;
  const href = kind === "manager" ? `/contacts/managers/${person.id}` : `/contacts/agents/${person.id}`;

  return (
    <div className="py-1.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Link href={href} className="text-sm font-semibold text-gray-900 hover:text-[#001489] hover:underline">
          {person.name}
        </Link>
        {person.role && <span className="text-xs text-gray-400">{person.role}</span>}
        {a3 && a3.length > 0 && (
          <span
            className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
            style={{ backgroundColor: A3_GREEN }}
          >
            A3 Connection
          </span>
        )}
      </div>

      {a3 && a3.length > 0 && (
        <p className="mt-0.5 text-xs text-gray-600">
          {kind === "manager" ? "Also manages" : "Also books"}:{" "}
          {a3.map((a, i) => (
            <span key={a.id || a.name}>
              {i > 0 && ", "}
              {a.id ? (
                <Link href={`/artists/${a.id}`} className="font-medium hover:underline" style={{ color: A3_GREEN }}>
                  {a.name}
                </Link>
              ) : (
                <span className="font-medium" style={{ color: A3_GREEN }}>{a.name}</span>
              )}
            </span>
          ))}
        </p>
      )}

      {count > 0 ? (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="mt-0.5 text-xs text-gray-400 transition hover:text-[#001489]"
        >
          Roster: {count} artist{count === 1 ? "" : "s"} {open ? "▴" : "▾"}
        </button>
      ) : (
        <p className="mt-0.5 text-xs text-gray-300">No roster on file</p>
      )}

      {open && roster && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {[...roster]
            .sort((a, b) => Number(b.is_a3_client) - Number(a.is_a3_client) || a.name.localeCompare(b.name))
            .map((r) => {
              const cls = r.is_a3_client
                ? "border-[#27AE60]/40 bg-[#27AE60]/10 font-semibold text-[#1e8449]"
                : "border-gray-200 bg-gray-50 text-gray-600";
              const chip = (
                <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] ${cls}`}>
                  {r.name}
                  {r.is_a3_client && <span className="ml-1 text-[9px] font-bold">A3</span>}
                </span>
              );
              return r.artist_id ? (
                <Link key={r.name} href={`/artists/${r.artist_id}`} className="hover:opacity-80">{chip}</Link>
              ) : (
                <span key={r.name}>{chip}</span>
              );
            })}
        </div>
      )}
    </div>
  );
}

// ─── Org group (management company / agency) ──────────────────

function OrgGroup({
  org, orgHref, territory, people, kind, a3Map, rosters,
}: {
  org: { id: string; name: string } | null;
  orgHref: string | null;
  territory?: string | null;
  people: Person[];
  kind: "manager" | "agent";
  a3Map: Record<string, ArtistRef[]>;
  rosters: Record<string, RosterEntry[]>;
}) {
  const hasA3 = people.some((p) => (a3Map[p.id]?.length ?? 0) > 0);
  return (
    <div
      className={`rounded-lg border-l-4 py-1 pl-3 ${hasA3 ? "bg-[#27AE60]/[0.04]" : ""}`}
      style={{ borderLeftColor: hasA3 ? A3_GREEN : "transparent" }}
    >
      <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
        {org && orgHref ? (
          <Link href={orgHref} className="hover:text-[#001489] hover:underline">{org.name}</Link>
        ) : (
          <span className="italic font-medium normal-case text-gray-400">
            No {kind === "manager" ? "company" : "agency"} on file
          </span>
        )}
        {territory && <span className="ml-1 font-medium normal-case text-gray-400">({territory})</span>}
      </p>
      <div className="divide-y divide-gray-100">
        {people.map((p) => (
          <PersonRow key={p.id} person={p} kind={kind} a3={a3Map[p.id]} roster={rosters[p.id]} />
        ))}
      </div>
    </div>
  );
}

// ─── Team panel ───────────────────────────────────────────────

export default function TeamPanel({ artist }: { artist: ArtistDetail }) {
  const [linkOpen, setLinkOpen] = useState(false);
  const t = artist.team_text;
  const mgmtUnlinked = artist.management_groups.length === 0 && !!(t.management_company || t.manager_names);
  const bookingUnlinked = artist.booking_groups.length === 0 && !!t.booking_agent;

  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-100 px-6 py-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-[#001489]">Team</h2>
        {(artist.management_groups.length > 0 || artist.booking_groups.length > 0) && (
          <button
            type="button"
            onClick={() => setLinkOpen(true)}
            className="text-xs font-medium text-gray-400 transition hover:text-[#001489]"
          >
            + Link contact
          </button>
        )}
      </div>

      {(mgmtUnlinked || bookingUnlinked) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200 bg-amber-50 px-6 py-2.5">
          <p className="text-sm text-amber-800">Team info found in evaluation but not linked to contacts.</p>
          <button
            type="button"
            onClick={() => setLinkOpen(true)}
            className="rounded-md bg-amber-500 px-3 py-1 text-xs font-semibold text-white transition hover:bg-amber-600"
          >
            Link now
          </button>
        </div>
      )}

      <div className="grid gap-6 px-6 py-5 md:grid-cols-2">
        {/* Management */}
        <div>
          <h3 className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-[#001489]">
            <span className="h-3 w-1 rounded-full bg-[#C8102E]" aria-hidden /> Management
          </h3>
          {artist.management_groups.length > 0 ? (
            <div className="space-y-3">
              {artist.management_groups.map((g, i) => (
                <OrgGroup
                  key={g.company?.id ?? `none-${i}`}
                  org={g.company}
                  orgHref={g.company ? `/contacts/management/${g.company.id}` : null}
                  people={g.managers}
                  kind="manager"
                  a3Map={artist.a3_relationships.managers}
                  rosters={artist.rosters}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400">
              No management on file
              {mgmtUnlinked && (
                <span className="mt-0.5 block text-xs text-gray-400">
                  Evaluation: {[t.management_company, t.manager_names].filter(Boolean).join(" — ")}
                </span>
              )}
            </p>
          )}
        </div>

        {/* Booking */}
        <div>
          <h3 className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-[#001489]">
            <span className="h-3 w-1 rounded-full bg-[#C8102E]" aria-hidden /> Booking
          </h3>
          {artist.booking_groups.length > 0 ? (
            <div className="space-y-3">
              {artist.booking_groups.map((g, i) => {
                const territories = Array.from(new Set(g.agents.map((a) => ROLE_TERRITORY[a.role]).filter(Boolean)));
                return (
                  <OrgGroup
                    key={g.agency?.id ?? `none-${i}`}
                    org={g.agency}
                    orgHref={g.agency ? `/contacts/agencies/${g.agency.id}` : null}
                    territory={territories.join(", ") || null}
                    people={g.agents}
                    kind="agent"
                    a3Map={artist.a3_relationships.agents}
                    rosters={artist.rosters}
                  />
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-gray-400">
              No agent on file
              {bookingUnlinked && (
                <span className="mt-0.5 block text-xs text-gray-400">Evaluation: {t.booking_agent}</span>
              )}
            </p>
          )}
        </div>
      </div>

      {linkOpen && (
        <LinkTeamModal
          artist={artist}
          showManagement={mgmtUnlinked || artist.management_groups.length > 0 || !bookingUnlinked}
          showBooking={bookingUnlinked || artist.booking_groups.length > 0 || !mgmtUnlinked}
          onClose={() => setLinkOpen(false)}
        />
      )}
    </section>
  );
}

// ─── Link team modal ──────────────────────────────────────────

type Contacts = Awaited<ReturnType<typeof getContactsForForm>>;
type Picked = { key: string; label: string; org: string; sel: TeamSelection };

function PeoplePicker({
  kind, evalText, people, orgs, picked, setPicked,
}: {
  kind: "manager" | "agent";
  evalText: string | null;
  people: { id: string; name: string; org: string }[];
  orgs: string[];
  picked: Picked[];
  setPicked: (p: Picked[]) => void;
}) {
  const [q, setQ] = useState("");
  const [newName, setNewName] = useState("");
  const [newOrg, setNewOrg] = useState("");
  const orgLabel = kind === "manager" ? "Management company" : "Agency";
  const pickedIds = new Set(picked.map((p) => p.key));
  const listId = `orgs-${kind}`;

  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return people
      .filter((p) => !pickedIds.has(`id:${p.id}`))
      .filter((p) => p.name.toLowerCase().includes(s) || p.org.toLowerCase().includes(s))
      .slice(0, 8);
  }, [q, people, pickedIds]);

  const addNew = () => {
    const name = newName.trim();
    if (!name) return;
    const key = `new:${name.toLowerCase()}|${newOrg.trim().toLowerCase()}`;
    if (!pickedIds.has(key)) {
      setPicked([...picked, { key, label: name, org: newOrg.trim(), sel: { kind: "new", name, org: newOrg.trim() } }]);
    }
    setNewName("");
  };

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#001489]">
          {kind === "manager" ? "Management" : "Booking"}
        </h3>
        {evalText && <p className="ml-3 truncate text-xs text-gray-500" title={evalText}>Evaluation: {evalText}</p>}
      </div>

      {/* Selected */}
      {picked.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {picked.map((p) => (
            <span key={p.key} className="inline-flex items-center gap-1 rounded-full border border-[#001489]/20 bg-[#001489]/5 px-2.5 py-1 text-xs text-[#001489]">
              <span className="font-semibold">{p.label}</span>
              {p.org && <span className="text-[#001489]/60">· {p.org}</span>}
              {p.sel.kind === "new" && <span className="rounded bg-[#C8102E] px-1 text-[9px] font-bold text-white">NEW</span>}
              <button
                type="button"
                onClick={() => setPicked(picked.filter((x) => x.key !== p.key))}
                aria-label={`Remove ${p.label}`}
                className="ml-0.5 text-[#001489]/50 hover:text-[#C8102E]"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Search existing */}
      <div className="relative">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`Search existing ${kind}s by name or ${kind === "manager" ? "company" : "agency"}…`}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#001489] focus:outline-none focus:ring-1 focus:ring-[#001489]"
        />
        {matches.length > 0 && (
          <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg">
            {matches.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => {
                    setPicked([...picked, { key: `id:${p.id}`, label: p.name, org: p.org, sel: { kind: "existing", id: p.id } }]);
                    setQ("");
                  }}
                  className="flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-gray-50"
                >
                  <span className="font-medium text-gray-900">{p.name}</span>
                  <span className="truncate text-xs text-gray-400">{p.org || "—"}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {q.trim() && matches.length === 0 && (
          <p className="mt-1 text-xs text-gray-400">No existing {kind}s match — create one below.</p>
        )}
      </div>

      {/* Create new */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addNew(); } }}
          placeholder={`New ${kind} name`}
          className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-[#001489] focus:outline-none"
        />
        <input
          value={newOrg}
          onChange={(e) => setNewOrg(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addNew(); } }}
          list={listId}
          placeholder={`${orgLabel} (existing or new)`}
          className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-[#001489] focus:outline-none"
        />
        <datalist id={listId}>{orgs.map((o) => <option key={o} value={o} />)}</datalist>
        <button
          type="button"
          onClick={addNew}
          disabled={!newName.trim()}
          className="shrink-0 rounded-lg border border-[#001489] px-3 py-1.5 text-xs font-semibold text-[#001489] transition hover:bg-[#001489]/5 disabled:opacity-40"
        >
          + Create
        </button>
      </div>
    </div>
  );
}

function LinkTeamModal({
  artist, showManagement, showBooking, onClose,
}: {
  artist: ArtistDetail;
  showManagement: boolean;
  showBooking: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [contacts, setContacts] = useState<Contacts | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Pre-select contacts that fuzzy-matched the evaluation text
  const [managers, setManagers] = useState<Picked[]>(() =>
    artist.management_groups.length === 0
      ? artist.fuzzy_managers.map((m) => ({ key: `id:${m.id}`, label: m.name, org: artist.fuzzy_management_company?.name ?? "", sel: { kind: "existing", id: m.id } }))
      : []
  );
  const [agents, setAgents] = useState<Picked[]>(() =>
    artist.booking_groups.length === 0
      ? artist.fuzzy_agents.map((a) => ({ key: `id:${a.id}`, label: a.name, org: artist.fuzzy_booking_agency?.name ?? "", sel: { kind: "existing", id: a.id } }))
      : []
  );

  useEffect(() => {
    getContactsForForm().then(setContacts).catch((e) => setLoadError(String(e?.message ?? e)));
  }, []);

  const companyName = useMemo(() => new Map((contacts?.management_companies ?? []).map((c) => [c.id, c.name])), [contacts]);
  const agencyName = useMemo(() => new Map((contacts?.agencies ?? []).map((a) => [a.id, a.name])), [contacts]);
  const linkedIds = new Set([...artist.linked_managers, ...artist.linked_agents].map((p) => p.id));

  const managerPeople = useMemo(() => (contacts?.managers ?? [])
    .filter((m) => !linkedIds.has(m.id))
    .map((m) => ({ id: m.id, name: m.name, org: m.management_company_id ? companyName.get(m.management_company_id) ?? "" : "" })),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [contacts, companyName]);
  const agentPeople = useMemo(() => (contacts?.agents ?? [])
    .filter((a) => !linkedIds.has(a.id))
    .map((a) => ({ id: a.id, name: a.name, org: a.agency_id ? agencyName.get(a.agency_id) ?? "" : "" })),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [contacts, agencyName]);

  const total = managers.length + agents.length;
  const t = artist.team_text;

  const submit = () => {
    setError(null);
    start(async () => {
      const res = await linkArtistTeam(artist.id, {
        managers: managers.map((p) => p.sel),
        agents: agents.map((p) => p.sel),
      });
      if (res.error) { setError(res.error); return; }
      router.refresh();
      onClose();
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !pending) onClose(); }}
    >
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h2 className="text-base font-bold text-[#001489]">Link team to {artist.name}</h2>
            <p className="mt-0.5 text-xs text-gray-500">Search existing contacts or create new ones. Existing links are kept.</p>
          </div>
          <button type="button" onClick={onClose} disabled={pending} aria-label="Close" className="text-lg text-gray-400 hover:text-gray-600">✕</button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          {!contacts && !loadError && <p className="text-sm text-gray-400">Loading contacts…</p>}
          {loadError && <p className="text-sm text-[#C8102E]">Couldn&apos;t load contacts: {loadError}</p>}
          {contacts && (
            <>
              {showManagement && (
                <PeoplePicker
                  kind="manager"
                  evalText={[t.management_company, t.manager_names].filter(Boolean).join(" — ") || null}
                  people={managerPeople}
                  orgs={contacts.management_companies.map((c) => c.name)}
                  picked={managers}
                  setPicked={setManagers}
                />
              )}
              {showBooking && (
                <PeoplePicker
                  kind="agent"
                  evalText={t.booking_agent}
                  people={agentPeople}
                  orgs={contacts.agencies.map((a) => a.name)}
                  picked={agents}
                  setPicked={setAgents}
                />
              )}
              <p className="text-xs text-gray-400">
                Contacts link through people — to link a company or agency, add at least one manager or agent at it.
              </p>
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-gray-100 px-6 py-4">
          <p className="text-xs text-[#C8102E]">{error}</p>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} disabled={pending} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50">
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={total === 0 || pending}
              className="rounded-lg bg-[#C8102E] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#a60d26] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {pending ? "Linking…" : `Link ${total || ""} contact${total === 1 ? "" : "s"}`.replace("  ", " ")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
