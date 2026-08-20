import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { ROLE_DASHBOARD_PATH, SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { getMentorRoleStatus } from "@/lib/mentor/getMentorRoleStatus";
import { supabaseServer } from "@/lib/supabase/server";
import PageTitle from "@/components/dashboard/PageTitle";
import TambahMateriForm from "@/components/mentor/TambahMateriForm";

export default async function TambahMateriPage({
  params,
}: {
  params: Promise<{ kelasId: string }>;
}) {
  const { kelasId } = await params;
  const cookieStore = await cookies();
  const session = verifySessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return null;
  if (session.role !== "mentor") {
    redirect(ROLE_DASHBOARD_PATH[session.role]);
  }

  // BR-27: fitur mengajar (termasuk upload materi) terkunci selama Pending.
  if ((await getMentorRoleStatus(session.userId)) !== "active") {
    redirect("/dashboard/mentor");
  }

  // BR-7: mentor cuma boleh tambah materi untuk kelas yang di-assign ke dia.
  const { data: kelas } = await supabaseServer
    .from("kelas")
    .select("id, nama, mentor_id")
    .eq("id", kelasId)
    .maybeSingle();

  if (!kelas || kelas.mentor_id !== session.userId) {
    notFound();
  }

  const { data: subtesList } = await supabaseServer.from("subtes").select("id, nama").order("nama");

  return (
    <>
      <PageTitle value={`Tambah Materi — ${kelas.nama}`} />
      <div className="mx-auto flex w-full max-w-[800px] flex-col gap-6 p-4 sm:gap-8 sm:p-6 lg:p-10">
        <TambahMateriForm kelasId={kelas.id} subtesList={subtesList ?? []} />
      </div>
    </>
  );
}
