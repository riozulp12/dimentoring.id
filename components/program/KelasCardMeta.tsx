import type { KelasCardPreview } from "@/lib/dashboard/getProgramData";
import type { SessionRole } from "@/lib/auth/session";
import KelasDaftarButton from "./KelasDaftarButton";

/**
 * Konten card Kelas publik di BAWAH KelasCardVisual (PRD 7.5 poin 10) — badge
 * tipe_kelas, nama, harga, mentor, deskripsi (maks 2 baris), tombol Daftar
 * Sekarang. Dipakai app/program/page.tsx & app/program/[kategori]/page.tsx
 * supaya kedua halaman tidak duplikasi markup card content sendiri-sendiri
 * (pola yang sama yang mencegah bug section TKA melebar di poin 12).
 */

function formatRupiah(value: number): string {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}

export interface KelasCardMetaProps {
  item: KelasCardPreview;
  sessionRole: SessionRole | null;
}

export default function KelasCardMeta({ item, sessionRole }: KelasCardMetaProps) {
  return (
    <>
      <span className="inline-flex w-fit items-center rounded-full bg-[#F9FAFF] px-2.5 py-0.5 text-xs font-medium text-[#081EEA]">
        {item.tipeKelasLabel}
      </span>
      <p className="text-base leading-[1.5] font-semibold tracking-[-0.36px] text-black">{item.nama}</p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[#7E7C7C]">
        <span className="font-medium text-black">{formatRupiah(item.harga)}</span>
        {item.mentorNama ? <span>Mentor: {item.mentorNama}</span> : null}
      </div>
      {item.deskripsi ? <p className="line-clamp-2 text-sm text-[#7E7C7C]">{item.deskripsi}</p> : null}
      <div className="mt-1">
        <KelasDaftarButton kelasId={item.id} sisaSlot={item.sisaSlot} sessionRole={sessionRole} />
      </div>
    </>
  );
}
