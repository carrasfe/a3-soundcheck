import type { Metadata } from "next";
import "./globals.css";
import AppShell from "@/components/AppShell";
import { AuthProvider } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/server";
import { type Profile } from "@/types";

export const metadata: Metadata = {
  title: "A3 Soundcheck",
  description: "Internal artist evaluation tool for A3 Merchandise",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profile: Profile | null = null;
  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();
    profile = data;
  }

  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body>
        <AuthProvider initialUser={user} initialProfile={profile}>
          <AppShell showSidebar={!!user}>
            {children}
          </AppShell>
        </AuthProvider>
      </body>
    </html>
  );
}
