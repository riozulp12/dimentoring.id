import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ROLE_DASHBOARD_PATH, SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { supabaseServer } from "@/lib/supabase/server";
import { getAdminInvitations } from "@/lib/admin/adminInvitations";
import PageTitle from "@/components/dashboard/PageTitle";
import UndangAdminClient from "@/components/admin/UndangAdminClient";

/** "Undang Admin" — PRD Bagian 8 BR-3, Bagian 13 (admin_invitations). */
export default async function UndangAdminPage() {
  const cookieStore = await cookies();
  const session = verifySessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return null;
  if (session.role !== "admin") {
    redirect(ROLE_DASHBOARD_PATH[session.role]);
  }

  const [invitations, adminUser] = await Promise.all([
    getAdminInvitations(),
    supabaseServer.from("users").select("nama").eq("id", session.userId).maybeSingle(),
  ]);

  const adminName = (adminUser.data?.nama as string | undefined) ?? "Admin";

  return (
    <>
      <PageTitle value="Undang Admin" />
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 p-4 sm:gap-8 sm:p-6 lg:p-10">
        <UndangAdminClient initialInvitations={invitations} adminName={adminName} />
      </div>
    </>
  );
}
