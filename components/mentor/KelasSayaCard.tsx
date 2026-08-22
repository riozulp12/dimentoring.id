import Link from "next/link";
import type { MentorKelasItem } from "@/lib/mentor/getKelasSayaData";

export default function KelasSayaCard({
  id,
  nama,
  subtesNama,
  tingkatKelasLabel,
  jadwal,
  jumlahSiswa,
  kapasitas,
  linkMeetBelumDiatur,
}: MentorKelasItem) {
  return (
    <Link
      href={`/kelas-saya/${id}`}
      className="flex flex-col gap-3 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-4 transition-colors hover:border-[#081EEA] sm:px-6 sm:py-5"
    >
      <div className="flex flex-wrap items-center gap-2">
        {subtesNama ? (
          <span className="inline-flex items-center rounded-full bg-[#F9FAFF] px-2.5 py-0.5 text-xs font-medium text-[#081EEA]">
            {subtesNama}
          </span>
        ) : null}
        <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-[#7E7C7C]">
          {tingkatKelasLabel}
        </span>
        {linkMeetBelumDiatur ? (
          <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
            Link Meet belum diatur
          </span>
        ) : null}
      </div>

      <h3 className="text-lg font-medium tracking-[-0.02em] text-black">{nama}</h3>

      <div className="flex flex-col gap-1 text-sm text-[#7E7C7C]">
        <p>
          {jumlahSiswa}/{kapasitas} siswa
        </p>
        <p>{jadwal}</p>
      </div>
    </Link>
  );
}
