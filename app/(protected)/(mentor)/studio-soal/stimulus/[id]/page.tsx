import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import PageTitle from "@/components/dashboard/PageTitle";
import FormStimulus from "@/components/studio-soal/FormStimulus";
import KartuPesan from "@/components/studio-soal/KartuPesan";
import { mentorHalamanStudio } from "@/lib/mentor/studioSoalHalaman";
import {
  getSoalDiStimulus,
  getStimulusMilik,
  getSubtesById,
  getSubtesDitugaskan,
  pernahDiajukan,
} from "@/lib/mentor/studioSoal";
import { isUuid } from "@/lib/shared/studio-soal/formSoal";

/** Edit / lihat stimulus (Mentor) — PR 3b. Stimulus mentor lain = 404. */
export default async function EditStimulusPage({ params }: { params: Promise<{ id: string }> }) {
  const mentorId = await mentorHalamanStudio();
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const [stimulus, subtes, soal, sudahDiajukan] = await Promise.all([
    getStimulusMilik(mentorId, id),
    getSubtesDitugaskan(mentorId),
    getSoalDiStimulus(mentorId, id),
    pernahDiajukan("stimulus", id),
  ]);
  let isi: ReactNode;
  if (stimulus === "gagal" || subtes === "gagal" || soal === "gagal" || sudahDiajukan === "gagal") {
    isi = <KartuPesan judul="Bacaan gagal dimuat" isi="Coba muat ulang halaman." />;
  } else if (!stimulus) {
    notFound();
  } else {
    const ditugaskan = subtes.some((s) => s.id === stimulus.subtes_id);
    const subtesStimulus = ditugaskan ? null : await getSubtesById(stimulus.subtes_id);
    if (subtesStimulus === "gagal") {
      isi = <KartuPesan judul="Bacaan gagal dimuat" isi="Coba muat ulang halaman." />;
    } else {
      isi = (
        <FormStimulus
          id={stimulus.id}
          baru={false}
          awal={{
            subtes_id: stimulus.subtes_id,
            judul_internal: stimulus.judul_internal,
            sumber_rujukan: stimulus.sumber_rujukan,
            konten: stimulus.konten,
          }}
          status={stimulus.status}
          versi={stimulus.versi}
          alasanTolak={stimulus.alasan_tolak}
          pernahDiajukan={sudahDiajukan}
          subtesPilihan={subtesStimulus ? [...subtes, subtesStimulus] : subtes}
          ditugaskan={ditugaskan}
          soal={soal.map((s) => ({ id: s.id, tipe: s.tipe, status: s.status, urutan: s.urutan_dalam_stimulus, redaksi: s.redaksi }))}
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
