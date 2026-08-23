import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ROLE_DASHBOARD_PATH, SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { getProfilData } from "@/lib/profil/getProfilData";
import { getReferralStats } from "@/lib/referral/getReferralData";
import {
  getSiswaAssessmentHistory,
  getSiswaKelasDiikuti,
  verifyStudentExists,
} from "@/lib/admin/getManajemenSiswaData";
import { JALUR_LABEL } from "@/lib/shared/ptnJurusanLabels";
import Avatar from "@/components/ui/Avatar";
import PageTitle from "@/components/dashboard/PageTitle";

/**
 * Detail Siswa (Admin) — PRD Bagian 5 & 13 (users, assessments, enrollments,
 * kelas, referrals, gamifikasi_profiles). REUSE query: info dasar+akademik
 * lewat lib/profil/getProfilData.ts (sama data yang dipakai halaman Profil
 * sendiri, cuma di-panggil dengan userId siswa target, bukan session), dan
 * statistik Referral lewat lib/referral/getReferralData.ts (role-agnostic,
 * sudah dipakai halaman Referral Siswa & Honor Mentor).
 */

const SUB_STATUS_LABEL: Record<string, string> = {
  calon_mahasiswa: "Calon Mahasiswa",
  mahasiswa: "Mahasiswa",
};

const TINGKAT_KELAS_LABEL: Record<string, string> = {
  kelas_10: "Kelas 10",
  kelas_11: "Kelas 11",
  kelas_12: "Kelas 12",
  gap_year: "Gap Year",
};

const STATUS_PEMBAYARAN_LABEL: Record<string, string> = {
  menunggu: "Menunggu",
  lunas: "Lunas",
  batal: "Batal",
};

