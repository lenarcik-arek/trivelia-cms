import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Sprawdzamy czy użytkownik jest uprawnionym administratorem CMS (po emailu)
  const { data: adminData } = await supabase
    .from("cms_admins")
    .select("email")
    .eq("email", user.email)
    .single();

  if (!adminData) {
    // Jeśli nie jest na liście adminów, wylogowujemy go po stronie serwera i odrzucamy
    await supabase.auth.signOut();
    redirect("/login?error=unauthorized");
  }

  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Topbar email={user.email} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
