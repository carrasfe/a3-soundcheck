import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getAgencyDetail } from "../../actions";

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

export default async function AgencyDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { agency, error } = await getAgencyDetail(params.id);
  if (error || !agency) notFound();

  const allArtists = agency.agents.flatMap((a) =>
    a.artists.map((ar) => ({ ...ar, agentName: a.name }))
  );
  const uniqueArtists = Array.from(new Map(allArtists.map((a) => [a.id, a])).values());

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <nav className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/contacts" className="hover:text-[#1B2A4A]">Contacts</Link>
        <span>/</span>
        <Link href="/contacts?tab=agents" className="hover:text-[#1B2A4A]">Agencies</Link>
        <span>/</span>
        <span className="font-medium text-[#1B2A4A]">{agency.name}</span>
      </nav>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-[#1B2A4A]">{agency.name}</h1>
        {agency.website && (
          <a
            href={agency.website.startsWith("http") ? agency.website : `https://${agency.website}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 text-sm text-[#C0392B] hover:underline"
          >
            {agency.website}
          </a>
        )}
        {agency.notes && <p className="mt-2 text-sm text-gray-600">{agency.notes}</p>}
        <div className="mt-3 flex gap-4 text-sm text-gray-500">
          <span>{agency.agents.length} agent{agency.agents.length !== 1 ? "s" : ""}</span>
          <span>{uniqueArtists.length} artist{uniqueArtists.length !== 1 ? "s" : ""}</span>
        </div>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">Agents</h2>
        {agency.agents.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No agents yet.</p>
        ) : (
          <div className="space-y-3">
            {agency.agents.map((a) => (
              <div key={a.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <Link href={`/contacts/agents/${a.id}`} className="text-base font-semibold text-[#1B2A4A] hover:underline">
                  {a.name}
                </Link>
                {!a.is_active && (
                  <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">Inactive</span>
                )}
                <div className="mt-1 flex flex-wrap gap-3 text-sm text-gray-500">
                  {a.email && <a href={`mailto:${a.email}`} className="hover:text-[#C0392B]">{a.email}</a>}
                  {a.phone && <span>{a.phone}</span>}
                </div>
                {a.artists.length > 0 && (
                  <div className="mt-3">
                    <p className="mb-2 text-xs font-medium text-gray-500">Artists</p>
                    <div className="space-y-1.5">
                      {a.artists.map((ar) => (
                        <div key={ar.id} className="flex items-center gap-3">
                          <Link href={`/artists/${ar.id}`} className="text-sm font-medium text-[#1B2A4A] hover:underline">
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
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">All Artists</h2>
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm divide-y divide-gray-100">
            {uniqueArtists.map((a) => (
              <div key={a.id} className="flex items-center gap-3 px-5 py-3">
                <Link href={`/artists/${a.id}`} className="flex-1 text-sm font-medium text-[#1B2A4A] hover:underline">
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
    </div>
  );
}
