import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getAgencyDetail, getKnownArtistsForAgency, getRosterCrossoverForAgency, deleteAgency } from "../../actions";
import KnownArtistsSection from "../../KnownArtistsSection";
import EditAgencyHeader from "./EditAgencyHeader";

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

export default async function AgencyDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { agency, error }, knownArtists, crossovers] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user.id).single(),
    getAgencyDetail(params.id),
    getKnownArtistsForAgency(params.id),
    getRosterCrossoverForAgency(params.id),
  ]);
  if (error || !agency) notFound();

  const isAdmin = profile?.role === "admin";

  const allArtists = agency.agents.flatMap((a) =>
    a.artists.map((ar) => ({ ...ar, agentName: a.name }))
  );
  const uniqueArtists = Array.from(new Map(allArtists.map((a) => [a.id, a])).values());
  const agentOptions = agency.agents.map((a) => ({ id: a.id, name: a.name }));
  const boundDelete = deleteAgency.bind(null, params.id);

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <nav className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/contacts" className="hover:text-[#001489]">Contacts</Link>
        <span>/</span>
        <Link href="/contacts?tab=agents" className="hover:text-[#001489]">Agencies</Link>
        <span>/</span>
        <span className="font-medium text-[#001489]">{agency.name}</span>
      </nav>

      <EditAgencyHeader
        agency={{ id: agency.id, name: agency.name, website: agency.website, notes: agency.notes }}
        agentsCount={agency.agents.length}
        artistsCount={uniqueArtists.length}
        knownArtistsCount={knownArtists.length}
        isAdmin={isAdmin}
        deleteAction={boundDelete}
      />

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">Agents</h2>
        {agency.agents.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No agents yet.</p>
        ) : (
          <div className="space-y-3">
            {agency.agents.map((a) => (
              <div key={a.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Link href={`/contacts/agents/${a.id}`} className="text-base font-semibold text-[#001489] hover:underline">
                        {a.name}
                      </Link>
                      {!a.is_active && (
                        <span className="ml-1 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">Inactive</span>
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

      {uniqueArtists.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">All Soundcheck Artists</h2>
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm divide-y divide-gray-100">
            {uniqueArtists.map((a) => (
              <div key={a.id} className="flex items-center gap-3 px-5 py-3">
                <Link href={`/artists/${a.id}`} className="flex-1 text-sm font-medium text-[#001489] hover:underline">
                  {a.name}
                </Link>
                <span className="text-xs text-gray-400">{a.agentName}</span>
                {a.latest_score !== null && (
                  <span className="text-xs font-semibold text-gray-600">{a.latest_score.toFixed(1)}</span>
                )}
                <TierBadge tier={a.latest_tier} />
              </div>
            ))}
          </div>
        </section>
      )}

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
                    <Link href={`/artists/${entry.artist_id}`} className="font-semibold text-[#001489] hover:underline">
                      {entry.artist_name}
                    </Link>
                  ) : (
                    <span className="font-semibold text-gray-700">{entry.artist_name}</span>
                  )}
                  <span className="text-gray-400">— also at:</span>
                  {entry.other_agencies.map((oa, j) => (
                    <span key={oa.id} className="inline-flex items-baseline gap-x-1">
                      {j > 0 && <span className="text-gray-300">,</span>}
                      <Link href={`/contacts/agencies/${oa.id}`} className="font-medium text-[#001489] hover:underline">
                        {oa.name}
                      </Link>
                    </span>
                  ))}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <KnownArtistsSection
        initialItems={knownArtists}
        agencyId={params.id}
        personOptions={agentOptions}
        personType="agent"
      />
    </div>
  );
}
