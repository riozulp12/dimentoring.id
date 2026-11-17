import Link from "next/link";
import { formatDeadline } from "@/lib/shared/formatDeadline";
import {
  KONTEN_INFO_STATUS_BADGE_CLASS,
  KONTEN_INFO_STATUS_LABEL,
  KONTEN_INFO_TIPE_BADGE_CLASS,
  KONTEN_INFO_TIPE_LABEL,
} from "@/lib/shared/kontenInfoLabels";
import type { KontenInfoListItem } from "@/lib/dashboard/getInfoBeasiswaEvent";

/**
 * Kartu konten info (beasiswa/internship/event/…) — dipindah dari BeasiswaEventListClient tanpa perubahan markup,
 * supaya daftar /beasiswa-event, preview di /program, dan "Program lainnya" di detail event memakai SATU kartu.
 * Tanpa state/hook, jadi aman dipakai dari Server maupun Client Component.
 */
export default function KontenInfoCard({ item }: { item: KontenInfoListItem }) {
  const isDitutup = item.status === "ditutup";
  return (
    <Link
      href={`/beasiswa-event/${item.id}`}
      className={`flex flex-col gap-3 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white p-[18px] shadow-[1px_2px_4px_0px_rgba(0,0,0,0.1)] transition-colors hover:border-[#081EEA] ${
        isDitutup ? "opacity-70" : ""
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
            KONTEN_INFO_TIPE_BADGE_CLASS[item.tipe] ?? "bg-gray-100 text-[#7E7C7C]"
          }`}
        >
          {KONTEN_INFO_TIPE_LABEL[item.tipe] ?? item.tipe}
        </span>
        <span
          className={`inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
            KONTEN_INFO_STATUS_BADGE_CLASS[item.status] ?? "bg-gray-100 text-[#7E7C7C]"
          }`}
        >
          {KONTEN_INFO_STATUS_LABEL[item.status] ?? item.status}
        </span>
      </div>
      <p className="line-clamp-2 text-lg leading-[1.5] font-semibold tracking-[-0.36px] text-black">{item.judul}</p>
      {item.deskripsi ? <p className="line-clamp-2 text-sm text-[#7E7C7C]">{item.deskripsi}</p> : null}
      <p className={`text-sm leading-[1.5] tracking-[-0.28px] ${isDitutup ? "text-[#7E7C7C]" : "text-[#E70A0A]"}`}>
        {formatDeadline(item.deadline)}
      </p>
    </Link>
  );
}
