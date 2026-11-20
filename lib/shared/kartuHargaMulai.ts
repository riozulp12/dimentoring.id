/**
 * Ringkasan harga kartu kelas "Mulai dari Rp X" (kelas private online, saklar SESI_PILIHAN_AKTIF hidup).
 * Fungsi MURNI; angka dari hargaMulaiDari/hitungHargaSesi (lib/shared/hargaSesi.ts), tanpa rumus salinan.
 * null = kartu memakai tampilan lama (saklar mati, bukan private online, atau data tidak valid).
 */
import { formatRupiah } from "./kelasDiskon";
import { hargaMulaiDari, hitungHargaSesi } from "./hargaSesi";
import { kelasPrivateOnline } from "./marginKelas";

export function ringkasanHargaKartu(input: {
  aktif: boolean;
  tipeKelas: string | null | undefined;
  modeKelas: string | null | undefined;
  /** kelas.harga (harga tercantum). */
  harga: number;
  /** Harga setelah diskon kelas (paket penuh). */
  hargaSetelahDiskon: number;
  jumlahSesi: number | null | undefined;
}): { mulaiDari: string; jumlahSesi: number; hargaPaket: string } | null {
  if (!input.aktif || !kelasPrivateOnline(input.tipeKelas, input.modeKelas)) return null;
  if (typeof input.jumlahSesi !== "number") return null;
  const dasar = { hargaNormal: input.harga, hargaAktif: input.hargaSetelahDiskon, jumlahSesiKelas: input.jumlahSesi };
  const mulai = hargaMulaiDari(dasar);
  if (!mulai.valid) return null;
  const paket = hitungHargaSesi({ ...dasar, jumlahSesiDipilih: input.jumlahSesi, jumlahSubtes: 1 });
  if (!paket.valid) return null;
  return { mulaiDari: formatRupiah(mulai.harga), jumlahSesi: input.jumlahSesi, hargaPaket: formatRupiah(paket.totalSebelumPromo) };
}

/** Kalimat ajakan di bawah harga "Mulai dari" (kartu & detail kelas) — maksimal 5 kata. */
export const TEKS_AJAKAN_SESI = "Makin banyak sesi, makin hemat";
