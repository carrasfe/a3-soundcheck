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
import { buildScoringInputs } from "./types";
import type { EvalFormData } from "./types";

export interface SaveResult {
  id: string | null;
  error: string | null;
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
      await supabase.from("artists").update({
        genre: fd.genre || null,
        management_company: fd.management_company || null,
        manager_names: fd.manager_names || null,
        booking_agent: fd.booking_agent || null,
        current_merch_provider: fd.merch_provider || null,
        updated_at: new Date().toISOString(),
      }).eq("id", existing.id);
      artistId = existing.id;
    } else {
      const { data: inserted } = await supabase.from("artists").insert({
        name: fd.artist_name.trim(),
        genre: fd.genre || null,
        management_company: fd.management_company || null,
        manager_names: fd.manager_names || null,
        booking_agent: fd.booking_agent || null,
        current_merch_provider: fd.merch_provider || null,
      }).select("id").single();
      artistId = inserted?.id ?? null;
    }
  }

  // Write to the actual DB schema (denormalized columns, not JSONB blobs)
  const payload = {
    artist_id:      artistId,
    evaluated_by:   user.id,
    status,
    evaluated_at:   new Date().toISOString(),
    tier:           results?.tier_label ?? null,
    action:         results?.action ?? null,
    score_total:    results?.total_score ?? null,
    score_p1:       results?.p1?.weighted_score ?? null,
    score_p2:       results?.p2?.weighted_score ?? null,
    score_p3:       results?.p3?.weighted_score ?? null,
    score_p4:       results?.p4?.weighted_score ?? null,
    pillar_weights: results?.pillar_weights ?? null,
    weight_profile: results
      ? { age_bracket: results.age_bracket, touring_bracket: results.touring_bracket }
      : null,
  };

  if (existingId) {
    const { error } = await supabase
      .from("evaluations")
      .update(payload)
      .eq("id", existingId);
    if (error) return { id: null, error: error.message };
    return { id: existingId, error: null };
  }

  const { data, error } = await supabase
    .from("evaluations")
    .insert(payload)
    .select("id")
    .single();

  if (error) return { id: null, error: error.message };

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

export interface LoadResult {
  data: EvalFormData | null;
  error: string | null;
}

export async function loadEvaluationInputs(_id: string): Promise<LoadResult> {
  // The current DB schema does not store form inputs as a JSONB column.
  // Pre-fill and re-evaluate are unavailable until an `inputs jsonb` column is added.
  return {
    data: null,
    error: "Saved inputs are not stored in the current schema. Please fill in the form manually.",
  };
}
