/**
 * Utilitas teks Studio Soal — modul MURNI.
 *
 * panjangKarakter dipakai ulang dari aturan pendaftaran manual (code point,
 * sama dengan length() Postgres yang dipakai CHECK di db/add_studio_soal.sql).
 */
import { panjangKarakter } from "@/lib/shared/enrollmentManual";

export { panjangKarakter };

/** Panjang setelah trim — sama dengan length(btrim(x, ' \t\r\n')) di CHECK. */
export function panjangTrim(value: string): number {
  return panjangKarakter(value.trim());
}

const KUTIP_GANDA = /[“”„‟″«»]/g;
const KUTIP_TUNGGAL = /[‘’‚‛′]/g;

/**
 * Normalisasi jawaban isian bertipe teks (aturan final dokumen desain Bagian 5):
 * NFKC → kutip lengkung jadi lurus → semua whitespace berturut-turut jadi satu
 * spasi → trim → huruf kecil (id-ID). TIDAK menghapus tanda baca lain, aksen,
 * atau titik akhir — supaya tidak ada "benar" yang tidak disengaja; mentor
 * menambah jawaban alternatif bila perlu.
 */
export function normalisasiTeks(value: string): string {
  return value
    .normalize("NFKC")
    .replace(KUTIP_GANDA, '"')
    .replace(KUTIP_TUNGGAL, "'")
    .replace(/\s+/gu, " ")
    .trim()
    .toLocaleLowerCase("id-ID");
}

/**
 * Cek pembatas rumus LaTeX: `\( … \)` (inline) dan `\[ … \]` (blok) harus
 * berpasangan, tidak bersarang, dan tidak tertukar. Tanda `$` TIDAK dianggap
 * rumus (teks Literasi B. Inggris bisa memuat tanda dolar biasa).
 * Mengembalikan null bila valid, atau pesan error.
 *
 * Parse isi rumus dengan KaTeX menyusul saat KaTeX dipasang (PR 3).
 */
export function cekPembatasRumus(value: string): string | null {
  let terbuka: "(" | "[" | null = null;
  for (let i = 0; i < value.length - 1; i++) {
    if (value[i] !== "\\") continue;
    const berikut = value[i + 1];
    if (berikut === "\\") {
      i++; // "\\" = backslash literal (mis. baris baru LaTeX), lewati pasangannya
      continue;
    }
    if (berikut === "(" || berikut === "[") {
      if (terbuka) return "Rumus tidak boleh bersarang — tutup rumus sebelumnya dulu.";
      terbuka = berikut;
      i++;
    } else if (berikut === ")" || berikut === "]") {
      const pasangan = berikut === ")" ? "(" : "[";
      if (terbuka !== pasangan) return `Penutup rumus \\${berikut} tanpa pembuka yang cocok.`;
      terbuka = null;
      i++;
    }
  }
  if (terbuka) return `Rumus \\${terbuka} belum ditutup.`;
  return null;
}
