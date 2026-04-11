import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import EvaluationWizard from "./EvaluationWizard";

export default async function NewEvaluationPage({
  searchParams,
}: {
  searchParams: { prefill?: string; edit?: string };
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();

  return (
    <EvaluationWizard
      evaluatorName={profile?.full_name ?? user.email ?? "Evaluator"}
      prefillId={searchParams.prefill}
      editId={searchParams.edit}
    />
  );
}
