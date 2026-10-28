import type { ReactNode } from "react";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import PageTitle from "@/components/dashboard/PageTitle";
import FormSoal from "@/components/studio-soal/FormSoal";
import KartuPesan from "@/components/studio-soal/KartuPesan";
import { mentorHalamanStudio } from "@/lib/mentor/studioSoalHalaman";
import { getSubtesDitugaskan } from "@/lib/mentor/studioSoal";
import { formAwal, isUuid } from "@/lib/shared/studio-soal/formSoal";
import { TIPE_SOAL, type TipeSoal } from "@/lib/shared/studio-soal/tipe";

/**
 * "Tulis soal" (Mentor) — PR 3b. Pilihan subtes hanya subtes yang DITUGASKAN
 * Admin. ?subtes= memilih subtes awal. Id soal dibuat di server per kunjungan
 * halaman, jadi simpan berulang dari form ini selalu menuju soal yang sama.
 *
 * UX-3: route lama ?stimulus=<id> diarahkan ke halaman bacaan itu dengan satu
 * kartu soal baru terbuka (bacaan & soalnya ditulis dalam satu halaman).
 * Pemeriksaan pemilik/penugasan/status dilakukan halaman bacaan.
 */
export default async function SoalBaruPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const mentorId = await mentorHalamanStudio();
  const sp = await searchParams;
  if (typeof sp.stimulus === "string" && isUuid(sp.stimulus)) {
    redirect(`/studio-soal/stimulus/${sp.stimulus}?tambah=1`);
  }
  const subtes = await getSubtesDitugaskan(mentorId);

  let isi: ReactNode;
  if (subtes === "gagal") {
    isi = <KartuPesan judul="Studio Soal gagal dimuat" isi="Coba muat ulang halaman." />;
  } else if (subtes.length === 0) {
    isi = (
      <KartuPesan
        judul="Anda belum ditugaskan menulis soal"
        isi="Admin yang memilih subtes yang bisa Anda tulis. Hubungi Admin kalau ingin ikut menulis soal."
      />
    );
  } else {
    const paramSubtes = typeof sp.subtes === "string" ? sp.subtes : "";
    const subtesId = subtes.some((s) => s.id === paramSubtes) ? paramSubtes : subtes.length === 1 ? subtes[0].id : "";
    // Alamat bacaan rusak (bukan UUID): sama dengan bacaan yang tidak ada.
    const gagal: ReactNode =
      typeof sp.stimulus === "string" ? (
        <KartuPesan judul="Bacaan tidak ditemukan" isi="Soal hanya bisa ditambahkan ke bacaan yang Anda tulis sendiri." />
      ) : null;

    const tipe: TipeSoal = (TIPE_SOAL as readonly string[]).includes(String(sp.tipe)) ? (sp.tipe as TipeSoal) : "pilihan_ganda";
    isi =
      gagal ??
      (
        <FormSoal
          id={randomUUID()}
          baru
          awal={formAwal(subtesId, tipe, null)}
          status="draf"
          versi={1}
          alasanTolak={null}
          pernahDiajukan={false}
          subtesPilihan={subtes}
          stimulus={null}
          ditugaskan
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
