import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ROLE_DASHBOARD_PATH, SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { getMentorRoleStatus } from "@/lib/mentor/getMentorRoleStatus";
import { getMentorKelasDetail, getMentorMateriList } from "@/lib/mentor/getKelasSayaData";
import PageTitle from "@/components/dashboard/PageTitle";
import LinkMeetForm from "@/components/mentor/LinkMeetForm";

/**
 * Detail Kelas (Mentor) — PRD Bagian 7.5.1. GUARD: kelas.mentor_id harus sama
 * dengan mentor yang login (BR-7) — dicek server-side di sini, bukan cuma
 * disembunyikan di UI, supaya mentor A tidak bisa buka kelas mentor B lewat
 * ganti URL manual.
 */

const TIPE_LABEL: Record<string, string> = {
  video: "Video",
  dokumen: "Dokumen",
  rangkuman_teks: "Rangkuman",
};

const STATUS_BADGE: Record<string, string> = {
  published: "bg-[#F0FDF4] text-[#0CBA00]",
  draft: "bg-amber-50 text-amber-700",
  ditolak: "bg-[#FFEBEB] text-[#E70A0A]",
};

const STATUS_LABEL: Record<string, string> = {
  published: "Published",
  draft: "Draft",
  ditolak: "Ditolak",
};

export default async function KelasSayaDetailMentorPage({
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

  // BR-27: fitur mengajar (termasuk detail Kelas Saya) terkunci selama Pending.
  if ((await getMentorRoleStatus(session.userId)) !== "active") {
    redirect("/dashboard/mentor");
  }

  const kelas = await getMentorKelasDetail(kelasId);

  // BR-7: kelas tidak ada, ATAU ada tapi bukan kelas yang di-assign ke mentor
  // ini — dua-duanya ditolak dengan pesan yang sama supaya tidak bocorkan
  // informasi kelas mentor lain lewat pesan error yang beda.
  if (!kelas || kelas.mentorId !== session.userId) {
    redirect(`/kelas-saya?error=${encodeURIComponent("Kelas tidak ditemukan atau bukan kelas yang kamu ampu.")}`);
  }

  const materiList = await getMentorMateriList(kelasId);

  return (
    <>
      <PageTitle value={kelas.nama} />
      <div className="mx-auto flex w-full max-w-[900px] flex-col gap-6 p-4 sm:gap-8 sm:p-6 lg:p-10">
        <div className="flex flex-col gap-4 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-4 sm:px-8 sm:py-6">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-[-0.02em] text-black">{kelas.nama}</h1>
            <div className="flex flex-wrap items-center gap-2">
              {kelas.subtesNama ? (
                <span className="inline-flex items-center rounded-full bg-[#F9FAFF] px-2.5 py-0.5 text-xs font-medium text-[#081EEA]">
                  {kelas.subtesNama}
                </span>
              ) : null}
              <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-[#7E7C7C]">
                {kelas.tingkatKelasLabel}
              </span>
            </div>
          </div>
          <p className="text-sm text-[#7E7C7C] sm:text-base">{kelas.jumlahSiswa} siswa terdaftar</p>

          <LinkMeetForm kelasId={kelas.id} initialLinkMeet={kelas.linkMeet} />
        </div>

        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-medium tracking-[-0.02em] text-black sm:text-xl">Materi</h2>
          <Link
            href={`/kelas-saya/${kelas.id}/tambah-materi`}
            className="inline-flex items-center justify-center rounded-[18px] bg-[#081EEA] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
          >
            + Tambah Materi
          </Link>
        </div>

        {materiList.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-10 text-center">
            <p className="text-base text-[#7E7C7C]">
              Belum ada materi untuk kelas ini. Klik &quot;Tambah Materi&quot; untuk mulai.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {materiList.map((item) => (
              <div
                key={item.id}
                className="flex flex-col gap-2 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-4 sm:px-6"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center rounded-full bg-[#F9FAFF] px-2.5 py-0.5 text-xs font-medium text-[#081EEA]">
                    {TIPE_LABEL[item.tipe]}
                  </span>
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[item.status]}`}>
                    {STATUS_LABEL[item.status]}
                  </span>
                  <span className="inline-flex items-center rounded-full bg-purple-50 px-2.5 py-0.5 text-xs font-medium text-purple-700">
                    {item.sumber === "ai_generated" ? "Dibuat AI" : "Upload Manual"}
                  </span>
                </div>
                <p className="text-base text-black">{item.judul}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
