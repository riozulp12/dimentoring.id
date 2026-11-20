import HargaMulaiDari from "@/components/program/HargaMulaiDari";
import { formatRupiah } from "@/lib/shared/kelasDiskon";
import { ringkasanHargaKartu } from "@/lib/shared/kartuHargaMulai";

/**
 * Harga di header halaman Checkout. Kelas private online + saklar SESI_PILIHAN_AKTIF hidup: komponen HargaMulaiDari yang
 * SAMA dengan kartu & detail kelas (angka dari ringkasanHargaKartu -> hargaMulaiDari). Selain itu tampilan lama
 * (harga aktif, harga asli dicoret bila diskon). Rincian/total di bawah checkout tidak termasuk komponen ini.
 * `aktif` = saklar, dibaca di server oleh halaman.
 */
export default function CheckoutHeaderHarga({
  aktif,
  tipeKelas,
  modePembelajaran,
  jumlahSesi,
  harga,
  hargaAktif,
}: {
  aktif: boolean;
  tipeKelas: string | null;
  modePembelajaran: string;
  jumlahSesi: number | null;
  /** kelas.harga (harga tercantum). */
  harga: number;
  /** Harga setelah diskon kelas. */
  hargaAktif: number;
}) {
  const mulai = ringkasanHargaKartu({ aktif, tipeKelas, modeKelas: modePembelajaran, harga, hargaSetelahDiskon: hargaAktif, jumlahSesi });
  if (mulai) return <HargaMulaiDari ringkasan={mulai} harga={harga} diskonAktif={hargaAktif < harga} varian="kartu" />;

  return hargaAktif < harga ? (
    <p className="flex flex-wrap items-baseline gap-x-2 text-base sm:text-lg">
      <span className="font-semibold text-black">{formatRupiah(hargaAktif)}</span>
      <span className="text-sm text-[#7E7C7C] line-through decoration-[#DC2626] sm:text-base">{formatRupiah(harga)}</span>
    </p>
  ) : (
    <p className="text-base text-[#7E7C7C] sm:text-lg">{formatRupiah(hargaAktif)}</p>
  );
}
