import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ROLE_DASHBOARD_PATH, SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { getMentorDetail } from "@/lib/admin/getApprovalMentorData";
import PageTitle from "@/components/dashboard/PageTitle";
import MentorDetailStatusSection from "@/components/admin/MentorDetailStatusSection";

/**
 * Detail Mentor (Admin) — PRD Bagian 5, Bagian 8 BR-2, Bagian 13 (users,
 * user_roles, mentor_profiles, mentor_subtes_diampu, kelas, enrollments).
 * Diakses dari klik card di /approval-mentor (tab manapun) — mentorId di URL
 * = user_roles.id (sama identifier yang dipakai app/api/approval-mentor).
 */

function formatDate(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

export default async function MentorDetailPage({
  params,
}: {
  params: Promise<{ mentorId: string }>;
}) {
  const { mentorId } = await params;

  const cookieStore = await cookies();
  const session = verifySessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return null;
  if (session.role !== "admin") {
    redirect(ROLE_DASHBOARD_PATH[session.role]);
  }

  const mentor = await getMentorDetail(mentorId);
  if (!mentor) {
    redirect(`/approval-mentor?error=${encodeURIComponent("Pengajuan mentor tidak ditemukan.")}`);
  }

  return (
    <>
      <PageTitle value={mentor.nama} />
      <div className="mx-auto flex w-full max-w-[900px] flex-col gap-6 p-4 sm:gap-8 sm:p-6 lg:p-10">
        <div className="flex flex-col gap-4 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-5 sm:px-8 sm:py-6">
          <div className="flex flex-col gap-1">
            <h1 className="text-xl font-semibold tracking-[-0.02em] text-black sm:text-2xl">{mentor.nama}</h1>
            <p className="text-sm text-[#7E7C7C]">{mentor.email}</p>
            <p className="text-sm text-[#7E7C7C]">{mentor.noWa}</p>
          </div>

          <MentorDetailStatusSection
            userRoleId={mentor.userRoleId}
            nama={mentor.nama}
            initialStatus={mentor.status}
          />

          {mentor.status !== "pending" ? (
            <div className="flex flex-col gap-1 rounded-[16px] bg-[#F9F9F9] px-4 py-3 text-sm">
              <p className="text-[#7E7C7C]">
                Direview oleh <span className="text-black">{mentor.direviewOlehNama ?? "-"}</span> ·{" "}
                {formatDate(mentor.tanggalReview)}
              </p>
              {mentor.alasanTolak ? (
                <p className="text-[#7E7C7C]">
                  Alasan tolak: <span className="text-black">{mentor.alasanTolak}</span>
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-4 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-5 sm:px-8 sm:py-6">
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-black sm:text-xl">Info Mentor</h2>
          <div className="grid grid-cols-2 gap-4 text-sm sm:gap-6">
            <div>
              <p className="text-[#7E7C7C]">Asal PTN</p>
              <p className="text-black">{mentor.asalPtn ?? "-"}</p>
            </div>
            <div>
              <p className="text-[#7E7C7C]">Semester</p>
              <p className="text-black">{mentor.semester ?? "-"}</p>
            </div>
            <div className="col-span-2">
              <p className="text-[#7E7C7C]">Jurusan</p>
              <p className="text-black">{mentor.jurusan ?? "-"}</p>
            </div>
            <div className="col-span-2">
              <p className="text-[#7E7C7C]">Tanggal Daftar</p>
              <p className="text-black">{formatDate(mentor.tanggalDaftar)}</p>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <p className="text-sm text-[#7E7C7C]">Subtes yang Diampu</p>
            {mentor.subtesDiampu.length === 0 ? (
              <p className="text-sm text-black">-</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {mentor.subtesDiampu.map((nama) => (
                  <span
                    key={nama}
                    className="inline-flex items-center rounded-full bg-[#F9FAFF] px-2.5 py-0.5 text-xs font-medium text-[#081EEA]"
                  >
                    {nama}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-5 sm:px-8 sm:py-6">
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-black sm:text-xl">Ringkasan</h2>
          <p className="mt-3 text-3xl font-semibold tracking-[-0.02em] text-[#081EEA]">
            {mentor.totalSiswaBinaan}
          </p>
          <p className="text-sm text-[#7E7C7C]">Total siswa binaan (lintas semua kelas)</p>
        </div>

        <div className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-black sm:text-xl">Kelas yang Diampu</h2>
          {mentor.kelasDiampu.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-10 text-center">
              <p className="text-base text-[#7E7C7C]">Mentor ini belum diampukan kelas apa pun.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {mentor.kelasDiampu.map((kelas) => (
                <div
                  key={kelas.id}
                  className="flex items-center justify-between gap-3 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-4"
                >
                  <p className="text-base text-black">{kelas.nama}</p>
                  <span className="inline-flex shrink-0 items-center rounded-full bg-[#F9FAFF] px-2.5 py-0.5 text-xs font-medium text-[#081EEA]">
                    {kelas.jumlahSiswa} Siswa
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
