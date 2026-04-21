import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContactsPageData } from "./actions";
import ContactsClient from "./ContactsClient";

export default async function ContactsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { companies, unassignedManagers, agencies, unassignedAgents, error } =
    await getContactsPageData();

  return (
    <ContactsClient
      companies={companies}
      unassignedManagers={unassignedManagers}
      agencies={agencies}
      unassignedAgents={unassignedAgents}
      dbError={error}
    />
  );
}
