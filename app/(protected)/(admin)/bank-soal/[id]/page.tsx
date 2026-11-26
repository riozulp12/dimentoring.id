import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ROLE_DASHBOARD_PATH, SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import PageTitle from "@/components/dashboard/PageTitle";
import DetailSoalAdmin from "@/components/admin/DetailSoalAdmin";
import { pesanKelas } from "@/components/studio-soal/gaya";
import { requireAdminAktif } from "@/lib/admin/enrollmentManual";
import { getDetailSoalAdmin } from "@/lib/admin/bankSoal";
import { isUuid } from "@/lib/shared/studio-soal/formSoal";

/** Pratinjau satu soal di Bank Soal (Admin). Kunci jawaban hanya sampai ke Admin aktif. */
export default async function DetailSoalPage({ params }: { params: Promise<{ id: string }> }) {
  const cookie = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  const session = verifySessionToken(cookie);
  if (!session) return null;
  if (session.role !== "admin") {
    redirect(ROLE_DASHBOARD_PATH[session.role]);
  }
  const auth = await requireAdminAktif(cookie);
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const detail = auth.ok ? await getDetailSoalAdmin(id) : "gagal";
  if (detail === null) notFound();

  return (
    <>
      <PageTitle value="Bank Soal" />
      <div className="mx-auto flex w-full max-w-[900px] flex-col gap-6 p-4 sm:p-6 lg:p-10">
        {detail === "gagal" ? (
          <p role="alert" className={pesanKelas("gagal")}>
            {auth.ok ? "Soal belum bisa dimuat. Muat ulang halaman sebentar lagi." : auth.error}
          </p>
        ) : (
          <DetailSoalAdmin
            id={detail.soal.id}
            sumber={detail.soal.sumber}
            soal={{
              tipe: detail.soal.tipe,
              redaksi: detail.soal.redaksi,
              konten: detail.soal.konten,
              kunci: detail.soal.kunci,
              pembahasan: detail.soal.pembahasan,
            }}
            metadata={{
              subtes: detail.subtes.nama,
              topik: detail.topik,
              kesulitan: detail.soal.tingkat_kesulitan,
              level: detail.soal.level_kognitif,
              estimasiDetik: detail.soal.estimasi_waktu_detik,
              versi: detail.soal.versi,
              status: detail.soal.status,
            }}
            bacaan={detail.bacaan?.blok ?? null}
            versiTerbuka={detail.versiTerbuka}
          />
        )}
      </div>
    </>
  );
}
