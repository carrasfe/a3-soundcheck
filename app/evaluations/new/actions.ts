"use server";

/*
  Required Supabase tables:

  create table artists (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    genre text,
    management_company text,
    manager_names text,
    booking_agent text,
    merch_provider text,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
  );

  create table evaluations (
    id uuid primary key default gen_random_uuid(),
    artist_id uuid references artists(id),
    evaluator_id uuid references profiles(id),
    artist_name text,
    genre text,
    status text not null default 'draft',
    inputs jsonb,
    results jsonb,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
  );
*/

import { createClient } from "@/lib/supabase/server";
import { calculateScore } from "@/lib/scoring-engine";
import { buildScoringInputs, getAgeProfileLabel } from "./types";
import type { EvalFormData } from "./types";

export interface SaveResult {
  id: string | null;
  error: string | null;
  debugInfo?: string | null;
}

function buildDebugInfo(
  op: string,
  err: { message?: string; details?: string; hint?: string; code?: string },
  payload: Record<string, unknown>
): string {
  const safePayload = { ...payload };
  // Truncate large JSONB blobs in debug output so clipboard stays readable
  if (safePayload.inputs)  safePayload.inputs  = "[EvalFormData — omitted]";
  if (safePayload.results) safePayload.results = "[ScoringResult — omitted]";
  return [
    `Operation: evaluations ${op}`,
    `Message: ${err.message ?? "unknown"}`,
    `Details: ${err.details ?? "none"}`,
    `Hint: ${err.hint ?? "none"}`,
    `Code: ${err.code ?? "none"}`,
    `Payload: ${JSON.stringify(safePayload, null, 2)}`,
  ].join("\n");
}

