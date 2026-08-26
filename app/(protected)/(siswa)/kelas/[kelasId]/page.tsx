import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ROLE_DASHBOARD_PATH, SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import {
  getEnrollmentStatus,
  getKelasDetail,
  getMateriFull,
  getMateriPreview,
  type MateriTipe,
} from "@/lib/siswa/getKelasDetail";
import PageTitle from "@/components/dashboard/PageTitle";
import MateriList from "@/components/siswa/MateriList";

/**
 * Detail Kelas — PRD Bagian 7.5.1. Guard akses: cuma siswa dengan enrollment
 * status_pembayaran='lunas' untuk kelas ini yang lihat materi lengkap +
 * "Gabung Sesi Live". Siswa lain (belum daftar sama sekali, termasuk yang
 * klik dari card "Rekomendasi Kelas") tetap boleh buka URL ini, tapi cuma
 * lihat preview info kelas + 2-3 judul materi + CTA ajakan daftar — bukan
 * di-redirect keluar, karena preview justru fungsi upsell dari Rekomendasi.
 * Kelas yang benar-benar tidak ada baru di-redirect balik ke /kelas dengan
 * pesan error.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TIPE_LABEL: Record<MateriTipe, string> = {
  video: "Video",
  dokumen: "Dokumen",
  rangkuman_teks: "Rangkuman",
};

export default async function KelasDetailPage({
  params,
}: {
  params: Promise<{ kelasId: string }>;
}) {
  const { kelasId } = await params;

  const cookieStore = await cookies();
  const session = verifySessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return null;
  if (session.role !== "student") {
    redirect(ROLE_DASHBOARD_PATH[session.role]);
  }

  if (!UUID_RE.test(kelasId)) {
    redirect(`/kelas?error=${encodeURIComponent("Kelas tidak ditemukan.")}`);
  }

  const kelas = await getKelasDetail(kelasId);
  if (!kelas) {
    redirect(`/kelas?error=${encodeURIComponent("Kelas tidak ditemukan.")}`);
  }

  const enrollment = await getEnrollmentStatus(session.userId, kelasId);
  const isLunas = enrollment.statusPembayaran === "lunas";

  return (
    <>
      <PageTitle value={kelas.nama} />
      <div className="mx-auto flex w-full max-w-[900px] flex-col gap-6 p-4 sm:gap-8 sm:p-6 lg:p-10">
        <div className="flex flex-col gap-4 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-4 sm:px-8 sm:py-6">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-[-0.02em] text-black">{kelas.nama}</h1>
            {kelas.subtesNama ? <p className="text-sm text-[#7E7C7C]">{kelas.subtesNama}</p> : null}
          </div>
          <div className="flex flex-col gap-1 text-sm text-[#7E7C7C] sm:text-base">
            <p>{kelas.mentorNama ? `Mentor: ${kelas.mentorNama}` : "Mentor belum ditentukan"}</p>
            <p>{kelas.jadwal}</p>
          </div>

          {kelas.deskripsi ? <p className="text-sm text-black sm:text-base">{kelas.deskripsi}</p> : null}

          {isLunas ? (
            kelas.linkMeet ? (
              <a
                href={kelas.linkMeet}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-fit items-center justify-center rounded-[18px] bg-[#081EEA] px-5 py-2 text-sm font-medium text-white transition hover:opacity-90 sm:text-base"
              >
                Gabung Sesi Live
              </a>
            ) : (
              <div className="flex w-fit flex-col gap-1">
                <span
                  aria-disabled="true"
                  className="inline-flex w-fit cursor-not-allowed items-center justify-center rounded-[18px] bg-[#E3E3E3] px-5 py-2 text-sm font-medium text-[#7E7C7C] sm:text-base"
                >
                  Gabung Sesi Live
                </span>
                <p className="text-xs text-[#7E7C7C]">Link akan tersedia menjelang jadwal kelas.</p>
              </div>
            )
          ) : null}
        </div>

        {isLunas ? (
          <FullMateriSection kelasId={kelasId} userId={session.userId} progresPersen={enrollment.progresPersen} />
        ) : (
          <PreviewSection kelasId={kelasId} />
        )}
      </div>
    </>
  );
}

async function FullMateriSection({
  kelasId,
  userId,
  progresPersen,
}: {
  kelasId: string;
  userId: string;
  progresPersen: number;
}) {
  const materi = await getMateriFull(kelasId, userId);

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-medium tracking-[-0.02em] text-black sm:text-xl">Materi Belajar</h2>
      {materi.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-10 text-center">
          <p className="text-base text-[#7E7C7C]">Materi untuk kelas ini akan segera tersedia</p>
        </div>
      ) : (
        <MateriList items={materi} initialProgresPersen={progresPersen} />
      )}
    </section>
  );
}

async function PreviewSection({ kelasId }: { kelasId: string }) {
  const preview = await getMateriPreview(kelasId);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-[20px] border border-dashed border-[#AFAFAF] bg-[#F9FAFF] px-5 py-4 text-center sm:px-8 sm:py-6">
        <p className="text-base text-black">
          Kamu belum terdaftar di kelas ini. Daftar &amp; selesaikan pembayaran untuk membuka semua materi dan
          sesi live bareng mentor.
        </p>
        <Link
          href={`/checkout/${kelasId}`}
          className="mx-auto inline-flex w-fit items-center justify-center rounded-[18px] bg-[#081EEA] px-5 py-2 text-sm font-medium text-white transition hover:opacity-90 sm:text-base"
        >
          Daftar Kelas Ini
        </Link>
      </div>

      <h2 className="text-lg font-medium tracking-[-0.02em] text-black sm:text-xl">Cuplikan Materi</h2>
      {preview.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-10 text-center">
          <p className="text-base text-[#7E7C7C]">Materi untuk kelas ini akan segera tersedia</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {preview.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-3 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-4"
            >
              <span className="inline-flex shrink-0 items-center rounded-full bg-[#F9FAFF] px-2.5 py-0.5 text-xs font-medium text-[#081EEA]">
                {TIPE_LABEL[item.tipe]}
              </span>
              <p className="text-base text-black">{item.judul}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
