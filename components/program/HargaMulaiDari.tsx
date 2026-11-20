import { formatRupiah } from "@/lib/shared/kelasDiskon";
import { TEKS_AJAKAN_SESI, type ringkasanHargaKartu } from "@/lib/shared/kartuHargaMulai";

/**
 * Tampilan harga "Mulai dari" kelas private online (saklar SESI_PILIHAN_AKTIF hidup) — SATU komponen untuk kartu kelas
 * (KelasCardMeta) dan halaman detail kelas. Angka dari `ringkasanHargaKartu` (lib/shared/kartuHargaMulai.ts →
 * hargaMulaiDari di lib/shared/hargaSesi.ts), tidak ada rumus di sini. Komponen server, tanpa state.
 *
 * Susunan: "Mulai dari" kecil regular abu-abu; harga bold warna primary (lebih besar dari judul); kalimat ajakan kecil;
 * bila kelas diskon: satu baris "Paket N sesi: <harga coret> <harga setelah diskon>" untuk paket penuh.
 */
export default function HargaMulaiDari({
  ringkasan,
  harga,
  diskonAktif,
  varian,
  compact = false,
}: {
  ringkasan: NonNullable<ReturnType<typeof ringkasanHargaKartu>>;
  /** kelas.harga (harga tercantum, dicoret bila diskon). */
  harga: number;
  diskonAktif: boolean;
  varian: "kartu" | "detail";
  compact?: boolean;
}) {
  const detail = varian === "detail";
  const kecil = compact ? "text-[11px] sm:text-xs" : "text-xs";
  return (
    <div className={`flex min-w-0 flex-col ${detail ? "shrink-0 sm:items-end" : ""}`}>
      <span className={`font-normal text-[#7E7C7C] ${detail ? "text-sm" : kecil}`}>Mulai dari</span>
      <span
        className={[
          "font-bold whitespace-nowrap text-[#081EEA]",
          detail ? "text-2xl sm:text-3xl" : compact ? "text-lg sm:text-xl" : "text-xl",
        ].join(" ")}
      >
        {ringkasan.mulaiDari}
      </span>
      <span className={`text-[#7E7C7C] ${detail ? "text-sm" : kecil}`}>{TEKS_AJAKAN_SESI}</span>
      {diskonAktif ? (
        <span className={`mt-1 text-[#7E7C7C] ${detail ? "text-sm" : kecil}`}>
          Paket {ringkasan.jumlahSesi} sesi: <s className="decoration-[#DC2626]">{formatRupiah(harga)}</s>{" "}
          <span className="font-semibold text-[#DC2626]">{ringkasan.hargaPaket}</span>
        </span>
      ) : null}
    </div>
  );
}