export async function saveEvaluation(
  fd: EvalFormData,
  status: "draft" | "complete",
  existingId?: string
): Promise<SaveResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { id: null, error: "Not authenticated" };

  // Compute scores if complete
  let results: ReturnType<typeof calculateScore> | null = null;
  if (status === "complete") {
    const inputs = buildScoringInputs(fd);
    if (!inputs) return { id: null, error: "Missing required scoring inputs" };
    try {
      results = calculateScore(inputs);
    } catch (e) {
      return { id: null, error: `Scoring error: ${e instanceof Error ? e.message : String(e)}` };
    }
  }

  // Upsert artist
  let artistId: string | null = null;
  if (fd.artist_name.trim()) {
    const { data: existing } = await supabase
      .from("artists")
      .select("id")
      .ilike("name", fd.artist_name.trim())
      .limit(1)
      .single();

    if (existing) {
      const { error: updateErr } = await supabase.from("artists").update({
        genre: fd.genre || null,
        management_company: fd.management_company || null,
        manager_names: fd.manager_names || null,
        booking_agent: fd.booking_agent || null,
        current_merch_provider: fd.merch_provider || null,
        updated_at: new Date().toISOString(),
      }).eq("id", existing.id);
      if (updateErr) {
        console.error("[saveEvaluation] Artist update failed:", {
          message: updateErr.message, details: updateErr.details,
          hint: updateErr.hint, code: updateErr.code,
        });
      }
      artistId = existing.id;
    } else {
      const { data: inserted, error: insertErr } = await supabase.from("artists").insert({
        name: fd.artist_name.trim(),
        genre: fd.genre || null,
        management_company: fd.management_company || null,
        manager_names: fd.manager_names || null,
        booking_agent: fd.booking_agent || null,
        current_merch_provider: fd.merch_provider || null,
      }).select("id").single();
      if (insertErr) {
        console.error("[saveEvaluation] Artist insert failed:", {
          message: insertErr.message, details: insertErr.details,
          hint: insertErr.hint, code: insertErr.code,
        });
        // Return early — without an artist_id the evaluation insert will likely fail too
        const dbg = `Artist insert failed\nMessage: ${insertErr.message}\nDetails: ${insertErr.details ?? "none"}\nHint: ${insertErr.hint ?? "none"}\nCode: ${insertErr.code ?? "none"}`;
        return { id: null, error: `Artist insert failed: ${insertErr.message}`, debugInfo: dbg };
      }
      artistId = inserted?.id ?? null;
    }
  }

  const payload = {
    // Denormalized columns (indexed, queryable)
    artist_id:      artistId,
    evaluated_by:   user.id,
    status,
    evaluated_at:   new Date().toISOString(),
    tier:           results?.tier_label ?? null,
    action:         results?.action ?? null,
    revenue_tier:   results?.revenue_tier ?? null,
    score_total:    results?.total_score ?? null,
    score_p1:       results?.p1?.weighted_score ?? null,
    score_p2:       results?.p2?.weighted_score ?? null,
    score_p3:       results?.p3?.weighted_score ?? null,
    score_p4:       results?.p4?.weighted_score ?? null,
    pillar_weights: results?.pillar_weights ?? null,
    weight_profile: getAgeProfileLabel(fd),
    // Full JSONB blobs — required for detail page, PDF, and pre-fill
    inputs:  fd as unknown as Record<string, unknown>,
    results: results as unknown as Record<string, unknown> | null,
  };

  if (existingId) {
    const { data: updated, error } = await supabase
      .from("evaluations")
      .update(payload)
      .eq("id", existingId)
      .select("id");
    if (error) {
      console.error("[saveEvaluation] Evaluation update failed:", {
        message: error.message, details: error.details,
        hint: error.hint, code: error.code,
        payloadKeys: Object.keys(payload),
      });
      const dbg = buildDebugInfo("update", error, payload);
      return { id: null, error: error.message, debugInfo: dbg };
    }
    if (!updated || updated.length === 0) {
      // 0 rows affected — RLS blocked the update or the row no longer exists.
      // Fall through to INSERT a fresh evaluation.
      console.warn("[saveEvaluation] Update affected 0 rows for existingId:", existingId, "— inserting new row");
    } else {
      return { id: updated[0].id as string, error: null };
    }
  }

  const { data, error } = await supabase
    .from("evaluations")
    .insert(payload)
    .select("id")
    .single();

  if (error) {
    console.error("[saveEvaluation] Evaluation insert failed:", {
      message: error.message, details: error.details,
      hint: error.hint, code: error.code,
      payloadKeys: Object.keys(payload),
    });
    const dbg = buildDebugInfo("insert", error, payload);
    return { id: null, error: error.message, debugInfo: dbg };
  }

  // Audit log — fire and forget
  if (status === "complete" && results) {
    await supabase.from("audit_log").insert({
      event_type: "evaluation_complete",
      user_id: user.id,
      target_id: data.id,
      details: {
        artist_name: fd.artist_name,
        genre: fd.genre,
        tier: results.tier_label,
        total_score: results.total_score,
      },
    }).then(null, () => {});
  }

  return { id: data.id, error: null };
}

export async function getDraftCount(): Promise<number> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 0;

  const { count, error } = await supabase
    .from("evaluations")
    .select("id", { count: "exact", head: true })
    .eq("status", "draft")
    .eq("evaluated_by", user.id);

  return error ? 0 : (count ?? 0);
}

export interface LoadResult {
  data: EvalFormData | null;
  error: string | null;
}

export async function loadEvaluationInputs(id: string): Promise<LoadResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data: row, error } = await supabase
    .from("evaluations")
    .select("inputs")
    .eq("id", id)
    .single();

  if (error) return { data: null, error: error.message };
  if (!row?.inputs) return { data: null, error: "No saved inputs found for this evaluation." };

  return { data: row.inputs as EvalFormData, error: null };
}

export async function deleteDraftEvaluation(id: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("evaluations")
    .delete()
    .eq("id", id)
    .eq("status", "draft")
    .eq("evaluated_by", user.id);

  return { error: error?.message ?? null };
}

export async function deleteAllDrafts(): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("evaluations")
    .delete()
    .eq("status", "draft")
    .eq("evaluated_by", user.id);

  return { error: error?.message ?? null };
}
