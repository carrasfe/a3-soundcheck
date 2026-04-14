"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

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
