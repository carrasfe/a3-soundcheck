import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getAgentDetail } from "../../actions";

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

  const { agent, error } = await getAgentDetail(params.id);
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

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#1B2A4A]/10 text-lg font-bold text-[#1B2A4A]">
            {agent.name[0].toUpperCase()}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-[#1B2A4A]">{agent.name}</h1>
              {!agent.is_active && (
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                  Inactive
                </span>
              )}
            </div>
            {agent.agency_name && (
              <Link
                href={`/contacts/agencies/${agent.agency_id}`}
                className="mt-0.5 text-sm text-[#C0392B] hover:underline"
              >
                {agent.agency_name}
              </Link>
            )}
            <div className="mt-2 flex flex-wrap gap-4 text-sm text-gray-600">
              {agent.email && (
                <a href={`mailto:${agent.email}`} className="flex items-center gap-1 hover:text-[#C0392B]">
                  <span>✉</span> {agent.email}
                </a>
              )}
              {agent.phone && (
                <a href={`tel:${agent.phone}`} className="flex items-center gap-1 hover:text-[#C0392B]">
                  <span>☎</span> {agent.phone}
                </a>
              )}
            </div>
            {agent.notes && (
              <p className="mt-2 text-sm text-gray-500">{agent.notes}</p>
            )}
          </div>
        </div>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">
          Artists ({agent.artists.length})
        </h2>
        {agent.artists.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No artists linked yet.</p>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm divide-y divide-gray-100">
            {agent.artists.map((a) => (
              <div key={a.id} className="flex items-center gap-3 px-5 py-3">
                <Link
                  href={`/artists/${a.id}`}
                  className="flex-1 text-sm font-semibold text-[#1B2A4A] hover:underline"
                >
                  {a.name}
                </Link>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">
                  {a.role}
                </span>
                {a.latest_score !== null && (
                  <span className="text-sm font-semibold text-gray-700">
                    {a.latest_score.toFixed(1)}
                  </span>
                )}
                <TierBadge tier={a.latest_tier} />
                <Link
                  href={`/artists/${a.id}`}
                  className="text-xs text-[#C0392B] hover:underline"
                >
                  Scorecard →
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
