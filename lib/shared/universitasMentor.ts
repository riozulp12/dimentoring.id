/**
 * Helper murni (client-safe) untuk pilihan universitas di pendaftaran mentor.
 *
 * Daftar universitas BUKAN konstanta sendiri: ia diturunkan dari sumber yang
 * sama dengan Assessment (tabel ptn_jurusan lewat getPtnJurusanOptions), jadi
 * setiap PTN yang ada di Assessment otomatis tersedia di form mentor.
 *
 * Pilihan "Lainnya": nama universitas yang diketik mentor disimpan APA ADANYA
 * di kolom mentor_profiles.asal_ptn (VARCHAR bebas, tanpa enum/FK). Baris
 * lama yang tersimpan literal "Lainnya" tanpa nama tetap valid — admin
 * menampilkannya sebagai "Lainnya (nama belum diisi)".
 */

export const UNIVERSITAS_LAINNYA = "Lainnya";
/** Label opsi cadangan di dropdown saat pencarian tidak cocok dengan universitas mana pun. */
export const UNIVERSITAS_LAINNYA_TULIS_SENDIRI = "Lainnya (tulis sendiri)";
export const NAMA_UNIVERSITAS_LAINNYA_MIN = 3;

export function isUniversitasLainnya(value: string | null | undefined): boolean {
  return (value ?? "").trim().toLowerCase() === UNIVERSITAS_LAINNYA.toLowerCase();
}

/** Unik, alfabet, "Lainnya" selalu paling bawah (walau ada di sumber data). */
export function buildOpsiUniversitas(names: readonly string[]): string[] {
  const unik = new Set<string>();
  for (const raw of names) {
    const nama = raw?.trim();
    if (nama && !isUniversitasLainnya(nama)) unik.add(nama);
  }
  return [...Array.from(unik).sort((a, b) => a.localeCompare(b, "id")), UNIVERSITAS_LAINNYA];
}

export function isNamaUniversitasLainnyaValid(nama: string | null | undefined): boolean {
  const trimmed = (nama ?? "").trim();
  return trimmed.length >= NAMA_UNIVERSITAS_LAINNYA_MIN && !isUniversitasLainnya(trimmed);
}

/**
 * Nilai yang disimpan ke asal_ptn. Kembalikan null kalau "Lainnya" tapi nama
 * tidak valid (kosong / < 3 karakter / diketik "Lainnya" lagi).
 */
export function resolveAsalPtn(ptn: string, namaLainnya: string | null | undefined): string | null {
  const pilihan = ptn.trim();
  if (!pilihan) return null;
  if (!isUniversitasLainnya(pilihan)) return pilihan;
  return isNamaUniversitasLainnyaValid(namaLainnya) ? namaLainnya!.trim() : null;
}

/** Teks asal PTN untuk tampilan admin; data lama "Lainnya" tanpa nama aman. */
export function formatAsalPtnAdmin(asalPtn: string | null | undefined): string {
  if (!asalPtn || !asalPtn.trim()) return "-";
  return isUniversitasLainnya(asalPtn) ? "Lainnya (nama belum diisi)" : asalPtn;
}
