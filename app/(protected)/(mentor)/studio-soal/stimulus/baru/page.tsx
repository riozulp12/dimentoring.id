import type { ReactNode } from "react";
import { randomUUID } from "node:crypto";
import PageTitle from "@/components/dashboard/PageTitle";
import FormStimulus from "@/components/studio-soal/FormStimulus";
import KartuPesan from "@/components/studio-soal/KartuPesan";
import { mentorHalamanStudio } from "@/lib/mentor/studioSoalHalaman";
import { getSubtesDitugaskan } from "@/lib/mentor/studioSoal";
import { stimulusAwal } from "@/lib/shared/studio-soal/formSoal";

/** "Buat stimulus" (Mentor) — PR 3b. Pilihan subtes hanya yang ditugaskan Admin. */
export default async function StimulusBaruPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const mentorId = await mentorHalamanStudio();
  const sp = await searchParams;
  const subtes = await getSubtesDitugaskan(mentorId);

  let isi: ReactNode;
  if (subtes === "gagal") {
    isi = <KartuPesan judul="Gagal memuat Studio Soal" isi="Coba muat ulang halaman." />;
  } else if (subtes.length === 0) {
    isi = (
      <KartuPesan
        judul="Anda belum ditugaskan ke subtes mana pun"
        isi="Admin yang menentukan subtes yang bisa Anda tulis soalnya. Hubungi Admin bila ingin ikut menulis soal."
      />
    );
  } else {
    const param = typeof sp.subtes === "string" ? sp.subtes : "";
    const subtesId = subtes.some((s) => s.id === param) ? param : subtes.length === 1 ? subtes[0].id : "";
    isi = (
      <FormStimulus
        id={randomUUID()}
        baru
        awal={stimulusAwal(subtesId)}
        status="draf"
        versi={1}
        alasanTolak={null}
        pernahDiajukan={false}
        subtesPilihan={subtes}
        ditugaskan
        soal={[]}
      />
    );
  }

  return (
    <>
      <PageTitle value="Studio Soal" />
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 p-4 sm:p-6 lg:p-10">{isi}</div>
    </>
  );
}
