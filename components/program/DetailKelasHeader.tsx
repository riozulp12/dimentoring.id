import type { ReactNode } from "react";
import ModePembelajaranBadge from "@/components/ui/ModePembelajaranBadge";

function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex w-fit items-center rounded-full bg-[#F9FAFF] px-3 py-1 text-xs font-medium text-[#081EEA]">
      {children}
    </span>
  );
}

/**
 * Header halaman detail kelas publik: judul + chip (2 per baris, juga di HP) di kiri, harga (`hargaSlot`) di kanan,
 * sejajar dengan judul. Jadwal dan jumlah sesi SENGAJA tidak ditampilkan di sini (datanya tetap ada di tempat lain).
 */
export default function DetailKelasHeader({
  nama,
  modePembelajaran,
  tipeKelasLabel,
  subtesNama,
  tingkatKelasLabel,
  hargaSlot,
}: {
  nama: string;
  modePembelajaran: string;
  tipeKelasLabel: string;
  subtesNama: string | null;
  tingkatKelasLabel: string;
  hargaSlot: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="flex flex-col gap-2.5">
        <h1 className="text-2xl font-bold tracking-[-0.02em] text-black sm:text-3xl">{nama}</h1>
        <div className="grid w-fit grid-cols-2 items-center justify-items-start gap-2">
          <ModePembelajaranBadge modePembelajaran={modePembelajaran} />
          <Badge>{tipeKelasLabel}</Badge>
          {subtesNama ? <Badge>{subtesNama}</Badge> : null}
          <Badge>{tingkatKelasLabel}</Badge>
        </div>
      </div>
      {hargaSlot}
    </div>
  );
}
