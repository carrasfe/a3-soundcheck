"use server";

/*
  Required Supabase tables:

  create table model_config (
    id uuid primary key default gen_random_uuid(),
    version integer not null,
    config jsonb not null,
    changed_by uuid references profiles(id),
    change_summary text,
    created_at timestamptz default now()
  );

  create table audit_log (
    id uuid primary key default gen_random_uuid(),
    event_type text not null,
    user_id uuid references profiles(id),
    target_id uuid,
    details jsonb,
    created_at timestamptz default now()
  );

  -- Add status to profiles for deactivation:
  alter table profiles add column if not exists status text default 'active';
*/

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_MODEL_CONFIG } from "@/lib/model-defaults";
import type { ModelConfig } from "@/lib/model-defaults";

// ─── Auth guard helper ────────────────────────────────────────

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") throw new Error("Admin access required");
  return { supabase, userId: user.id };
}

// ─── Model Config ─────────────────────────────────────────────

export interface ConfigVersion {
  id: string;
  version: number;
  config: ModelConfig;
  change_summary: string | null;
  created_at: string;
  changer_name: string;
}

export async function getCurrentConfig(): Promise<ModelConfig> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("model_config")
      .select("config")
      .order("version", { ascending: false })
      .limit(1)
      .single();
    if (data?.config) return data.config as ModelConfig;
  } catch {
    // Table may not exist yet
  }
  return DEFAULT_MODEL_CONFIG;
}

export async function saveModelConfig(
  config: ModelConfig,
  changeSummary: string
): Promise<{ error: string | null }> {
  try {
    const { supabase, userId } = await requireAdmin();

    // Get current max version
    const { data: latest } = await supabase
      .from("model_config")
      .select("version")
      .order("version", { ascending: false })
      .limit(1)
      .single();

    const nextVersion = (latest?.version ?? 0) + 1;

    const { error } = await supabase.from("model_config").insert({
      version: nextVersion,
      config: config as unknown as Record<string, unknown>,
      changed_by: userId,
      change_summary: changeSummary || `Version ${nextVersion}`,
    });

    if (error) return { error: error.message };

    // Write audit log
    await supabase.from("audit_log").insert({
      event_type: "model_change",
      user_id: userId,
      details: { change_summary: changeSummary, version: nextVersion },
    }).then(null, () => {});

    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Save failed" };
  }
}

export async function getVersionHistory(): Promise<ConfigVersion[]> {
  try {
    const { supabase } = await requireAdmin();

    const { data: versions } = await supabase
      .from("model_config")
      .select("id, version, config, change_summary, created_at, changed_by")
      .order("version", { ascending: false })
      .limit(50);

    if (!versions || versions.length === 0) return [];

    const changerIds = Array.from(
      new Set(versions.map((v) => v.changed_by).filter(Boolean))
    );
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", changerIds);

    const nameMap = new Map(
      (profiles ?? []).map((p) => [p.id, p.full_name || p.email || "Unknown"])
    );

    return versions.map((v) => ({
      id: v.id,
      version: v.version,
      config: v.config as ModelConfig,
      change_summary: v.change_summary,
      created_at: v.created_at,
      changer_name: nameMap.get(v.changed_by) ?? "Unknown",
    }));
  } catch {
    return [];
  }
}

export async function restoreVersion(versionId: string): Promise<{ error: string | null }> {
  try {
    const { supabase, userId } = await requireAdmin();

    const { data: row } = await supabase
      .from("model_config")
      .select("config, version")
      .eq("id", versionId)
      .single();

    if (!row) return { error: "Version not found" };

    const { data: latest } = await supabase
      .from("model_config")
      .select("version")
      .order("version", { ascending: false })
      .limit(1)
      .single();

    const nextVersion = (latest?.version ?? 0) + 1;

    const { error } = await supabase.from("model_config").insert({
      version: nextVersion,
      config: row.config,
      changed_by: userId,
      change_summary: `Restored from v${row.version}`,
    });

    if (error) return { error: error.message };
    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Restore failed" };
  }
}

// ─── User Management ─────────────────────────────────────────

export interface AdminUser {
  id: string;
  email: string | null;
  full_name: string | null;
  role: "admin" | "evaluator";
  status: string;
  created_at?: string;
}

export async function listUsers(): Promise<AdminUser[]> {
  try {
    const { supabase } = await requireAdmin();
    const { data } = await supabase
      .from("profiles")
      .select("id, email, full_name, role, status, created_at")
      .order("created_at", { ascending: false });

    return (data ?? []).map((u) => ({
      id: u.id,
      email: u.email,
      full_name: u.full_name,
      role: u.role,
      status: u.status ?? "active",
      created_at: u.created_at,
    }));
  } catch {
    return [];
  }
}

export async function inviteUser(
  email: string,
  role: "admin" | "evaluator"
): Promise<{ error: string | null }> {
  try {
    const { supabase, userId } = await requireAdmin();
    const admin = createAdminClient();

    const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { role },
    });

    if (inviteErr) return { error: inviteErr.message };

    // Pre-create profile row so role is set before they accept
    if (invited?.user?.id) {
      await supabase.from("profiles").upsert({
        id: invited.user.id,
        email,
        role,
        status: "active",
      }).then(null, () => {});
    }

    await supabase.from("audit_log").insert({
      event_type: "user_invited",
      user_id: userId,
      details: { email, role },
    }).then(null, () => {});

    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Invite failed" };
  }
}

export async function updateUserRole(
  targetUserId: string,
  newRole: "admin" | "evaluator"
): Promise<{ error: string | null }> {
  try {
    const { supabase, userId } = await requireAdmin();
    const { error } = await supabase
      .from("profiles")
      .update({ role: newRole })
      .eq("id", targetUserId);

    if (error) return { error: error.message };

    await supabase.from("audit_log").insert({
      event_type: "role_changed",
      user_id: userId,
      target_id: targetUserId,
      details: { new_role: newRole },
    }).then(null, () => {});

    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Role update failed" };
  }
}

export async function setUserStatus(
  targetUserId: string,
  status: "active" | "inactive"
): Promise<{ error: string | null }> {
  try {
    const { supabase, userId } = await requireAdmin();
    const { error } = await supabase
      .from("profiles")
      .update({ status })
      .eq("id", targetUserId);

    if (error) return { error: error.message };

    await supabase.from("audit_log").insert({
      event_type: status === "inactive" ? "user_deactivated" : "user_reactivated",
      user_id: userId,
      target_id: targetUserId,
      details: { status },
    }).then(null, () => {});

    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Status update failed" };
  }
}

// ─── Audit Log ────────────────────────────────────────────────

export interface AuditEntry {
  id: string;
  event_type: string;
  actor_name: string;
  details: Record<string, unknown> | null;
  created_at: string;
}

export async function getAuditLog(limit = 200): Promise<AuditEntry[]> {
  try {
    const { supabase } = await requireAdmin();

    const { data: entries } = await supabase
      .from("audit_log")
      .select("id, event_type, user_id, details, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (!entries || entries.length === 0) return [];

    const actorIds = Array.from(
      new Set(entries.map((e) => e.user_id).filter(Boolean))
    );
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", actorIds);

    const nameMap = new Map(
      (profiles ?? []).map((p) => [p.id, p.full_name || p.email || "Unknown"])
    );

    return entries.map((e) => ({
      id: e.id,
      event_type: e.event_type,
      actor_name: nameMap.get(e.user_id) ?? "System",
      details: e.details as Record<string, unknown> | null,
      created_at: e.created_at,
    }));
  } catch {
    return [];
  }
}
