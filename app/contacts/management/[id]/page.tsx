import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getManagementCompanyDetail, getKnownArtistsForCompany, deleteManagementCompany } from "../../actions";
import KnownArtistsSection from "../../KnownArtistsSection";
import EditCompanyHeader from "./EditCompanyHeader";
import AddManagerSection from "./AddManagerSection";

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

export default async function ManagementCompanyDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { company, error }, knownArtists] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user.id).single(),
    getManagementCompanyDetail(params.id),
    getKnownArtistsForCompany(params.id),
  ]);
  if (error || !company) notFound();

  const isAdmin = profile?.role === "admin";

  const allArtists = company.managers.flatMap((m) =>
    m.artists.map((a) => ({ ...a, managerName: m.name }))
  );
  const uniqueArtists = Array.from(new Map(allArtists.map((a) => [a.id, a])).values());

  const managerOptions = company.managers.map((m) => ({ id: m.id, name: m.name }));
  const boundDelete = deleteManagementCompany.bind(null, params.id);

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <nav className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/contacts" className="hover:text-[#001489]">Contacts</Link>
        <span>/</span>
        <Link href="/contacts" className="hover:text-[#001489]">Management</Link>
        <span>/</span>
        <span className="font-medium text-[#001489]">{company.name}</span>
      </nav>

      <EditCompanyHeader
        company={{ id: company.id, name: company.name, website: company.website, notes: company.notes }}
        managersCount={company.managers.length}
        artistsCount={uniqueArtists.length}
        knownArtistsCount={knownArtists.length}
        isAdmin={isAdmin}
        deleteAction={boundDelete}
      />

      <AddManagerSection initialManagers={company.managers} companyId={params.id} />

      {uniqueArtists.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">All Soundcheck Artists</h2>
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm divide-y divide-gray-100">
            {uniqueArtists.map((a) => (
              <div key={a.id} className="flex items-center gap-3 px-5 py-3">
                <Link href={`/artists/${a.id}`} className="flex-1 text-sm font-medium text-[#001489] hover:underline">
                  {a.name}
                </Link>
                <span className="text-xs text-gray-400">{a.managerName}</span>
                {a.latest_score !== null && (
                  <span className="text-xs font-semibold text-gray-600">{a.latest_score.toFixed(1)}</span>
                )}
                <TierBadge tier={a.latest_tier} />
              </div>
            ))}
          </div>
        </section>
      )}

      <KnownArtistsSection
        initialItems={knownArtists}
        managementCompanyId={params.id}
        personOptions={managerOptions}
        personType="manager"
      />
    </div>
  );
}