const STATUS_PEMBAYARAN_BADGE: Record<string, string> = {
  menunggu: "bg-amber-50 text-amber-700",
  lunas: "bg-[#F0FDF4] text-[#0CBA00]",
  batal: "bg-[#FFEBEB] text-[#E70A0A]",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

function EmptySection({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-10 text-center">
      <p className="text-base text-[#7E7C7C]">{text}</p>
    </div>
  );
}

export default async function ManajemenSiswaDetailPage({
  params,
}: {
  params: Promise<{ siswaId: string }>;
}) {
  const { siswaId } = await params;

  const cookieStore = await cookies();
  const session = verifySessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return null;
  if (session.role !== "admin") {
    redirect(ROLE_DASHBOARD_PATH[session.role]);
  }

  const isStudent = await verifyStudentExists(siswaId);
  if (!isStudent) {
    redirect(`/manajemen-siswa?error=${encodeURIComponent("Siswa tidak ditemukan.")}`);
  }

  const [profil, referral, kelasDiikuti, riwayatAssessment] = await Promise.all([
    getProfilData(siswaId, "student"),
    getReferralStats(siswaId),
    getSiswaKelasDiikuti(siswaId),
    getSiswaAssessmentHistory(siswaId),
  ]);

  if (!profil) {
    redirect(`/manajemen-siswa?error=${encodeURIComponent("Siswa tidak ditemukan.")}`);
  }

  return (
    <>
      <PageTitle value={profil.nama} />
      <div className="mx-auto flex w-full max-w-[900px] flex-col gap-6 p-4 sm:gap-8 sm:p-6 lg:p-10">
        <div className="flex flex-col items-center gap-3 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-6 text-center sm:px-8">
          <Avatar avatarUrl={profil.avatarUrl} nama={profil.nama} size="lg" />
          <div className="flex flex-col gap-1">
            <h1 className="text-xl font-semibold tracking-[-0.02em] text-black">{profil.nama}</h1>
            <p className="text-sm text-[#7E7C7C]">{profil.email}</p>
            <p className="text-sm text-[#7E7C7C]">{profil.noWa}</p>
          </div>
          <p className="text-xs text-[#7E7C7C]">Daftar {formatDate(profil.createdAt)}</p>
        </div>

        <div className="flex flex-col gap-4 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-5 sm:px-8 sm:py-6">
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-black sm:text-xl">Info Akademik</h2>
          <div className="grid grid-cols-2 gap-4 text-sm sm:gap-6">
            <div className="col-span-2">
              <p className="text-[#7E7C7C]">Sekolah</p>
              <p className="text-black">{profil.namaSekolah ?? "-"}</p>
            </div>
            <div>
              <p className="text-[#7E7C7C]">Provinsi</p>
              <p className="text-black">{profil.provinsiNama ?? "-"}</p>
            </div>
            <div>
              <p className="text-[#7E7C7C]">Tingkat Kelas</p>
              <p className="text-black">
                {profil.tingkatKelas ? (TINGKAT_KELAS_LABEL[profil.tingkatKelas] ?? profil.tingkatKelas) : "-"}
              </p>
            </div>
            <div className="col-span-2">
              <p className="text-[#7E7C7C]">Status</p>
              <p className="text-black">
                {profil.subStatus ? (SUB_STATUS_LABEL[profil.subStatus] ?? profil.subStatus) : "-"}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <p className="text-sm text-[#7E7C7C]">Mapel Tersulit</p>
            {profil.mapelTersulit.length === 0 ? (
              <p className="text-sm text-black">-</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {profil.mapelTersulit.map((nama) => (
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

        <div className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-black sm:text-xl">Riwayat Assessment</h2>
          {riwayatAssessment.length === 0 ? (
            <EmptySection text="Siswa ini belum pernah mengerjakan Assessment Prediksi PTN." />
          ) : (
            <div className="flex flex-col gap-3">
              {riwayatAssessment.map((item) => (
                <Link
                  key={item.id}
                  href={`/assessment/hasil/${item.id}`}
                  className="flex items-center justify-between gap-3 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-4 transition-colors hover:border-[#081EEA]"
                >
                  <div className="flex flex-col gap-1">
                    <p className="text-base text-black">{JALUR_LABEL[item.jalur] ?? item.jalur}</p>
                    <p className="text-sm text-[#7E7C7C]">{formatDate(item.createdAt)}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <p className="text-base font-semibold text-[#081EEA]">
                      {item.nilaiAkhir !== null ? item.nilaiAkhir.toFixed(2) : "-"}
                    </p>
                    {item.nilaiAkhirLabel ? (
                      <p className="text-xs text-[#7E7C7C]">{item.nilaiAkhirLabel}</p>
                    ) : null}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-black sm:text-xl">Kelas Diikuti</h2>
          {kelasDiikuti.length === 0 ? (
            <EmptySection text="Siswa ini belum mengikuti kelas apa pun." />
          ) : (
            <div className="flex flex-col gap-3">
              {kelasDiikuti.map((kelas) => (
                <div
                  key={kelas.id}
                  className="flex items-center justify-between gap-3 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-4"
                >
                  <div className="flex flex-col gap-1">
                    <p className="text-base text-black">{kelas.nama}</p>
                    <p className="text-sm text-[#7E7C7C]">Progress {kelas.progresPersen}%</p>
                  </div>
                  <span
                    className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      STATUS_PEMBAYARAN_BADGE[kelas.statusPembayaran] ?? "bg-gray-100 text-[#7E7C7C]"
                    }`}
                  >
                    {STATUS_PEMBAYARAN_LABEL[kelas.statusPembayaran] ?? kelas.statusPembayaran}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-5 sm:px-8 sm:py-6">
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-black sm:text-xl">Referral</h2>
          {referral.kodeReferral === null ? (
            <p className="mt-3 text-sm text-[#7E7C7C]">Siswa ini belum punya kode referral.</p>
          ) : (
            <div className="mt-3 grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-lg font-semibold text-black">{referral.kodeReferral}</p>
                <p className="text-xs text-[#7E7C7C]">Kode Referral</p>
              </div>
              <div>
                <p className="text-lg font-semibold text-black">{referral.totalPendaftaran}</p>
                <p className="text-xs text-[#7E7C7C]">Pendaftaran</p>
              </div>
              <div>
                <p className="text-lg font-semibold text-[#081EEA]">{referral.totalPoin}</p>
                <p className="text-xs text-[#7E7C7C]">Poin</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
