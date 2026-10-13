import Link from "next/link";
import KelasCardVisual from "@/components/ui/KelasCardVisual";
import ModePembelajaranBadge from "@/components/ui/ModePembelajaranBadge";
import type { KelasSayaItem } from "@/lib/siswa/getKelasSayaData";

/**
 * Card "Kelas Saya" (Siswa, kelas SUDAH lunas) — PRD 7.5 poin 2 (revisi
 * combobox/card kelas). Banner pakai KelasCardVisual variant="dimiliki"
 * (tanpa elemen jualan, badge "Selesai" kalau kelas sudah selesai), konten
 * bawah = garis Progress KEHADIRAN (lib/shared/progresSesi.ts — angka yang
 * sama dengan "Progress Kehadiran" di detail kelas, BUKAN progres materi) +
 * tombol "Lanjut Belajar" ke halaman materi (/kelas/[id]) — BUKAN checkout,
 * karena kelas ini sudah dibeli. Seluruh card = satu <Link>; "tombol" di
 * dalamnya cuma <span> bergaya tombol, bukan <button>/<a> bersarang. Menggantikan components/siswa/KelasCard.tsx lama
 * (dulu dipakai gabung untuk Kelas Saya + Rekomendasi, sekarang dipisah:
 * Rekomendasi pakai KelasCardFrame+KelasCardMeta yang sama dengan /program).
 */

export interface KelasSayaCardProps extends KelasSayaItem {
  index: number;
}

export default function KelasSayaCard({
  id,
  nama,
  jadwal,
  progresPersen,
  selesai,
  programKategori,
  tingkatKelas,
  subtesNama,
  modePembelajaran,
  index,
}: KelasSayaCardProps) {
  return (
    <Link
      href={`/kelas/${id}`}
      className="flex flex-col overflow-hidden rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white shadow-[1px_2px_4px_0px_rgba(0,0,0,0.1)] transition-shadow hover:shadow-[1px_2px_8px_0px_rgba(0,0,0,0.15)]"
    >
      <KelasCardVisual
        variant="dimiliki"
        namaKelas={nama}
        index={index}
        selesai={selesai}
        programKategori={programKategori}
        tingkatKelas={tingkatKelas}
        subtesNama={subtesNama}
      />

      <div className="flex min-w-0 flex-col gap-1.5 p-4">
        <ModePembelajaranBadge modePembelajaran={modePembelajaran} />
        <p className="text-base leading-[1.5] font-semibold tracking-[-0.36px] text-black">{nama}</p>
        {/* Info Mentor SENGAJA tidak ditampilkan di card (declutter, sama
            dengan card /program) — nama mentor tetap tampil di halaman DETAIL
            kelas (app/(protected)/(siswa)/kelas/[kelasId]/page.tsx). */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[#7E7C7C]">
          <span>{jadwal}</span>
        </div>
        <div className="mt-1 flex items-center gap-3">
          <div
            role="progressbar"
            aria-label="Progress Kehadiran"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progresPersen}
            className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-[#F0F0F0]"
          >
            <div className="h-full rounded-full bg-[#081EEA]" style={{ width: `${progresPersen}%` }} />
          </div>
          <span className="shrink-0 text-sm font-semibold text-black tabular-nums">{progresPersen}%</span>
        </div>
        <span className="mt-1 inline-flex w-full items-center justify-center rounded-[18px] bg-[#081EEA] px-4 py-2 text-sm font-medium text-white">
          Lanjut Belajar
        </span>
      </div>
    </Link>
  );
}
