import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getManagementCompanyDetail } from "../../actions";

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

  const { company, error } = await getManagementCompanyDetail(params.id);
  if (error || !company) notFound();

  const allArtists = company.managers.flatMap((m) =>
    m.artists.map((a) => ({ ...a, managerName: m.name }))
  );
  const uniqueArtists = Array.from(new Map(allArtists.map((a) => [a.id, a])).values());

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/contacts" className="hover:text-[#1B2A4A]">Contacts</Link>
        <span>/</span>
        <Link href="/contacts" className="hover:text-[#1B2A4A]">Management</Link>
        <span>/</span>
        <span className="font-medium text-[#1B2A4A]">{company.name}</span>
      </nav>

      {/* Header */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-[#1B2A4A]">{company.name}</h1>
        {company.website && (
          <a
            href={company.website.startsWith("http") ? company.website : `https://${company.website}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 text-sm text-[#C0392B] hover:underline"
          >
            {company.website}
          </a>
        )}
        {company.notes && (
          <p className="mt-2 text-sm text-gray-600">{company.notes}</p>
        )}
        <div className="mt-3 flex gap-4 text-sm text-gray-500">
          <span>{company.managers.length} manager{company.managers.length !== 1 ? "s" : ""}</span>
          <span>{uniqueArtists.length} artist{uniqueArtists.length !== 1 ? "s" : ""}</span>
        </div>
      </div>

      {/* Managers */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">
          Managers
        </h2>
        {company.managers.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No managers yet.</p>
        ) : (
          <div className="space-y-3">
            {company.managers.map((m) => (
              <div key={m.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Link
                      href={`/contacts/managers/${m.id}`}
                      className="text-base font-semibold text-[#1B2A4A] hover:underline"
                    >
                      {m.name}
                    </Link>
                    {!m.is_active && (
                      <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">
                        Inactive
                      </span>
                    )}
                    <div className="mt-1 flex flex-wrap gap-3 text-sm text-gray-500">
                      {m.email && (
                        <a href={`mailto:${m.email}`} className="hover:text-[#C0392B]">
                          {m.email}
                        </a>
                      )}
                      {m.phone && <span>{m.phone}</span>}
                    </div>
                  </div>
                </div>
                {m.artists.length > 0 && (
                  <div className="mt-3">
                    <p className="mb-2 text-xs font-medium text-gray-500">Artists</p>
                    <div className="space-y-1.5">
                      {m.artists.map((a) => (
                        <div key={a.id} className="flex items-center gap-3">
                          <Link
                            href={`/artists/${a.id}`}
                            className="text-sm font-medium text-[#1B2A4A] hover:underline"
                          >
                            {a.name}
                          </Link>
                          <span className="text-xs text-gray-400">{a.role}</span>
                          {a.latest_score !== null && (
                            <span className="text-xs font-semibold text-gray-600">
                              {a.latest_score.toFixed(1)}
                            </span>
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

      {/* All Artists summary */}
      {uniqueArtists.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">
            All Artists
          </h2>
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm divide-y divide-gray-100">
            {uniqueArtists.map((a) => (
              <div key={a.id} className="flex items-center gap-3 px-5 py-3">
                <Link
                  href={`/artists/${a.id}`}
                  className="flex-1 text-sm font-medium text-[#1B2A4A] hover:underline"
                >
                  {a.name}
                </Link>
                <span className="text-xs text-gray-400">{a.managerName}</span>
                {a.latest_score !== null && (
                  <span className="text-xs font-semibold text-gray-600">
                    {a.latest_score.toFixed(1)}
                  </span>
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
