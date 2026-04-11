import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AdminClient from "./AdminClient";
import { getCurrentConfig, listUsers, getAuditLog } from "./actions";

export default async function AdminPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") redirect("/");

  const [config, users, auditLog] = await Promise.all([
    getCurrentConfig(),
    listUsers(),
    getAuditLog(200),
  ]);

  return (
    <AdminClient
      initialConfig={config}
      initialUsers={users}
      initialAuditLog={auditLog}
    />
  );
}
