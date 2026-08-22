import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ROLE_DASHBOARD_PATH, SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { getApprovalMentorList } from "@/lib/admin/getApprovalMentorData";
import { getUserDisplayName } from "@/lib/dashboard/getUserDisplayName";
import PageTitle from "@/components/dashboard/PageTitle";
import ApprovalMentorClient from "@/components/admin/ApprovalMentorClient";

/** "Approval Mentor" (Admin) — PRD Bagian 5, Bagian 8 BR-2. */
export default async function ApprovalMentorPage() {
  const cookieStore = await cookies();
  const session = verifySessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return null;
  if (session.role !== "admin") {
    redirect(ROLE_DASHBOARD_PATH[session.role]);
  }

  const [adminName, pending, active, rejected] = await Promise.all([
    getUserDisplayName(session.userId, "Admin"),
    getApprovalMentorList("pending"),
    getApprovalMentorList("active"),
    getApprovalMentorList("rejected"),
  ]);

  return (
    <>
      <PageTitle value="Approval Mentor" />
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 p-4 sm:gap-8 sm:p-6 lg:p-10">
        <ApprovalMentorClient
          initialPending={pending}
          initialActive={active}
          initialRejected={rejected}
          adminName={adminName}
        />
      </div>
    </>
  );
}
