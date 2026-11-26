import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ROLE_DASHBOARD_PATH, SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import PageTitle from "@/components/dashboard/PageTitle";
import EditSoalAdmin from "@/components/admin/EditSoalAdmin";
import { pesanKelas } from "@/components/studio-soal/gaya";
import { requireAdminAktif } from "@/lib/admin/enrollmentManual";
import { getDetailSoalAdmin } from "@/lib/admin/bankSoal";
import { urlGambarSoal } from "@/lib/admin/mediaSoal";
import { mediaDariKonten } from "@/lib/shared/studio-soal/gambar";
import { izinSoal } from "@/lib/shared/studio-soal/bankSoal";
import { isUuid } from "@/lib/shared/studio-soal/formSoal";

/** Sunting draf soal Buatan Sendiri (Admin). Soal lain diarahkan ke pratinjau. */
export default async function EditSoalPage({ params }: { params: Promise<{ id: string }> }) {
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
  if (detail !== "gagal" && !izinSoal(detail.soal).edit) redirect(`/bank-soal/${id}`);
  // Alamat gambar dibuat di server, sesudah guard Admin.
  const media =
    detail === "gagal"
      ? {}
      : await urlGambarSoal([...mediaDariKonten(detail.soal.konten), ...mediaDariKonten({ blok: detail.bacaan?.blok })]);

  return (
    <>
      <PageTitle value="Bank Soal" />
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 p-4 sm:p-6 lg:p-10">
        {detail === "gagal" ? (
          <p role="alert" className={pesanKelas("gagal")}>
            {auth.ok ? "Soal belum bisa dimuat. Muat ulang halaman sebentar lagi." : auth.error}
          </p>
        ) : (
          <EditSoalAdmin
            // Isi ulang form bila versi di server berubah.
            key={`${detail.soal.id}:${detail.soal.updated_at}`}
            id={detail.soal.id}
            media={media}
            updatedAt={detail.soal.updated_at}
            versi={detail.soal.versi}
            versiBaru={detail.soal.menggantikan_id !== null}
            subtes={detail.subtes}
            bacaan={detail.bacaan ? { judul: detail.bacaan.judul, blok: detail.bacaan.blok } : null}
            awal={{
              subtes_id: detail.soal.subtes_id,
              tipe: detail.soal.tipe,
              stimulus_id: detail.soal.stimulus_id,
              redaksi: detail.soal.redaksi,
              konten: detail.soal.konten,
              kunci: detail.soal.kunci,
              pembahasan: detail.soal.pembahasan,
              sumber_rujukan: detail.soal.sumber_rujukan ?? "",
              tingkat_kesulitan: detail.soal.tingkat_kesulitan,
              level_kognitif: detail.soal.level_kognitif,
              estimasi_waktu_detik: detail.soal.estimasi_waktu_detik,
            }}
          />
        )}
      </div>
    </>
  );
}
