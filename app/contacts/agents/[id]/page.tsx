import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getAgentDetail, getKnownArtistsForAgent, getRosterCrossoverForAgent } from "../../actions";
import KnownArtistsSection from "../../KnownArtistsSection";

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

export default async function AgentDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ agent, error }, knownArtists, crossovers] = await Promise.all([
    getAgentDetail(params.id),
    getKnownArtistsForAgent(params.id),
    getRosterCrossoverForAgent(params.id),
  ]);
  if (error || !agent) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <nav className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/contacts" className="hover:text-[#1B2A4A]">Contacts</Link>
        <span>/</span>
        {agent.agency_id ? (
          <Link href={`/contacts/agencies/${agent.agency_id}`} className="hover:text-[#1B2A4A]">
            {agent.agency_name}
          </Link>
        ) : (
          <span>Independent</span>
        )}
        <span>/</span>
        <span className="font-medium text-[#1B2A4A]">{agent.name}</span>
      </nav>

      {/* Profile card */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#1B2A4A]/10 text-lg font-bold text-[#1B2A4A]">
            {agent.name[0].toUpperCase()}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-[#1B2A4A]">{agent.name}</h1>
              {!agent.is_active && (
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">Inactive</span>
              )}
            </div>
            {agent.agency_name && (
              <Link href={`/contacts/agencies/${agent.agency_id}`} className="mt-0.5 text-sm text-[#C0392B] hover:underline">
                {agent.agency_name}
              </Link>
            )}
            <div className="mt-2 flex flex-wrap gap-4 text-sm text-gray-600">
              {agent.email && (
                <a href={`mailto:${agent.email}`} className="flex items-center gap-1 hover:text-[#C0392B]">✉ {agent.email}</a>
              )}
              {agent.phone && (
                <a href={`tel:${agent.phone}`} className="flex items-center gap-1 hover:text-[#C0392B]">☎ {agent.phone}</a>
              )}
            </div>
            {agent.notes && <p className="mt-2 text-sm text-gray-500">{agent.notes}</p>}
          </div>
        </div>
      </div>

      {/* Soundcheck Artists */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">
          Soundcheck Artists ({agent.artists.length})
        </h2>
        {agent.artists.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No evaluations linked yet.</p>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm divide-y divide-gray-100">
            {agent.artists.map((a) => (
              <div key={a.id} className="flex items-center gap-3 px-5 py-3">
                <Link href={`/artists/${a.id}`} className="flex-1 text-sm font-semibold text-[#1B2A4A] hover:underline">
                  {a.name}
                </Link>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">{a.role}</span>
                {a.latest_score !== null && (
                  <span className="text-sm font-semibold text-gray-700">{a.latest_score.toFixed(1)}</span>
                )}
                <TierBadge tier={a.latest_tier} />
                <Link href={`/artists/${a.id}`} className="text-xs text-[#C0392B] hover:underline">
                  Scorecard →
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Roster Crossover */}
      {crossovers.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">
            Shared Roster ({crossovers.length})
          </h2>
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm divide-y divide-gray-100">
            {crossovers.map((entry, i) => (
              <div key={i} className="px-5 py-3 text-sm">
                <span className="inline-flex flex-wrap items-baseline gap-x-1.5">
                  {entry.artist_id ? (
                    <Link href={`/artists/${entry.artist_id}`} className="font-semibold text-[#1B2A4A] hover:underline">
                      {entry.artist_name}
                    </Link>
                  ) : (
                    <span className="font-semibold text-gray-700">{entry.artist_name}</span>
                  )}
                  <span className="text-gray-400">— also with:</span>
                  {entry.other_agents.map((oa, j) => (
                    <span key={oa.id} className="inline-flex items-baseline gap-x-1">
                      {j > 0 && <span className="text-gray-300">,</span>}
                      <Link href={`/contacts/agents/${oa.id}`} className="font-medium text-[#1B2A4A] hover:underline">
                        {oa.name}
                      </Link>
                      {oa.agency_name && (
                        <span className="text-gray-500">
                          {" "}at{" "}
                          {oa.agency_id ? (
                            <Link href={`/contacts/agencies/${oa.agency_id}`} className="text-gray-500 hover:text-[#1B2A4A] hover:underline">
                              {oa.agency_name}
                            </Link>
                          ) : oa.agency_name}
                        </span>
                      )}
                    </span>
                  ))}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Other Known Artists */}
      <KnownArtistsSection
        initialItems={knownArtists}
        agentId={params.id}
      />
    </div>
  );
}
