"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// ─── Parse helpers (mirrors contacts/actions.ts) ──────────────

function parseBookingText(raw: string): { agencyName: string | null; agentNames: string[] } {
  const dashIdx = raw.indexOf(" - ");
  if (dashIdx > -1) {
    return {
      agencyName: raw.substring(0, dashIdx).trim(),
      agentNames: raw.substring(dashIdx + 3).split(/[/,]/).map((n) => n.trim()).filter(Boolean),
    };
  }
  return { agencyName: null, agentNames: raw.split(/[/,]/).map((n) => n.trim()).filter(Boolean) };
}

// ─── Find-or-create helpers ────────────────────────────────────

async function findOrCreateManagementCompany(
  supabase: Awaited<ReturnType<typeof createClient>>,
  name: string
): Promise<string | null> {
  const { data: existing } = await supabase
    .from("management_companies").select("id").ilike("name", name).limit(1);
  if (existing?.[0]) return existing[0].id;
  const { data: created } = await supabase
    .from("management_companies").insert({ name }).select("id").single();
  return created?.id ?? null;
}

async function findOrCreateManager(
  supabase: Awaited<ReturnType<typeof createClient>>,
  name: string,
  managementCompanyId: string | null
): Promise<string | null> {
  const { data: existing } = await supabase
    .from("managers").select("id").ilike("name", name).limit(1);
  if (existing?.[0]) return existing[0].id;
  const { data: created } = await supabase
    .from("managers")
    .insert({ name, management_company_id: managementCompanyId })
    .select("id").single();
  return created?.id ?? null;
}

async function findOrCreateAgency(
  supabase: Awaited<ReturnType<typeof createClient>>,
  name: string
): Promise<string | null> {
  const { data: existing } = await supabase
    .from("agencies").select("id").ilike("name", name).limit(1);
  if (existing?.[0]) return existing[0].id;
  const { data: created } = await supabase
    .from("agencies").insert({ name }).select("id").single();
  return created?.id ?? null;
}

async function findOrCreateAgent(
  supabase: Awaited<ReturnType<typeof createClient>>,
  name: string,
  agencyId: string | null
): Promise<string | null> {
  const { data: existing } = await supabase
    .from("agents").select("id").ilike("name", name).limit(1);
  if (existing?.[0]) return existing[0].id;
  const { data: created } = await supabase
    .from("agents").insert({ name, agency_id: agencyId }).select("id").single();
  return created?.id ?? null;
}

// ─── Link legacy text field to contacts ───────────────────────

export async function linkLegacyTextField(
  artistId: string,
  field: "management_company" | "manager_names" | "booking_agent",
  text: string
): Promise<{ error: string | null }> {
  if (!text.trim()) return { error: null };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  try {
    if (field === "management_company") {
      await findOrCreateManagementCompany(supabase, text.trim());
    }

    if (field === "manager_names") {
      const names = text.trim().split(/[/,]/).map((n) => n.trim()).filter(Boolean);
      // Try to find the management company for these managers
      const { data: artistRow } = await supabase
        .from("artists").select("management_company").eq("id", artistId).single();
      let companyId: string | null = null;
      if (artistRow?.management_company?.trim()) {
        const { data: co } = await supabase
          .from("management_companies").select("id")
          .ilike("name", artistRow.management_company.trim()).limit(1);
        companyId = co?.[0]?.id ?? null;
      }

      for (let i = 0; i < names.length; i++) {
        const managerId = await findOrCreateManager(supabase, names[i], companyId);
        if (!managerId) continue;
        const { data: existing } = await supabase
          .from("artist_managers").select("id")
          .eq("artist_id", artistId).eq("manager_id", managerId).limit(1);
        if (!existing?.[0]) {
          await supabase.from("artist_managers").insert({
            artist_id: artistId,
            manager_id: managerId,
            role: i === 0 ? "Lead" : "Day-to-Day",
          });
        }
      }
    }

    if (field === "booking_agent") {
      const { agencyName, agentNames } = parseBookingText(text.trim());

      // Resolve agency
      let agencyId: string | null = null;
      if (agencyName) {
        agencyId = await findOrCreateAgency(supabase, agencyName);
      } else if (agentNames.length === 0) {
        // Whole text is an agency name (no dash, no slash)
        agencyId = await findOrCreateAgency(supabase, text.trim());
      }

      // Create agents and junction links
      for (let i = 0; i < agentNames.length; i++) {
        const agentId = await findOrCreateAgent(supabase, agentNames[i], agencyId);
        if (!agentId) continue;
        const { data: existing } = await supabase
          .from("artist_agents").select("id")
          .eq("artist_id", artistId).eq("agent_id", agentId).limit(1);
        if (!existing?.[0]) {
          await supabase.from("artist_agents").insert({
            artist_id: artistId,
            agent_id: agentId,
            role: i === 0 ? "Primary" : "Secondary",
          });
        }
      }
    }
  } catch (err) {
    return { error: String(err) };
  }

  revalidatePath(`/artists/${artistId}`);
  return { error: null };
}

export type ArtistBulkAction = "set_a3_client" | "remove_a3_client" | "archive" | "restore";

export async function updateArtistFlags(
  ids: string[],
  action: ArtistBulkAction,
): Promise<{ error: string | null }> {
  if (!ids.length) return { error: null };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const patch =
    action === "set_a3_client"    ? { is_a3_client: true }  :
    action === "remove_a3_client" ? { is_a3_client: false } :
    action === "archive"          ? { is_archived: true }   :
                                    { is_archived: false };

  const { error } = await supabase.from("artists").update(patch).in("id", ids);
  if (error) return { error: error.message };

  revalidatePath("/artists");
  revalidatePath("/artists/[id]", "layout");
  return { error: null };
}
