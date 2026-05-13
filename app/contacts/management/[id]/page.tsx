import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getManagementCompanyDetail, getKnownArtistsForCompany, deleteManagementCompany } from "../../actions";
import KnownArtistsSection from "../../KnownArtistsSection";
import EditCompanyHeader from "./EditCompanyHeader";

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
        <Link href="/contacts" className="hover:text-[#1B2A4A]">Contacts</Link>
        <span>/</span>
        <Link href="/contacts" className="hover:text-[#1B2A4A]">Management</Link>
        <span>/</span>
        <span className="font-medium text-[#1B2A4A]">{company.name}</span>
      </nav>

      <EditCompanyHeader
        company={{ id: company.id, name: company.name, website: company.website, notes: company.notes }}
        managersCount={company.managers.length}
        artistsCount={uniqueArtists.length}
        knownArtistsCount={knownArtists.length}
        isAdmin={isAdmin}
        deleteAction={boundDelete}
      />

      {/* Managers */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">Managers</h2>
        {company.managers.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No managers yet.</p>
        ) : (
          <div className="space-y-3">
            {company.managers.map((m) => (
              <div key={m.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Link href={`/contacts/managers/${m.id}`} className="text-base font-semibold text-[#1B2A4A] hover:underline">
                        {m.name}
                      </Link>
                      {!m.is_active && (
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">Inactive</span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-3 text-sm text-gray-500">
                      {m.email && <a href={`mailto:${m.email}`} className="hover:text-[#C0392B]">{m.email}</a>}
                      {m.phone && <span>{m.phone}</span>}
                    </div>
                  </div>
                  <Link
                    href={`/contacts/managers/${m.id}`}
                    title="Edit manager"
                    className="shrink-0 rounded border border-gray-200 p-1.5 text-gray-400 hover:border-[#1B2A4A]/30 hover:bg-gray-50 hover:text-[#1B2A4A] transition"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </Link>
                </div>
                {m.artists.length > 0 && (
                  <div className="mt-3">
                    <p className="mb-2 text-xs font-medium text-gray-500">Soundcheck Artists</p>
                    <div className="space-y-1.5">
                      {m.artists.map((a) => (
                        <div key={a.id} className="flex items-center gap-3">
                          <Link href={`/artists/${a.id}`} className="text-sm font-medium text-[#1B2A4A] hover:underline">
                            {a.name}
                          </Link>
                          <span className="text-xs text-gray-400">{a.role}</span>
                          {a.latest_score !== null && (
                            <span className="text-xs font-semibold text-gray-600">{a.latest_score.toFixed(1)}</span>
                          )}
                          <TierBadge tier={a.latest_tier} />
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
                <Link href={`/artists/${a.id}`} className="flex-1 text-sm font-medium text-[#1B2A4A] hover:underline">
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
