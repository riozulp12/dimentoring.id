import type { ReactNode } from "react";
import { randomUUID } from "node:crypto";
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

/**
 * Edit / lihat bacaan beserta soal-soalnya dalam satu halaman (Mentor) — PR 3b,
 * UX-3. Stimulus mentor lain = 404. ?tambah=1 membuka satu kartu soal baru
 * (dipakai route lama soal/baru?stimulus=<id>).
 */
export default async function EditStimulusPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const mentorId = await mentorHalamanStudio();
  const { id } = await params;
  const sp = await searchParams;
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
          soal={soal.map((s) => ({
            id: s.id,
            status: s.status,
            versi: s.versi,
            alasanTolak: s.alasan_tolak,
            form: {
              subtes_id: s.subtes_id,
              tipe: s.tipe,
              stimulus_id: s.stimulus_id,
              redaksi: s.redaksi,
              konten: s.konten,
              kunci: s.kunci,
              pembahasan: s.pembahasan,
              sumber_rujukan: s.sumber_rujukan,
              tingkat_kesulitan: s.tingkat_kesulitan,
              level_kognitif: s.level_kognitif,
              estimasi_waktu_detik: s.estimasi_waktu_detik,
            },
          }))}
          idKartuBaru={sp.tambah === "1" && ditugaskan && ["draf", "ditolak", "terpublikasi"].includes(stimulus.status) ? randomUUID() : null}
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
