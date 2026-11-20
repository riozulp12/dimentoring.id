/**
 * Teks pratinjau harga kartu siswa untuk form Kelola Kelas (kelas private ONLINE saja).
 *
 * Fungsi MURNI: tanpa database/jaringan/efek samping, tanpa "server-only" (dipakai client component).
 * Seluruh angka dihitung lewat `hargaMulaiDari` dan `hitungHargaSesi` (lib/shared/hargaSesi.ts) — TIDAK ada
 * rumus salinan di sini. Harga tercantum = nilai field harga apa adanya; diskon kelas dari field diskon.
 *
 * Mengembalikan null (jangan tampilkan apa pun) bila bukan private online, atau harga / jumlah sesi /
 * diskon belum valid, atau fungsi harga mengembalikan galat.
 */
import { formatRupiah, hitungHargaSetelahDiskon } from "./kelasDiskon";
import { hitungHargaSesi, hargaMulaiDari, SUBTES_MIN } from "./hargaSesi";
import { kelasPrivateOnline } from "./marginKelas";

export function teksPratinjauHargaKartu(input: {
  tipeKelas: string | null | undefined;
  modeKelas: string | null | undefined;
  /** Isi field harga (string mentah dari form). */
  harga: string;
  /** Isi field diskon (string mentah; kosong = tanpa diskon). */
  diskonPersen: string;
  /** Isi field jumlah sesi (string mentah). */
  jumlahSesi: string;
}): string | null {
  if (!kelasPrivateOnline(input.tipeKelas, input.modeKelas)) return null;

  const hargaNormal = Number(input.harga);
  const jumlahSesiKelas = Number(input.jumlahSesi);
  const diskon = input.diskonPersen.trim() === "" ? 0 : Number(input.diskonPersen);
  if (input.harga.trim() === "" || input.jumlahSesi.trim() === "") return null;
  if (!Number.isInteger(hargaNormal) || hargaNormal <= 0) return null;
  if (!Number.isInteger(jumlahSesiKelas) || jumlahSesiKelas <= 0) return null;
  if (!Number.isFinite(diskon) || diskon < 0 || diskon > 100) return null;

  const hargaAktif = hitungHargaSetelahDiskon(hargaNormal, diskon);
  const dasar = { hargaNormal, hargaAktif, jumlahSesiKelas };

  const mulai = hargaMulaiDari(dasar);
  if (!mulai.valid) return null;
  const paket = hitungHargaSesi({ ...dasar, jumlahSesiDipilih: jumlahSesiKelas, jumlahSubtes: SUBTES_MIN });
  if (!paket.valid) return null;

  return `Di kartu siswa: Mulai dari ${formatRupiah(mulai.harga)} (1 sesi) · Paket ${jumlahSesiKelas} sesi ${formatRupiah(paket.totalSebelumPromo)}`;
}
