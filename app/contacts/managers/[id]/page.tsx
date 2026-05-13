import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getManagerDetail, getKnownArtistsForManager, deleteManager } from "../../actions";
import KnownArtistsSection from "../../KnownArtistsSection";
import EditManagerCard from "./EditManagerCard";

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

export default async function ManagerDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { manager, error }, knownArtists, { data: companiesData }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user.id).single(),
    getManagerDetail(params.id),
    getKnownArtistsForManager(params.id),
    supabase.from("management_companies").select("id, name").order("name"),
  ]);
  if (error || !manager) notFound();

  const isAdmin = profile?.role === "admin";
  const companies = (companiesData ?? []).map((c) => ({ id: c.id, name: c.name }));
  const boundDelete = deleteManager.bind(null, params.id);
  const deleteRedirectTo = manager.management_company_id
    ? `/contacts/management/${manager.management_company_id}`
    : "/contacts";

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <nav className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/contacts" className="hover:text-[#1B2A4A]">Contacts</Link>
        <span>/</span>
        {manager.management_company_id ? (
          <Link href={`/contacts/management/${manager.management_company_id}`} className="hover:text-[#1B2A4A]">
            {manager.management_company_name}
          </Link>
        ) : (
          <span>Independent</span>
        )}
        <span>/</span>
        <span className="font-medium text-[#1B2A4A]">{manager.name}</span>
      </nav>

      <EditManagerCard
        manager={manager}
        companies={companies}
        isAdmin={isAdmin}
        deleteAction={boundDelete}
        deleteRedirectTo={deleteRedirectTo}
      />

      {/* Soundcheck Artists */}
      <section>
        <div className="mb-3 flex items-center gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">
            Soundcheck Artists ({manager.artists.length})
          </h2>
          {(() => {
            const a3Count = manager.artists.filter((a) => a.is_a3_client).length;
            return a3Count > 0 ? (
              <span className="text-xs font-medium text-[#27AE60]">
                {a3Count} of {manager.artists.length} {a3Count === 1 ? "is an" : "are"} A3 client{a3Count !== 1 ? "s" : ""}
              </span>
            ) : null;
          })()}
        </div>
        {manager.artists.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No evaluations linked yet.</p>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm divide-y divide-gray-100">
            {manager.artists.map((a) => (
              <div key={a.id} className="flex items-center gap-3 px-5 py-3">
                <Link href={`/artists/${a.id}`} className="flex-1 text-sm font-semibold text-[#1B2A4A] hover:underline">
                  {a.name}
                </Link>
                {a.is_a3_client && (
                  <span className="rounded px-1.5 py-0.5 text-[10px] font-bold bg-[#C0392B] text-white">A3 CLIENT</span>
                )}
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

      <KnownArtistsSection
        initialItems={knownArtists}
        managerId={params.id}
      />
    </div>
  );
}
