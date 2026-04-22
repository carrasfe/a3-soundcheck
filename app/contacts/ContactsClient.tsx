"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type {
  ManagementCompanyRow,
  AgencyRow,
  ManagerRow,
  AgentRow,
  LinkedArtistRow,
} from "./actions";
import {
  createManagementCompany,
  updateManagementCompany,
  createAgency,
  updateAgency,
  createManager,
  updateManager,
  createAgent,
  updateAgent,
} from "./actions";

// ─── Tier badge ───────────────────────────────────────────────

function TierBadge({ tier }: { tier: string | null }) {
  if (!tier) return null;
  const n = parseInt(tier.replace(/\D.*/, ""));
  const color =
    n === 1 ? "bg-[#1B2A4A] text-white"
    : n === 2 ? "bg-[#1B2A4A]/70 text-white"
    : n === 3 ? "bg-gray-200 text-gray-700"
    : "bg-[#C0392B]/10 text-[#C0392B]";
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ${color}`}>
      {tier.replace(" — ", " ")}
    </span>
  );
}

function ScorePill({ score }: { score: number | null }) {
  if (score === null) return <span className="text-xs text-gray-400">—</span>;
  const color =
    score >= 4 ? "text-[#1B2A4A] font-bold"
    : score >= 3 ? "text-[#1B2A4A]/70 font-semibold"
    : score >= 2 ? "text-gray-500"
    : "text-[#C0392B]";
  return <span className={`text-xs ${color}`}>{score.toFixed(1)}</span>;
}

// ─── Artist chip ──────────────────────────────────────────────

function ArtistChip({ artist }: { artist: LinkedArtistRow }) {
  return (
    <Link
      href={`/artists/${artist.id}`}
      className="flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs text-[#1B2A4A] hover:border-[#1B2A4A]/30 hover:bg-white transition"
    >
      <span className="font-medium">{artist.name}</span>
      {artist.is_a3_client && (
        <span className="rounded px-1 py-0.5 text-[9px] font-bold bg-[#C0392B] text-white leading-none">A3</span>
      )}
      <span className="text-gray-400">·</span>
      <ScorePill score={artist.latest_score} />
      {artist.latest_tier && <TierBadge tier={artist.latest_tier} />}
    </Link>
  );
}

// ─── Modal ────────────────────────────────────────────────────

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h3 className="text-base font-semibold text-[#1B2A4A]">{title}</h3>
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

function FieldRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-600">{label}</label>
      {children}
    </div>
  );
}

const inputCls =
  "rounded-md border border-gray-300 px-3 py-2 text-sm outline-none transition focus:border-[#C0392B] focus:ring-1 focus:ring-[#C0392B]";

// ─── Person row inside a company card ─────────────────────────

function PersonRow({
  person,
  type,
  onEdit,
}: {
  person: ManagerRow | AgentRow;
  type: "manager" | "agent";
  onEdit: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const detailHref =
    type === "manager"
      ? `/contacts/managers/${person.id}`
      : `/contacts/agents/${person.id}`;
  const hasA3Rel = person.artists.some((a) => a.is_a3_client);
  return (
    <div className="border-t border-gray-100 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href={detailHref}
              className={`text-sm font-semibold hover:underline ${hasA3Rel ? "text-[#27AE60]" : "text-[#1B2A4A]"}`}
            >
              {person.name}
            </Link>
            {hasA3Rel && (
              <span className="rounded px-1.5 py-0.5 text-[9px] font-bold bg-[#27AE60] text-white leading-none tracking-wide">A3</span>
            )}
            {!person.is_active && (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">
                Inactive
              </span>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap gap-3 text-xs text-gray-500">
            {person.email && (
              <a href={`mailto:${person.email}`} className="hover:text-[#C0392B]">
                {person.email}
              </a>
            )}
            {person.phone && <span>{person.phone}</span>}
          </div>
          {person.artists.length > 0 && (
            <button
              onClick={() => setExpanded((x) => !x)}
              className="mt-1.5 text-xs text-gray-400 hover:text-[#1B2A4A]"
            >
              {person.artists.length} artist{person.artists.length !== 1 ? "s" : ""}
              {expanded ? " ▲" : " ▼"}
            </button>
          )}
          {expanded && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {person.artists.map((a) => (
                <ArtistChip key={a.id} artist={a} />
              ))}
            </div>
          )}
        </div>
        <button
          onClick={onEdit}
          className="shrink-0 rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:border-[#1B2A4A]/30 hover:bg-gray-50"
        >
          Edit
        </button>
      </div>
    </div>
  );
}

// ─── Company / Agency card ────────────────────────────────────

function CompanyCard({
  id,
  name,
  website,
  persons,
  type,
  onAddPerson,
  onEditPerson,
  onEditCompany,
}: {
  id: string;
  name: string;
  website: string | null;
  persons: (ManagerRow | AgentRow)[];
  type: "management" | "agency";
  onAddPerson: () => void;
  onEditPerson: (person: ManagerRow | AgentRow) => void;
  onEditCompany: () => void;
}) {
  const [open, setOpen] = useState(false);
  const detailHref =
    type === "management"
      ? `/contacts/management/${id}`
      : `/contacts/agencies/${id}`;

  const personLabel = type === "management" ? "manager" : "agent";
  const artistCount = Array.from(new Set(persons.flatMap((p) => p.artists.map((a) => a.id)))).length;
  const hasA3Rel = persons.some((p) => p.artists.some((a) => a.is_a3_client));

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between px-5 py-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {hasA3Rel && (
              <span
                title="A3 relationship — one or more contacts work with an A3 client"
                className="h-2 w-2 rounded-full flex-shrink-0 bg-[#27AE60]"
              />
            )}
            <Link
              href={detailHref}
              className="text-base font-semibold text-[#1B2A4A] hover:underline"
            >
              {name}
            </Link>
            {website && (
              <a
                href={website.startsWith("http") ? website : `https://${website}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-gray-400 hover:text-[#C0392B]"
              >
                ↗ {website.replace(/^https?:\/\//, "")}
              </a>
            )}
          </div>
          <p className="mt-0.5 text-xs text-gray-500">
            {persons.length} {personLabel}{persons.length !== 1 ? "s" : ""} · {artistCount} artist{artistCount !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={onEditCompany}
            className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:border-[#1B2A4A]/30 hover:bg-gray-50"
          >
            Edit
          </button>
          <button
            onClick={() => setOpen((x) => !x)}
            className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:border-[#1B2A4A]/30 hover:bg-gray-50"
          >
            {open ? "Collapse ▲" : `View ${personLabel}s ▼`}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-gray-100">
          {persons.map((p) => (
            <PersonRow
              key={p.id}
              person={p}
              type={type === "management" ? "manager" : "agent"}
              onEdit={() => onEditPerson(p)}
            />
          ))}
          <div className="px-4 py-3 border-t border-gray-50">
            <button
              onClick={onAddPerson}
              className="text-xs font-medium text-[#C0392B] hover:underline"
            >
              + Add {personLabel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────

interface Props {
  companies: ManagementCompanyRow[];
  unassignedManagers: ManagerRow[];
  agencies: AgencyRow[];
  unassignedAgents: AgentRow[];
  dbError: string | null;
}

// ─── Main component ───────────────────────────────────────────

export default function ContactsClient({
  companies,
  unassignedManagers,
  agencies,
  unassignedAgents,
  dbError,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [tab, setTab] = useState<"management" | "agents">("management");
  const [search, setSearch] = useState("");

  // Modal state
  type ModalType =
    | { kind: "addCompany" }
    | { kind: "editCompany"; id: string; name: string; website: string; notes: string }
    | { kind: "addAgency" }
    | { kind: "editAgency"; id: string; name: string; website: string; notes: string }
    | { kind: "addManager"; companyId: string; companyName: string }
    | { kind: "editManager"; manager: ManagerRow; allCompanies: { id: string; name: string }[] }
    | { kind: "addAgent"; agencyId: string; agencyName: string }
    | { kind: "editAgent"; agent: AgentRow; allAgencies: { id: string; name: string }[] };

  const [modal, setModal] = useState<ModalType | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = () => startTransition(() => router.refresh());
  const closeModal = () => { setModal(null); setFormError(null); };

  // ── Filter ─────────────────────────────────────────────────

  const q = search.toLowerCase();

  const filteredCompanies = companies.filter((c) => {
    if (!q) return true;
    if (c.name.toLowerCase().includes(q)) return true;
    return c.managers.some((m) => m.name.toLowerCase().includes(q));
  });

  const filteredAgencies = agencies.filter((ag) => {
    if (!q) return true;
    if (ag.name.toLowerCase().includes(q)) return true;
    return ag.agents.some((a) => a.name.toLowerCase().includes(q));
  });

  const filteredUnassignedManagers = unassignedManagers.filter(
    (m) => !q || m.name.toLowerCase().includes(q)
  );
  const filteredUnassignedAgents = unassignedAgents.filter(
    (a) => !q || a.name.toLowerCase().includes(q)
  );

  // ── Submit helpers ─────────────────────────────────────────

  async function handleSubmit(fn: () => Promise<{ error: string | null } | { id: string | null; error: string | null }>) {
    setSaving(true);
    setFormError(null);
    const result = await fn();
    setSaving(false);
    if (result.error) { setFormError(result.error); return; }
    closeModal();
    refresh();
  }

  // ── Modal forms ────────────────────────────────────────────

  function renderModal() {
    if (!modal) return null;

    if (modal.kind === "addCompany") {
      let name = "", website = "", notes = "";
      return (
        <Modal title="Add Management Company" onClose={closeModal}>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              name = fd.get("name") as string;
              website = fd.get("website") as string;
              notes = fd.get("notes") as string;
              handleSubmit(() => createManagementCompany({ name, website, notes }));
            }}
          >
            <FieldRow label="Company Name *">
              <input name="name" required className={inputCls} placeholder="e.g. Redlight Management" />
            </FieldRow>
            <FieldRow label="Website">
              <input name="website" className={inputCls} placeholder="e.g. redlightmanagement.com" />
            </FieldRow>
            <FieldRow label="Notes">
              <textarea name="notes" className={`${inputCls} resize-none`} rows={2} />
            </FieldRow>
            {formError && <p className="text-xs text-[#C0392B]">{formError}</p>}
            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-lg bg-[#C0392B] py-2 text-sm font-semibold text-white hover:bg-[#a93226] disabled:opacity-50"
            >
              {saving ? "Saving…" : "Add Company"}
            </button>
          </form>
        </Modal>
      );
    }

    if (modal.kind === "editCompany") {
      return (
        <Modal title="Edit Management Company" onClose={closeModal}>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              handleSubmit(() =>
                updateManagementCompany(modal.id, {
                  name: fd.get("name") as string,
                  website: fd.get("website") as string,
                  notes: fd.get("notes") as string,
                })
              );
            }}
          >
            <FieldRow label="Company Name *">
              <input name="name" required defaultValue={modal.name} className={inputCls} />
            </FieldRow>
            <FieldRow label="Website">
              <input name="website" defaultValue={modal.website} className={inputCls} />
            </FieldRow>
            <FieldRow label="Notes">
              <textarea name="notes" defaultValue={modal.notes} className={`${inputCls} resize-none`} rows={2} />
            </FieldRow>
            {formError && <p className="text-xs text-[#C0392B]">{formError}</p>}
            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-lg bg-[#C0392B] py-2 text-sm font-semibold text-white hover:bg-[#a93226] disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </form>
        </Modal>
      );
    }

    if (modal.kind === "addAgency") {
      return (
        <Modal title="Add Booking Agency" onClose={closeModal}>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              handleSubmit(() =>
                createAgency({
                  name: fd.get("name") as string,
                  website: fd.get("website") as string,
                  notes: fd.get("notes") as string,
                })
              );
            }}
          >
            <FieldRow label="Agency Name *">
              <input name="name" required className={inputCls} placeholder="e.g. WME, CAA" />
            </FieldRow>
            <FieldRow label="Website">
              <input name="website" className={inputCls} placeholder="e.g. wme.com" />
            </FieldRow>
            <FieldRow label="Notes">
              <textarea name="notes" className={`${inputCls} resize-none`} rows={2} />
            </FieldRow>
            {formError && <p className="text-xs text-[#C0392B]">{formError}</p>}
            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-lg bg-[#C0392B] py-2 text-sm font-semibold text-white hover:bg-[#a93226] disabled:opacity-50"
            >
              {saving ? "Saving…" : "Add Agency"}
            </button>
          </form>
        </Modal>
      );
    }

    if (modal.kind === "editAgency") {
      return (
        <Modal title="Edit Agency" onClose={closeModal}>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              handleSubmit(() =>
                updateAgency(modal.id, {
                  name: fd.get("name") as string,
                  website: fd.get("website") as string,
                  notes: fd.get("notes") as string,
                })
              );
            }}
          >
            <FieldRow label="Agency Name *">
              <input name="name" required defaultValue={modal.name} className={inputCls} />
            </FieldRow>
            <FieldRow label="Website">
              <input name="website" defaultValue={modal.website} className={inputCls} />
            </FieldRow>
            <FieldRow label="Notes">
              <textarea name="notes" defaultValue={modal.notes} className={`${inputCls} resize-none`} rows={2} />
            </FieldRow>
            {formError && <p className="text-xs text-[#C0392B]">{formError}</p>}
            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-lg bg-[#C0392B] py-2 text-sm font-semibold text-white hover:bg-[#a93226] disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </form>
        </Modal>
      );
    }

    if (modal.kind === "addManager") {
      return (
        <Modal title={`Add Manager to ${modal.companyName}`} onClose={closeModal}>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              handleSubmit(() =>
                createManager({
                  name: fd.get("name") as string,
                  management_company_id: modal.companyId || null,
                  email: fd.get("email") as string,
                  phone: fd.get("phone") as string,
                  notes: fd.get("notes") as string,
                })
              );
            }}
          >
            <FieldRow label="Name *">
              <input name="name" required className={inputCls} placeholder="e.g. Brant Weil" />
            </FieldRow>
            <FieldRow label="Email">
              <input name="email" type="email" className={inputCls} />
            </FieldRow>
            <FieldRow label="Phone">
              <input name="phone" className={inputCls} />
            </FieldRow>
            <FieldRow label="Notes">
              <textarea name="notes" className={`${inputCls} resize-none`} rows={2} />
            </FieldRow>
            {formError && <p className="text-xs text-[#C0392B]">{formError}</p>}
            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-lg bg-[#C0392B] py-2 text-sm font-semibold text-white hover:bg-[#a93226] disabled:opacity-50"
            >
              {saving ? "Saving…" : "Add Manager"}
            </button>
          </form>
        </Modal>
      );
    }

    if (modal.kind === "editManager") {
      const m = modal.manager;
      return (
        <Modal title="Edit Manager" onClose={closeModal}>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              handleSubmit(() =>
                updateManager(m.id, {
                  name: fd.get("name") as string,
                  management_company_id: (fd.get("company_id") as string) || null,
                  email: (fd.get("email") as string) || null,
                  phone: (fd.get("phone") as string) || null,
                  notes: (fd.get("notes") as string) || null,
                  is_active: fd.get("is_active") === "1",
                })
              );
            }}
          >
            <FieldRow label="Name *">
              <input name="name" required defaultValue={m.name} className={inputCls} />
            </FieldRow>
            <FieldRow label="Management Company">
              <select name="company_id" defaultValue={m.management_company_id ?? ""} className={inputCls}>
                <option value="">— Independent / None —</option>
                {modal.allCompanies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </FieldRow>
            <FieldRow label="Email">
              <input name="email" type="email" defaultValue={m.email ?? ""} className={inputCls} />
            </FieldRow>
            <FieldRow label="Phone">
              <input name="phone" defaultValue={m.phone ?? ""} className={inputCls} />
            </FieldRow>
            <FieldRow label="Notes">
              <textarea name="notes" defaultValue={m.notes ?? ""} className={`${inputCls} resize-none`} rows={2} />
            </FieldRow>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input name="is_active" type="checkbox" value="1" defaultChecked={m.is_active} className="h-4 w-4 accent-[#C0392B]" />
              Active
            </label>
            {formError && <p className="text-xs text-[#C0392B]">{formError}</p>}
            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-lg bg-[#C0392B] py-2 text-sm font-semibold text-white hover:bg-[#a93226] disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </form>
        </Modal>
      );
    }

    if (modal.kind === "addAgent") {
      return (
        <Modal title={`Add Agent to ${modal.agencyName}`} onClose={closeModal}>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              handleSubmit(() =>
                createAgent({
                  name: fd.get("name") as string,
                  agency_id: modal.agencyId || null,
                  email: fd.get("email") as string,
                  phone: fd.get("phone") as string,
                  notes: fd.get("notes") as string,
                })
              );
            }}
          >
            <FieldRow label="Name *">
              <input name="name" required className={inputCls} placeholder="e.g. Paul Wilson" />
            </FieldRow>
            <FieldRow label="Email">
              <input name="email" type="email" className={inputCls} />
            </FieldRow>
            <FieldRow label="Phone">
              <input name="phone" className={inputCls} />
            </FieldRow>
            <FieldRow label="Notes">
              <textarea name="notes" className={`${inputCls} resize-none`} rows={2} />
            </FieldRow>
            {formError && <p className="text-xs text-[#C0392B]">{formError}</p>}
            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-lg bg-[#C0392B] py-2 text-sm font-semibold text-white hover:bg-[#a93226] disabled:opacity-50"
            >
              {saving ? "Saving…" : "Add Agent"}
            </button>
          </form>
        </Modal>
      );
    }

    if (modal.kind === "editAgent") {
      const a = modal.agent;
      return (
        <Modal title="Edit Agent" onClose={closeModal}>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              handleSubmit(() =>
                updateAgent(a.id, {
                  name: fd.get("name") as string,
                  agency_id: (fd.get("agency_id") as string) || null,
                  email: (fd.get("email") as string) || null,
                  phone: (fd.get("phone") as string) || null,
                  notes: (fd.get("notes") as string) || null,
                  is_active: fd.get("is_active") === "1",
                })
              );
            }}
          >
            <FieldRow label="Name *">
              <input name="name" required defaultValue={a.name} className={inputCls} />
            </FieldRow>
            <FieldRow label="Agency">
              <select name="agency_id" defaultValue={a.agency_id ?? ""} className={inputCls}>
                <option value="">— Independent / None —</option>
                {modal.allAgencies.map((ag) => (
                  <option key={ag.id} value={ag.id}>{ag.name}</option>
                ))}
              </select>
            </FieldRow>
            <FieldRow label="Email">
              <input name="email" type="email" defaultValue={a.email ?? ""} className={inputCls} />
            </FieldRow>
            <FieldRow label="Phone">
              <input name="phone" defaultValue={a.phone ?? ""} className={inputCls} />
            </FieldRow>
            <FieldRow label="Notes">
              <textarea name="notes" defaultValue={a.notes ?? ""} className={`${inputCls} resize-none`} rows={2} />
            </FieldRow>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input name="is_active" type="checkbox" value="1" defaultChecked={a.is_active} className="h-4 w-4 accent-[#C0392B]" />
              Active
            </label>
            {formError && <p className="text-xs text-[#C0392B]">{formError}</p>}
            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-lg bg-[#C0392B] py-2 text-sm font-semibold text-white hover:bg-[#a93226] disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </form>
        </Modal>
      );
    }

    return null;
  }

  // ── Render ─────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[#1B2A4A]">Contacts</h1>
        <p className="mt-1 text-sm text-gray-500">
          Management companies, booking agencies, and the people within them.
        </p>
      </div>

      {dbError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Database error: {dbError}. Run the SQL migration in Supabase to create the contacts tables.
        </div>
      )}

      {/* Search + Tabs */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1 rounded-lg border border-gray-200 bg-gray-100 p-0.5">
          {(["management", "agents"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
                tab === t
                  ? "bg-white text-[#1B2A4A] shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {t === "management" ? "Management" : "Agents"}
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search companies, managers, agents…"
          className="w-full max-w-xs rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#C0392B] focus:ring-1 focus:ring-[#C0392B] sm:w-64"
        />
      </div>

      {/* Management tab */}
      {tab === "management" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">
              Management Companies
            </h2>
            <button
              onClick={() => setModal({ kind: "addCompany" })}
              className="rounded-lg bg-[#C0392B] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#a93226]"
            >
              + Add Management Company
            </button>
          </div>

          {filteredCompanies.length === 0 && !search && (
            <p className="text-sm text-gray-400 italic">No management companies yet. Add one above.</p>
          )}

          {filteredCompanies.map((c) => (
            <CompanyCard
              key={c.id}
              id={c.id}
              name={c.name}
              website={c.website}
              persons={c.managers}
              type="management"
              onAddPerson={() =>
                setModal({ kind: "addManager", companyId: c.id, companyName: c.name })
              }
              onEditPerson={(p) =>
                setModal({
                  kind: "editManager",
                  manager: p as ManagerRow,
                  allCompanies: companies.map((co) => ({ id: co.id, name: co.name })),
                })
              }
              onEditCompany={() =>
                setModal({
                  kind: "editCompany",
                  id: c.id,
                  name: c.name,
                  website: c.website ?? "",
                  notes: c.notes ?? "",
                })
              }
            />
          ))}

          {filteredUnassignedManagers.length > 0 && (
            <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50">
              <div className="px-5 py-3 text-sm font-semibold text-gray-500">
                Independent / No Company ({filteredUnassignedManagers.length})
              </div>
              {filteredUnassignedManagers.map((m) => (
                <PersonRow
                  key={m.id}
                  person={m}
                  type="manager"
                  onEdit={() =>
                    setModal({
                      kind: "editManager",
                      manager: m,
                      allCompanies: companies.map((c) => ({ id: c.id, name: c.name })),
                    })
                  }
                />
              ))}
            </div>
          )}

          {(filteredCompanies.length === 0 && filteredUnassignedManagers.length === 0 && search) && (
            <p className="text-sm text-gray-400 italic">No results for "{search}".</p>
          )}
        </div>
      )}

      {/* Agents tab */}
      {tab === "agents" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">
              Booking Agencies
            </h2>
            <button
              onClick={() => setModal({ kind: "addAgency" })}
              className="rounded-lg bg-[#C0392B] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#a93226]"
            >
              + Add Agency
            </button>
          </div>

          {filteredAgencies.length === 0 && !search && (
            <p className="text-sm text-gray-400 italic">No agencies yet. Add one above.</p>
          )}

          {filteredAgencies.map((ag) => (
            <CompanyCard
              key={ag.id}
              id={ag.id}
              name={ag.name}
              website={ag.website}
              persons={ag.agents}
              type="agency"
              onAddPerson={() =>
                setModal({ kind: "addAgent", agencyId: ag.id, agencyName: ag.name })
              }
              onEditPerson={(p) =>
                setModal({
                  kind: "editAgent",
                  agent: p as AgentRow,
                  allAgencies: agencies.map((a) => ({ id: a.id, name: a.name })),
                })
              }
              onEditCompany={() =>
                setModal({
                  kind: "editAgency",
                  id: ag.id,
                  name: ag.name,
                  website: ag.website ?? "",
                  notes: ag.notes ?? "",
                })
              }
            />
          ))}

          {filteredUnassignedAgents.length > 0 && (
            <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50">
              <div className="px-5 py-3 text-sm font-semibold text-gray-500">
                Independent / No Agency ({filteredUnassignedAgents.length})
              </div>
              {filteredUnassignedAgents.map((a) => (
                <PersonRow
                  key={a.id}
                  person={a}
                  type="agent"
                  onEdit={() =>
                    setModal({
                      kind: "editAgent",
                      agent: a,
                      allAgencies: agencies.map((ag) => ({ id: ag.id, name: ag.name })),
                    })
                  }
                />
              ))}
            </div>
          )}

          {(filteredAgencies.length === 0 && filteredUnassignedAgents.length === 0 && search) && (
            <p className="text-sm text-gray-400 italic">No results for "{search}".</p>
          )}
        </div>
      )}

      {isPending && (
        <div className="fixed bottom-4 right-4 rounded-lg bg-[#1B2A4A] px-3 py-2 text-xs text-white shadow-lg">
          Refreshing…
        </div>
      )}

      {renderModal()}
    </div>
  );
}
