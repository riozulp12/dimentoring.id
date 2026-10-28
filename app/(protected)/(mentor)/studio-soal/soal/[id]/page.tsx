import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import PageTitle from "@/components/dashboard/PageTitle";
import FormSoal, { type StimulusKonteks } from "@/components/studio-soal/FormSoal";
import KartuPesan from "@/components/studio-soal/KartuPesan";
import { mentorHalamanStudio } from "@/lib/mentor/studioSoalHalaman";
import {
  getSoalMilik,
  getStimulusMilik,
  getSubtesById,
  getSubtesDitugaskan,
  pernahDiajukan,
} from "@/lib/mentor/studioSoal";
import { isUuid } from "@/lib/shared/studio-soal/formSoal";

/**
 * Edit / lihat soal (Mentor) — PR 3b. Hanya soal tulisan mentor ini; soal
 * mentor lain = 404 (tidak membocorkan keberadaannya). Draf/ditolak bisa
 * diedit; diajukan/terbit terkunci (Tarik / Buat versi baru).
 */
export default async function EditSoalPage({ params }: { params: Promise<{ id: string }> }) {
  const mentorId = await mentorHalamanStudio();
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const [soal, subtes] = await Promise.all([getSoalMilik(mentorId, id), getSubtesDitugaskan(mentorId)]);
  let isi: ReactNode;
  if (soal === "gagal" || subtes === "gagal") {
    isi = <KartuPesan judul="Soal gagal dimuat" isi="Coba muat ulang halaman." />;
  } else if (!soal) {
    notFound();
  } else {
    const ditugaskan = subtes.some((s) => s.id === soal.subtes_id);
    const [stimulusRow, sudahDiajukan, subtesSoal] = await Promise.all([
      soal.stimulus_id ? getStimulusMilik(mentorId, soal.stimulus_id) : Promise.resolve(null),
      pernahDiajukan("soal", soal.id),
      ditugaskan ? Promise.resolve(null) : getSubtesById(soal.subtes_id),
    ]);
    if (stimulusRow === "gagal" || sudahDiajukan === "gagal" || subtesSoal === "gagal") {
      isi = <KartuPesan judul="Soal gagal dimuat" isi="Coba muat ulang halaman." />;
    } else {
      const stimulus: StimulusKonteks | null = stimulusRow
        ? { id: stimulusRow.id, judul: stimulusRow.judul_internal, status: stimulusRow.status, blok: stimulusRow.konten.blok }
        : null;
      isi = (
        <FormSoal
          id={soal.id}
          baru={false}
          awal={{
            subtes_id: soal.subtes_id,
            tipe: soal.tipe,
            stimulus_id: soal.stimulus_id,
            redaksi: soal.redaksi,
            konten: soal.konten,
            kunci: soal.kunci,
            pembahasan: soal.pembahasan,
            sumber_rujukan: soal.sumber_rujukan,
            tingkat_kesulitan: soal.tingkat_kesulitan,
            level_kognitif: soal.level_kognitif,
            estimasi_waktu_detik: soal.estimasi_waktu_detik,
          }}
          status={soal.status}
          versi={soal.versi}
          alasanTolak={soal.alasan_tolak}
          pernahDiajukan={sudahDiajukan}
          subtesPilihan={subtesSoal ? [...subtes, subtesSoal] : subtes}
          stimulus={stimulus}
          ditugaskan={ditugaskan}
        />
      );
    }
  }

  return (
    <>
      <PageTitle value="Studio Soal" />
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 p-4 sm:p-6 lg:p-10">{isi}</div>
    </>
  );
}
