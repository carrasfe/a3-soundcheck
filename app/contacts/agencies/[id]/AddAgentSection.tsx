"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createAgent } from "../../actions";
import type { AgentRow } from "../../actions";

const inputCls =
  "w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none transition focus:border-[#C8102E] focus:ring-1 focus:ring-[#C8102E]";

function TierBadge({ tier }: { tier: string | null }) {
  if (!tier) return null;
  const n = parseInt(tier.replace(/\D.*/, ""));
  const color =
    n === 1 ? "bg-[#001489] text-white"
    : n === 2 ? "bg-[#001489]/70 text-white"
    : n === 3 ? "bg-gray-200 text-gray-700"
    : "bg-[#C8102E]/10 text-[#C8102E]";
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ${color}`}>
      {tier.replace(" — ", " ")}
    </span>
  );
}

export default function AddAgentSection({
  initialAgents,
  agencyId,
}: {
  initialAgents: AgentRow[];
  agencyId: string;
}) {
  const router = useRouter();
  const agents = initialAgents;
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");

  function reset() {
    setName(""); setEmail(""); setPhone(""); setNotes(""); setError(null);
  }

  async function handleSubmit() {
    if (!name.trim()) { setError("Name is required"); return; }
    setSaving(true);
    setError(null);
    const result = await createAgent({
      name: name.trim(),
      agency_id: agencyId,
      email: email || undefined,
      phone: phone || undefined,
      notes: notes || undefined,
    });
    setSaving(false);
    if (result.error) { setError(result.error); return; }
    if (!result.id) { setError("Agent created, but no ID was returned — refresh to see it."); return; }
    // Redirect straight to the new agent's detail page so the user can
    // immediately paste in their roster.
    router.push(`/contacts/agents/${result.id}`);
  }

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">Agents</h2>
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="rounded border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:border-[#001489]/30 hover:bg-gray-50 hover:text-[#001489] transition"
          >
            + Add Agent
          </button>
        )}
      </div>

      {adding && (
        <div className="mb-4 rounded-xl border border-[#001489]/20 bg-white p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#001489]">New Agent</p>
            <button
              type="button"
              onClick={() => { setAdding(false); reset(); }}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              Cancel
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Name *</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                className={inputCls}
                autoFocus
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Phone</label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className={`${inputCls} resize-none`}
            />
          </div>
          {error && <p className="text-xs text-[#C8102E]">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving}
              className="rounded-lg bg-[#001489] px-4 py-2 text-sm font-semibold text-white hover:bg-[#001489]/90 disabled:opacity-50"
            >
              {saving ? "Adding…" : "Add Agent"}
            </button>
            <button
              type="button"
              onClick={() => { setAdding(false); reset(); }}
              disabled={saving}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-600 hover:border-gray-400 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {agents.length === 0 ? (
        <p className="text-sm text-gray-400 italic">No agents yet.</p>
      ) : (
        <div className="space-y-3">
          {agents.map((a) => (
            <div key={a.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Link href={`/contacts/agents/${a.id}`} className="text-base font-semibold text-[#001489] hover:underline">
                      {a.name}
                    </Link>
                    {!a.is_active && (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">Inactive</span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-3 text-sm text-gray-500">
                    {a.email && <a href={`mailto:${a.email}`} className="hover:text-[#C8102E]">{a.email}</a>}
                    {a.phone && <span>{a.phone}</span>}
                  </div>
                </div>
                <Link
                  href={`/contacts/agents/${a.id}`}
                  title="Edit agent"
                  className="shrink-0 rounded border border-gray-200 p-1.5 text-gray-400 hover:border-[#001489]/30 hover:bg-gray-50 hover:text-[#001489] transition"
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </Link>
              </div>
              {a.artists.length > 0 && (
                <div className="mt-3">
                  <p className="mb-2 text-xs font-medium text-gray-500">Soundcheck Artists</p>
                  <div className="space-y-1.5">
                    {a.artists.map((ar) => (
                      <div key={ar.id} className="flex items-center gap-3">
                        <Link href={`/artists/${ar.id}`} className="text-sm font-medium text-[#001489] hover:underline">
                          {ar.name}
                        </Link>
                        <span className="text-xs text-gray-400">{ar.role}</span>
                        {ar.latest_score !== null && (
                          <span className="text-xs font-semibold text-gray-600">{ar.latest_score.toFixed(1)}</span>
                        )}
                        <TierBadge tier={ar.latest_tier} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
