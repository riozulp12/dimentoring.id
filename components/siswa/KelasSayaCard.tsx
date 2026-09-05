import Link from "next/link";
import KelasCardVisual from "@/components/ui/KelasCardVisual";
import type { KelasSayaItem } from "@/lib/siswa/getKelasSayaData";

/**
 * Card "Kelas Saya" (Siswa, kelas SUDAH lunas) — PRD 7.5 poin 2 (revisi
 * combobox/card kelas). Banner pakai KelasCardVisual variant="dimiliki"
 * (progress bar materi menggantikan elemen jualan), konten bawah tombol
 * "Lanjut Belajar" ke halaman materi (/kelas/[id]) — BUKAN checkout, karena
 * kelas ini sudah dibeli. Menggantikan components/siswa/KelasCard.tsx lama
 * (dulu dipakai gabung untuk Kelas Saya + Rekomendasi, sekarang dipisah:
 * Rekomendasi pakai KelasCardFrame+KelasCardMeta yang sama dengan /program).
 */

export interface KelasSayaCardProps extends KelasSayaItem {
  index: number;
}

export default function KelasSayaCard({
  id,
  nama,
  mentorNama,
  jadwal,
  progresPersen,
  programKategori,
  tingkatKelas,
  subtesNama,
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
        progresPersen={progresPersen}
        programKategori={programKategori}
        tingkatKelas={tingkatKelas}
        subtesNama={subtesNama}
      />

      <div className="flex min-w-0 flex-col gap-1.5 p-4">
        <p className="text-base leading-[1.5] font-semibold tracking-[-0.36px] text-black">{nama}</p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[#7E7C7C]">
          {mentorNama ? <span>Mentor: {mentorNama}</span> : null}
          <span>{jadwal}</span>
        </div>
        <span className="mt-1 inline-flex w-full items-center justify-center rounded-[18px] bg-[#081EEA] px-4 py-2 text-sm font-medium text-white">
          Lanjut Belajar
        </span>
      </div>
    </Link>
  );
}
