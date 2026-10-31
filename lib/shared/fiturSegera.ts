/**
 * Daftar pusat fitur siswa yang BELUM dibuka ("Segera hadir").
 *
 * Membuka satu fitur nanti = ubah `aktif: false` jadi `aktif: true` di sini
 * (satu baris). Tidak perlu menyentuh menu, kartu, atau halamannya.
 *
 * Untuk uji di Preview tanpa membuka Production: isi env opsional
 * NEXT_PUBLIC_FITUR_SEGERA_BUKA dengan daftar id dipisah koma, mis.
 * `tryout` atau `tryout,asah`. Env kosong = semua ikut daftar di bawah.
 *
 * Yang digembok hanya HALAMAN siswa. Jangan pakai fiturTerbuka() di route API,
 * webhook (Agensoal, Mayar), atau halaman mentor/admin.
 */

export type FiturSegeraId = "tryout";

export interface FiturSegera {
  id: FiturSegeraId;
  judul: string;
  /** Kosong = pakai PESAN_BAWAAN_SEGERA. */
  pesan?: string;
  /** true = fitur sudah dibuka untuk semua orang. */
  aktif: boolean;
}

export const PESAN_BAWAAN_SEGERA =
  "Halaman ini sedang kami siapkan. Kami akan kabari begitu sudah bisa dipakai.";

export const DAFTAR_FITUR_SEGERA: Record<FiturSegeraId, FiturSegera> = {
  tryout: { id: "tryout", judul: "Try Out", aktif: false },
};

/** Id yang dibuka lewat env (Preview). Argumen env bisa dioper untuk test. */
export function idDibukaLewatEnv(
  env: string | undefined = process.env.NEXT_PUBLIC_FITUR_SEGERA_BUKA,
): string[] {
  return (env ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** true = fitur boleh dipakai (aktif di daftar pusat, atau dibuka lewat env). */
export function fiturTerbuka(
  id: FiturSegeraId,
  env: string | undefined = process.env.NEXT_PUBLIC_FITUR_SEGERA_BUKA,
): boolean {
  return DAFTAR_FITUR_SEGERA[id].aktif || idDibukaLewatEnv(env).includes(id);
}

export function pesanFiturSegera(id: FiturSegeraId): string {
  return DAFTAR_FITUR_SEGERA[id].pesan ?? PESAN_BAWAAN_SEGERA;
}
