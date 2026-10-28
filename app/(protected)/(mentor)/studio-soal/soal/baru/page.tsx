import type { ReactNode } from "react";
import { randomUUID } from "node:crypto";
import PageTitle from "@/components/dashboard/PageTitle";
import FormSoal, { type StimulusKonteks } from "@/components/studio-soal/FormSoal";
import KartuPesan from "@/components/studio-soal/KartuPesan";
import { mentorHalamanStudio } from "@/lib/mentor/studioSoalHalaman";
import { getStimulusMilik, getSubtesDitugaskan } from "@/lib/mentor/studioSoal";
import { formAwal, isUuid } from "@/lib/shared/studio-soal/formSoal";
import { TIPE_SOAL, type TipeSoal } from "@/lib/shared/studio-soal/tipe";

/**
 * "Tulis soal" (Mentor) — PR 3b. Pilihan subtes hanya subtes yang DITUGASKAN
 * Admin. ?subtes= memilih subtes awal; ?stimulus= menambah soal ke stimulus
 * milik sendiri (K7). Id soal dibuat di server per kunjungan halaman, jadi
 * simpan berulang dari form ini selalu menuju soal yang sama.
 */
export default async function SoalBaruPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const mentorId = await mentorHalamanStudio();
  const sp = await searchParams;
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
    let stimulus: StimulusKonteks | null = null;
    let gagal: ReactNode = null;
    const paramSubtes = typeof sp.subtes === "string" ? sp.subtes : "";
    let subtesId = subtes.some((s) => s.id === paramSubtes) ? paramSubtes : subtes.length === 1 ? subtes[0].id : "";

    if (typeof sp.stimulus === "string") {
      const st = isUuid(sp.stimulus) ? await getStimulusMilik(mentorId, sp.stimulus) : null;
      if (st === "gagal") {
        gagal = <KartuPesan judul="Bacaan gagal dimuat" isi="Coba muat ulang halaman." />;
      } else if (!st) {
        gagal = <KartuPesan judul="Bacaan tidak ditemukan" isi="Soal hanya bisa ditambahkan ke bacaan yang Anda tulis sendiri." />;
      } else if (!subtes.some((s) => s.id === st.subtes_id)) {
        gagal = <KartuPesan judul="Anda tidak lagi ditugaskan ke subtes bacaan ini" />;
      } else if (!["draf", "ditolak", "terpublikasi"].includes(st.status)) {
        gagal = <KartuPesan judul="Bacaan ini belum bisa ditambah soal" isi="Bacaan ini sedang dicek atau sudah tidak aktif." />;
      } else {
        stimulus = { id: st.id, judul: st.judul_internal, status: st.status, blok: st.konten.blok };
        subtesId = st.subtes_id;
      }
    }

    const tipe: TipeSoal = (TIPE_SOAL as readonly string[]).includes(String(sp.tipe)) ? (sp.tipe as TipeSoal) : "pilihan_ganda";
    isi =
      gagal ??
      (
        <FormSoal
          id={randomUUID()}
          baru
          awal={formAwal(subtesId, tipe, stimulus?.id ?? null)}
          status="draf"
          versi={1}
          alasanTolak={null}
          pernahDiajukan={false}
          subtesPilihan={subtes}
          stimulus={stimulus}
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
