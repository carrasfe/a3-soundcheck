"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Select } from "../ui";
import type { EvalFormData, StepProps, ManagerSelection, AgentSelection } from "../types";
import {
  getContactsForForm,
  createManagementCompany,
  createManager,
  createAgency,
  createAgent,
  getKnownArtistsForManagerIds,
  getKnownArtistsForAgentIds,
  addKnownArtists,
  removeKnownArtist,
} from "@/app/contacts/actions";
import type { KnownArtistRow } from "@/app/contacts/actions";

const GENRES = [
  "Rock / Alt / Indie", "Country / Americana", "Metal / Hard Rock", "Pop",
  "Punk / Hardcore / Pop-Punk / Emo", "Southern Rock / Blues Rock",
  "Progressive Rock / Prog Metal", "EDM / Dance / Electronic", "Hip-Hop / Rap",
  "R&B / Soul", "Latin / Regional Mexican", "Christian / Gospel / Worship",
  "Folk / Singer-Songwriter", "Bluegrass / Roots", "Jam Band / Jam Rock",
  "K-Pop / J-Pop / J-Rock", "Reggae / Ska", "Jazz / Blues (Traditional)",
  "Broadway / Theater",
];

const VIP_OPTIONS = [
  { value: "none",          label: "No VIP — never offered" },
  { value: "offered_before",label: "Has offered VIP in the past" },
  { value: "basic",         label: "Currently runs basic VIP" },
  { value: "premium_mg",   label: "Runs premium VIP (M&G / soundcheck)" },
  { value: "tiered_high",  label: "Runs tiered VIP with high-price options" },
];

const MANAGER_ROLES = ["Lead", "Day-to-Day", "A&R"];
const AGENT_ROLES = ["Primary", "Secondary", "Festivals"];

// ─── Inline create form ───────────────────────────────────────

