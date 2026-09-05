import Link from "next/link";
import KelasCardVisual from "@/components/ui/KelasCardVisual";
import LihatSiswaButton from "@/components/mentor/LihatSiswaButton";
import type { MentorKelasItem } from "@/lib/mentor/getKelasSayaData";

/**
 * Card "Kelas Saya" (Mentor) — PRD 7.5 poin 3 (revisi card kelas). Banner
 * pakai KelasCardVisual variant="diampu" (badge jumlah siswa aktif
 * menggantikan elemen jualan — kelas ini diampu, bukan dijual ke mentor
 * sendiri), konten bawah tombol "Lihat Siswa" ke Siswa Saya terfilter kelas
 * ini (/siswa-binaan?kelasId=...).
 */

export interface KelasSayaCardProps extends MentorKelasItem {
  index: number;
}

export default function KelasSayaCard({
  id,
  nama,
  subtesNama,
  programKategori,
  tingkatKelas,
  jadwal,
  jumlahSiswa,
  linkMeetBelumDiatur,
  index,
}: KelasSayaCardProps) {
  return (
    <Link
      href={`/kelas-saya/${id}`}
      className="flex flex-col overflow-hidden rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white shadow-[1px_2px_4px_0px_rgba(0,0,0,0.1)] transition-shadow hover:shadow-[1px_2px_8px_0px_rgba(0,0,0,0.15)]"
    >
      <KelasCardVisual
        variant="diampu"
        namaKelas={nama}
        index={index}
        jumlahSiswaAktif={jumlahSiswa}
        programKategori={programKategori}
        tingkatKelas={tingkatKelas}
        subtesNama={subtesNama}
      />

      <div className="flex min-w-0 flex-col gap-1.5 p-4">
        <p className="text-base leading-[1.5] font-semibold tracking-[-0.36px] text-black">{nama}</p>
        <div className="flex flex-wrap items-center gap-2 text-sm text-[#7E7C7C]">
          <span>{jadwal}</span>
          {linkMeetBelumDiatur ? (
            <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
              Link Meet belum diatur
            </span>
          ) : null}
        </div>
        <LihatSiswaButton kelasId={id} />
      </div>
    </Link>
  );
}
