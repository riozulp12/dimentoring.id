import type { KelasCardPreview } from "@/lib/dashboard/getProgramData";
import type { SessionRole } from "@/lib/auth/session";
import KelasDaftarButton from "./KelasDaftarButton";
import ModePembelajaranBadge from "@/components/ui/ModePembelajaranBadge";
import { formatRupiah } from "@/lib/shared/kelasDiskon";

/**
 * Konten card Kelas publik di BAWAH KelasCardVisual (PRD 7.5 poin 10) — badge
 * tipe_kelas, nama, harga, deskripsi (maks 2 baris), tombol Daftar Sekarang.
 * Dipakai app/program/page.tsx & app/program/[kategori]/page.tsx supaya kedua
 * halaman tidak duplikasi markup card content sendiri-sendiri (pola yang sama
 * yang mencegah bug section TKA melebar di poin 12).
 *
 * Info Mentor SENGAJA TIDAK ditampilkan di card (declutter) — nama/foto mentor
 * lengkap tetap tampil di halaman DETAIL kelas
 * (app/program/kelas/[kelasId]/page.tsx, section "Mentor Kelas Ini"). Jangan
 * dikembalikan ke card tanpa keputusan produk baru.
 *
 * `compact` = card ini dirender 2 kolom di breakpoint mobile (grid /program).
 * Reduksi ukuran HANYA berlaku di breakpoint dasar (<640px); mulai `sm:`
 * semuanya kembali ke ukuran normal, jadi tampilan tablet/desktop tidak
 * berubah sama sekali.
 */

export interface KelasCardMetaProps {
  item: KelasCardPreview;
  sessionRole: SessionRole | null;
  compact?: boolean;
}

export default function KelasCardMeta({ item, sessionRole, compact = false }: KelasCardMetaProps) {
  const hasDiskon = item.diskonPersen > 0;

  return (
    <>
      <div className="flex flex-wrap items-center gap-1 sm:gap-1.5">
        <span
          className={[
            "inline-flex w-fit items-center rounded-full bg-[#F9FAFF] px-2 py-0.5 font-medium text-[#081EEA] sm:px-2.5",
            compact ? "text-[10px] sm:text-xs" : "text-xs",
          ].join(" ")}
        >
          {item.tipeKelasLabel}
        </span>
        <ModePembelajaranBadge modePembelajaran={item.modePembelajaran} compact={compact} />
      </div>

      <p
        className={[
          "line-clamp-2 leading-[1.4] font-semibold tracking-[-0.36px] text-black",
          compact ? "text-sm sm:text-base sm:leading-[1.5]" : "text-base leading-[1.5]",
        ].join(" ")}
      >
        {item.nama}
      </p>

      {/* Harga — kalau kelas sedang diskon, harga setelah diskon jadi fokus
          utama (bold, lebih besar) dan harga asli dicoret di atasnya dengan
          font lebih kecil. Tanpa diskon: tampilan lama, tidak berubah. */}
      {hasDiskon ? (
        <div className="flex min-w-0 flex-col">
          <span className={compact ? "text-[11px] text-[#7E7C7C] line-through sm:text-xs" : "text-xs text-[#7E7C7C] line-through"}>
            {formatRupiah(item.harga)}
          </span>
          <span
            className={[
              "font-bold tracking-[-0.36px] text-[#DC2626]",
              compact ? "text-base sm:text-lg" : "text-lg",
            ].join(" ")}
          >
            {formatRupiah(item.hargaSetelahDiskon)}
          </span>
        </div>
      ) : (
        <span className={compact ? "text-xs font-medium text-black sm:text-sm" : "text-sm font-medium text-black"}>
          {formatRupiah(item.harga)}
        </span>
      )}

      {item.deskripsi ? (
        <p
          className={[
            "line-clamp-2 text-[#7E7C7C]",
            compact ? "text-[11px] sm:text-sm" : "text-sm",
          ].join(" ")}
        >
          {item.deskripsi}
        </p>
      ) : null}

      {/* relative + z-40 = ditumpuk DI ATAS stretched link kartu (z-30, lihat
          KelasCardFrame.tsx) — area tombol tidak ikut navigasi ke detail. */}
      <div className="relative z-40 mt-1">
        <KelasDaftarButton
          kelasId={item.id}
          sisaSlot={item.sisaSlot}
          sessionRole={sessionRole}
          linkLynkid={item.linkLynkid}
          compact={compact}
        />
      </div>
    </>
  );
}