function InlineCreate({
  label,
  fields,
  onSave,
  onCancel,
  saving,
  error,
}: {
  label: string;
  fields: { name: string; placeholder: string; type?: string }[];
  onSave: (values: Record<string, string>) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
}) {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(fields.map((f) => [f.name, ""]))
  );
  return (
    <div className="mt-2 rounded-lg border border-[#C0392B]/20 bg-[#C0392B]/5 p-3 space-y-2">
      <p className="text-xs font-semibold text-[#C0392B]">{label}</p>
      {fields.map((f) => (
        <input
          key={f.name}
          type={f.type ?? "text"}
          placeholder={f.placeholder}
          value={values[f.name]}
          onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
          className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm outline-none focus:border-[#C0392B] focus:ring-1 focus:ring-[#C0392B]"
        />
      ))}
      {error && <p className="text-xs text-[#C0392B]">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={saving || !values[fields[0].name]?.trim()}
          onClick={() => onSave(values)}
          className="rounded bg-[#C0392B] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#a93226] disabled:opacity-50"
        >
          {saving ? "Saving…" : "Add"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Combobox ─────────────────────────────────────────────────

function Combobox({
  label,
  value,
  options,
  placeholder = "Search or select…",
  onChange,
  onAddNew,
}: {
  label: string;
  value: string;
  options: { id: string; name: string }[];
  placeholder?: string;
  onChange: (id: string, name: string) => void;
  onAddNew: () => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selectedOption = options.find((o) => o.id === value);

  const filtered = query
    ? options.filter((o) => o.name.toLowerCase().includes(query.toLowerCase()))
    : options;

  useEffect(() => {
    function onOut(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        if (!selectedOption) setQuery("");
      }
    }
    document.addEventListener("mousedown", onOut);
    return () => document.removeEventListener("mousedown", onOut);
  }, [selectedOption]);

  return (
    <div className="flex flex-col gap-1" ref={ref}>
      <label className="text-sm font-medium text-gray-700">{label}</label>
      <div className="relative">
        <input
          type="text"
          value={open ? query : (selectedOption?.name ?? "")}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => { setOpen(true); if (selectedOption) setQuery(""); }}
          placeholder={placeholder}
          className="w-full rounded-md border border-gray-300 px-3 py-2 pr-8 text-sm shadow-sm outline-none transition focus:border-[#C0392B] focus:ring-1 focus:ring-[#C0392B]"
        />
        {value && (
          <button
            type="button"
            onClick={() => { onChange("", ""); setQuery(""); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        )}
        {open && (
          <div className="absolute z-20 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg">
            <ul className="max-h-48 overflow-y-auto py-1">
              {filtered.map((opt) => (
                <li key={opt.id}>
                  <button
                    type="button"
                    onMouseDown={() => { onChange(opt.id, opt.name); setQuery(""); setOpen(false); }}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-[#1B2A4A]/5"
                  >
                    {opt.name}
                  </button>
                </li>
              ))}
              {filtered.length === 0 && (
                <li className="px-3 py-2 text-sm text-gray-400 italic">No matches</li>
              )}
            </ul>
            <div className="border-t border-gray-100 p-1">
              <button
                type="button"
                onMouseDown={() => { setOpen(false); onAddNew(); }}
                className="w-full rounded px-3 py-2 text-left text-xs font-semibold text-[#C0392B] hover:bg-[#C0392B]/5"
              >
                + Add New{query ? ` "${query}"` : ""}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Person multi-select ──────────────────────────────────────

function PersonSelect({
  label,
  companyId,
  allPersons,
  selections,
  roles,
  maxSelections,
  onAdd,
  onRemove,
  onRoleChange,
  onAddNew,
}: {
  label: string;
  companyId: string;
  allPersons: { id: string; name: string; company_id: string | null }[];
  selections: { id: string; name: string; role: string }[];
  roles: string[];
  maxSelections: number;
  onAdd: (id: string, name: string) => void;
  onRemove: (id: string) => void;
  onRoleChange: (id: string, role: string) => void;
  onAddNew: () => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const inScope = companyId
    ? allPersons.filter((p) => p.company_id === companyId)
    : allPersons;
  const available = inScope.filter((p) => !selections.find((s) => s.id === p.id));
  const filtered = query
    ? available.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()))
    : available;

  useEffect(() => {
    function onOut(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onOut);
    return () => document.removeEventListener("mousedown", onOut);
  }, []);

  return (
    <div className="flex flex-col gap-2" ref={ref}>
      <label className="text-sm font-medium text-gray-700">{label}</label>
      {selections.map((s) => (
        <div key={s.id} className="flex items-center gap-2 rounded-lg border border-[#1B2A4A]/20 bg-[#1B2A4A]/5 px-3 py-2">
          <span className="flex-1 text-sm font-medium text-[#1B2A4A]">{s.name}</span>
          <select
            value={s.role}
            onChange={(e) => onRoleChange(s.id, e.target.value)}
            className="rounded border border-gray-300 px-2 py-1 text-xs outline-none focus:border-[#C0392B]"
          >
            {roles.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <button type="button" onClick={() => onRemove(s.id)} className="text-gray-400 hover:text-[#C0392B]">✕</button>
        </div>
      ))}
      {selections.length < maxSelections && (
        <div className="relative">
          <input
            type="text"
            value={query}
            onFocus={() => setOpen(true)}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            placeholder={companyId ? "Add a person…" : "Select a company/agency first, or search all…"}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm outline-none transition focus:border-[#C0392B] focus:ring-1 focus:ring-[#C0392B]"
          />
          {open && (
            <div className="absolute z-20 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg">
              <ul className="max-h-40 overflow-y-auto py-1">
                {filtered.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onMouseDown={() => { onAdd(p.id, p.name); setQuery(""); setOpen(false); }}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-[#1B2A4A]/5"
                    >
                      {p.name}
                    </button>
                  </li>
                ))}
                {filtered.length === 0 && (
                  <li className="px-3 py-2 text-sm text-gray-400 italic">No matches</li>
                )}
              </ul>
              <div className="border-t border-gray-100 p-1">
                <button
                  type="button"
                  onMouseDown={() => { setOpen(false); onAddNew(); }}
                  className="w-full rounded px-3 py-2 text-left text-xs font-semibold text-[#C0392B] hover:bg-[#C0392B]/5"
                >
                  + Add New Person
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {selections.length >= maxSelections && (
        <p className="text-xs text-gray-400">Maximum {maxSelections} reached.</p>
      )}
    </div>
  );
}

// ─── Known Artists inline section ────────────────────────────

function KnownArtistsInline({
  items,
  onAdd,
  onRemove,
  adding,
  addError,
}: {
  items: KnownArtistRow[];
  onAdd: (input: string) => Promise<void>;
  onRemove: (id: string) => void;
  adding: boolean;
  addError: string | null;
}) {
  const [input, setInput] = useState("");

  async function submit() {
    if (!input.trim()) return;
    await onAdd(input);
    setInput("");
  }

  if (items.length === 0 && !adding) {
    return (
      <div className="space-y-1">
        <p className="text-xs text-gray-500">Other artists on their roster:</p>
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
            placeholder="e.g. Arctic Monkeys, Royal Blood"
            className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm outline-none focus:border-[#C0392B] focus:ring-1 focus:ring-[#C0392B]"
          />
          <button
            type="button"
            onClick={submit}
            disabled={!input.trim()}
            className="rounded bg-[#1B2A4A] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#243561] disabled:opacity-40"
          >
            Add
          </button>
        </div>
        {addError && <p className="text-xs text-[#C0392B]">{addError}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-gray-500">Other artists on their roster:</p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <span
            key={item.id}
            className="flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs text-gray-700"
          >
            {item.matched_artist_id ? (
              <Link href={`/artists/${item.matched_artist_id}`} className="font-medium text-[#1B2A4A] hover:underline">
                {item.name}
              </Link>
            ) : (
              <span>{item.name}</span>
            )}
            <button
              type="button"
              onClick={() => onRemove(item.id)}
              className="ml-0.5 text-gray-400 hover:text-[#C0392B]"
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
          placeholder="Add more names (comma-separated)…"
          className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm outline-none focus:border-[#C0392B] focus:ring-1 focus:ring-[#C0392B]"
          disabled={adding}
        />
        <button
          type="button"
          onClick={submit}
          disabled={adding || !input.trim()}
          className="rounded bg-[#1B2A4A] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#243561] disabled:opacity-40"
        >
          {adding ? "…" : "Add"}
        </button>
      </div>
      {addError && <p className="text-xs text-[#C0392B]">{addError}</p>}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────

export default function Step1ArtistInfo({ data, onChange, errors }: StepProps) {
  const set = (key: keyof EvalFormData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      onChange({ [key]: e.target.value });

  // Safe accessors — guard against undefined when loading old evaluations
  const managerSelections: ManagerSelection[] = data.manager_selections ?? [];
  const agentSelections: AgentSelection[] = data.agent_selections ?? [];

  // Contact lookup data
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [agencies, setAgencies] = useState<{ id: string; name: string }[]>([]);
  const [managers, setManagers] = useState<{ id: string; name: string; company_id: string | null }[]>([]);
  const [agents, setAgents] = useState<{ id: string; name: string; company_id: string | null }[]>([]);

  useEffect(() => {
    getContactsForForm().then((d) => {
      setCompanies(d.management_companies);
      setAgencies(d.agencies);
      setManagers(d.managers.map((m) => ({ id: m.id, name: m.name, company_id: m.management_company_id })));
      setAgents(d.agents.map((a) => ({ id: a.id, name: a.name, company_id: a.agency_id })));
    }).catch(() => {});
  }, []);

  // Known artists
  const [mgmtKnownArtists, setMgmtKnownArtists] = useState<KnownArtistRow[]>([]);
  const [agentKnownArtists, setAgentKnownArtists] = useState<KnownArtistRow[]>([]);
  const [addingMgmt, setAddingMgmt] = useState(false);
  const [addingAgent, setAddingAgent] = useState(false);
  const [mgmtAddError, setMgmtAddError] = useState<string | null>(null);
  const [agentAddError, setAgentAddError] = useState<string | null>(null);

  // Fetch known artists when manager selections change
  const mgmtKey = managerSelections.map((s) => s.manager_id).join(",");
  useEffect(() => {
    const ids = managerSelections.map((s) => s.manager_id);
    if (ids.length === 0) { setMgmtKnownArtists([]); return; }
    getKnownArtistsForManagerIds(ids).then(setMgmtKnownArtists).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mgmtKey]);

  const agentKey = agentSelections.map((s) => s.agent_id).join(",");
  useEffect(() => {
    const ids = agentSelections.map((s) => s.agent_id);
    if (ids.length === 0) { setAgentKnownArtists([]); return; }
    getKnownArtistsForAgentIds(ids).then(setAgentKnownArtists).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentKey]);

  // Inline create states
  const [showNewCompany, setShowNewCompany] = useState(false);
  const [showNewManager, setShowNewManager] = useState(false);
  const [showNewAgency, setShowNewAgency] = useState(false);
  const [showNewAgent, setShowNewAgent] = useState(false);
  const [inlineSaving, setInlineSaving] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);

  // Derived: selected person objects for display
  const selectedManagers = managerSelections.map((s) => ({
    id: s.manager_id,
    name: managers.find((m) => m.id === s.manager_id)?.name ?? s.manager_id,
    role: s.role,
  }));
  const selectedAgents = agentSelections.map((s) => ({
    id: s.agent_id,
    name: agents.find((a) => a.id === s.agent_id)?.name ?? s.agent_id,
    role: s.role,
  }));

  // ── Known artists handlers ─────────────────────────────────

  async function handleAddMgmtKnownArtists(input: string) {
    const names = input.split(",").map((n) => n.trim()).filter(Boolean);
    if (names.length === 0) return;
    setAddingMgmt(true);
    setMgmtAddError(null);
    const results: KnownArtistRow[] = [];
    for (const sel of managerSelections) {
      const { items, error } = await addKnownArtists(names, { managerId: sel.manager_id });
      if (error) { setMgmtAddError(error); setAddingMgmt(false); return; }
      results.push(...items);
    }
    // Deduplicate by id
    setMgmtKnownArtists((prev) => {
      const existing = new Set(prev.map((i) => i.id));
      return [...prev, ...results.filter((i) => !existing.has(i.id))];
    });
    setAddingMgmt(false);
  }

  async function handleAddAgentKnownArtists(input: string) {
    const names = input.split(",").map((n) => n.trim()).filter(Boolean);
    if (names.length === 0) return;
    setAddingAgent(true);
    setAgentAddError(null);
    const results: KnownArtistRow[] = [];
    for (const sel of agentSelections) {
      const { items, error } = await addKnownArtists(names, { agentId: sel.agent_id });
      if (error) { setAgentAddError(error); setAddingAgent(false); return; }
      results.push(...items);
    }
    setAgentKnownArtists((prev) => {
      const existing = new Set(prev.map((i) => i.id));
      return [...prev, ...results.filter((i) => !existing.has(i.id))];
    });
    setAddingAgent(false);
  }

  // ── Person create handlers ─────────────────────────────────

  async function handleCreateCompany(values: Record<string, string>) {
    setInlineSaving(true); setInlineError(null);
    const { id, error } = await createManagementCompany({ name: values.name, website: values.website });
    setInlineSaving(false);
    if (error) { setInlineError(error); return; }
    setCompanies((prev) => [...prev, { id: id!, name: values.name }].sort((a, b) => a.name.localeCompare(b.name)));
    onChange({ management_company_id: id!, management_company: values.name, manager_selections: [] });
    setShowNewCompany(false); setInlineError(null);
  }

  async function handleCreateManager(values: Record<string, string>) {
    setInlineSaving(true); setInlineError(null);
    const { id, error } = await createManager({
      name: values.name,
      management_company_id: data.management_company_id || null,
      email: values.email, phone: values.phone,
    });
    setInlineSaving(false);
    if (error) { setInlineError(error); return; }
    setManagers((prev) => [...prev, { id: id!, name: values.name, company_id: data.management_company_id || null }].sort((a, b) => a.name.localeCompare(b.name)));
    onChange({ manager_selections: [...managerSelections, { manager_id: id!, role: "Lead" }] });
    setShowNewManager(false); setInlineError(null);
  }

  async function handleCreateAgency(values: Record<string, string>) {
    setInlineSaving(true); setInlineError(null);
    const { id, error } = await createAgency({ name: values.name, website: values.website });
    setInlineSaving(false);
    if (error) { setInlineError(error); return; }
    setAgencies((prev) => [...prev, { id: id!, name: values.name }].sort((a, b) => a.name.localeCompare(b.name)));
    onChange({ booking_agency_id: id!, booking_agent: values.name, agent_selections: [] });
    setShowNewAgency(false); setInlineError(null);
  }

  async function handleCreateAgent(values: Record<string, string>) {
    setInlineSaving(true); setInlineError(null);
    const { id, error } = await createAgent({
      name: values.name,
      agency_id: data.booking_agency_id || null,
      email: values.email, phone: values.phone,
    });
    setInlineSaving(false);
    if (error) { setInlineError(error); return; }
    setAgents((prev) => [...prev, { id: id!, name: values.name, company_id: data.booking_agency_id || null }].sort((a, b) => a.name.localeCompare(b.name)));
    onChange({ agent_selections: [...agentSelections, { agent_id: id!, role: "Primary" }] });
    setShowNewAgent(false); setInlineError(null);
  }

  return (
    <div className="space-y-8">
      {/* Core identity */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[#1B2A4A]">
          Artist Identity
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">
              Artist Name<span className="ml-0.5 text-[#C0392B]">*</span>
            </label>
            <input
              value={data.artist_name}
              onChange={set("artist_name")}
              placeholder="e.g. The Marias"
              className={`rounded-md border px-3 py-2 text-sm shadow-sm outline-none transition focus:border-[#C0392B] focus:ring-1 focus:ring-[#C0392B] ${errors.artist_name ? "border-[#C0392B]" : "border-gray-300"}`}
            />
            {errors.artist_name && <p className="text-xs text-[#C0392B]">{errors.artist_name}</p>}
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">
              Genre<span className="ml-0.5 text-[#C0392B]">*</span>
            </label>
            <select
              value={data.genre}
              onChange={set("genre")}
              className={`rounded-md border px-3 py-2 text-sm shadow-sm outline-none transition focus:border-[#C0392B] focus:ring-1 focus:ring-[#C0392B] ${errors.genre ? "border-red-400" : "border-gray-300"}`}
            >
              <option value="">Select genre…</option>
              {GENRES.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
            {errors.genre && <p className="text-xs text-[#C0392B]">{errors.genre}</p>}
          </div>
        </div>
      </section>

      {/* Management */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[#1B2A4A]">
          Management
        </h3>
        <div className="space-y-4">
          <Combobox
            label="Management Company"
            value={data.management_company_id ?? ""}
            options={companies}
            placeholder="Search companies…"
            onChange={(id, name) => onChange({ management_company_id: id, management_company: name, manager_selections: [] })}
            onAddNew={() => { setShowNewCompany(true); setInlineError(null); }}
          />
          {showNewCompany && (
            <InlineCreate
              label="New Management Company"
              fields={[
                { name: "name", placeholder: "Company name *" },
                { name: "website", placeholder: "Website (optional)" },
              ]}
              onSave={handleCreateCompany}
              onCancel={() => { setShowNewCompany(false); setInlineError(null); }}
              saving={inlineSaving}
              error={inlineError}
            />
          )}

          <PersonSelect
            label="Manager(s)"
            companyId={data.management_company_id ?? ""}
            allPersons={managers}
            selections={selectedManagers}
            roles={MANAGER_ROLES}
            maxSelections={3}
            onAdd={(id, name) => {
              if (managerSelections.length >= 3) return;
              onChange({ manager_selections: [...managerSelections, { manager_id: id, role: "Lead" }] });
            }}
            onRemove={(id) => onChange({ manager_selections: managerSelections.filter((s) => s.manager_id !== id) })}
            onRoleChange={(id, role) => onChange({ manager_selections: managerSelections.map((s) => s.manager_id === id ? { ...s, role } : s) })}
            onAddNew={() => { setShowNewManager(true); setInlineError(null); }}
          />
          {showNewManager && (
            <InlineCreate
              label="New Manager"
              fields={[
                { name: "name", placeholder: "Full name *" },
                { name: "email", placeholder: "Email (optional)", type: "email" },
                { name: "phone", placeholder: "Phone (optional)" },
              ]}
              onSave={handleCreateManager}
              onCancel={() => { setShowNewManager(false); setInlineError(null); }}
              saving={inlineSaving}
              error={inlineError}
            />
          )}

          {/* Known artists for this manager — replaces free-text field */}
          {managerSelections.length > 0 && (
            <KnownArtistsInline
              items={mgmtKnownArtists}
              onAdd={handleAddMgmtKnownArtists}
              onRemove={(id) => {
                setMgmtKnownArtists((prev) => prev.filter((i) => i.id !== id));
                removeKnownArtist(id).catch(() => {});
              }}
              adding={addingMgmt}
              addError={mgmtAddError}
            />
          )}
        </div>
      </section>

      {/* Booking */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[#1B2A4A]">
          Booking
        </h3>
        <div className="space-y-4">
          <Combobox
            label="Booking Agency"
            value={data.booking_agency_id ?? ""}
            options={agencies}
            placeholder="Search agencies…"
            onChange={(id, name) => onChange({ booking_agency_id: id, booking_agent: name, agent_selections: [] })}
            onAddNew={() => { setShowNewAgency(true); setInlineError(null); }}
          />
          {showNewAgency && (
            <InlineCreate
              label="New Booking Agency"
              fields={[
                { name: "name", placeholder: "Agency name *" },
                { name: "website", placeholder: "Website (optional)" },
              ]}
              onSave={handleCreateAgency}
              onCancel={() => { setShowNewAgency(false); setInlineError(null); }}
              saving={inlineSaving}
              error={inlineError}
            />
          )}

          <PersonSelect
            label="Agent(s)"
            companyId={data.booking_agency_id ?? ""}
            allPersons={agents}
            selections={selectedAgents}
            roles={AGENT_ROLES}
            maxSelections={3}
            onAdd={(id, name) => {
              if (agentSelections.length >= 3) return;
              onChange({ agent_selections: [...agentSelections, { agent_id: id, role: "Primary" }] });
            }}
            onRemove={(id) => onChange({ agent_selections: agentSelections.filter((s) => s.agent_id !== id) })}
            onRoleChange={(id, role) => onChange({ agent_selections: agentSelections.map((s) => s.agent_id === id ? { ...s, role } : s) })}
            onAddNew={() => { setShowNewAgent(true); setInlineError(null); }}
          />
          {showNewAgent && (
            <InlineCreate
              label="New Agent"
              fields={[
                { name: "name", placeholder: "Full name *" },
                { name: "email", placeholder: "Email (optional)", type: "email" },
                { name: "phone", placeholder: "Phone (optional)" },
              ]}
              onSave={handleCreateAgent}
              onCancel={() => { setShowNewAgent(false); setInlineError(null); }}
              saving={inlineSaving}
              error={inlineError}
            />
          )}

          {agentSelections.length > 0 && (
            <KnownArtistsInline
              items={agentKnownArtists}
              onAdd={handleAddAgentKnownArtists}
              onRemove={(id) => {
                setAgentKnownArtists((prev) => prev.filter((i) => i.id !== id));
                removeKnownArtist(id).catch(() => {});
              }}
              adding={addingAgent}
              addError={agentAddError}
            />
          )}
        </div>
      </section>

      {/* Merch & VIP */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[#1B2A4A]">
          Merch & VIP
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Current Merch Provider</label>
            <input
              value={data.merch_provider}
              onChange={set("merch_provider")}
              placeholder="e.g. Bravado, Live Nation Merchandise"
              className="rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm outline-none transition focus:border-[#C0392B] focus:ring-1 focus:ring-[#C0392B]"
            />
          </div>
          <Select label="VIP / M&G Program" value={data.vip_level} onChange={set("vip_level")}>
            {VIP_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </div>
      </section>
    </div>
  );
}
