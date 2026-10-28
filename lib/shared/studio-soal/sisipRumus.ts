/**
 * Editor rumus visual (Studio Soal UX-3 D) — modul MURNI untuk menyisipkan
 * atau mengubah rumus di teks. Hasil editor tetap disimpan dalam format teks
 * yang sama seperti sebelumnya: \( … \) sebaris atau \[ … \] baris sendiri,
 * jadi tidak ada migrasi dan validasi/penilaian lama tidak berubah.
 *
 * Pemindaian memakai aturan pengurai yang sama (teksKaya.ts): "\\", "\*",
 * "\{", "\}" adalah karakter biasa; rumus tanpa penutup bukan rumus.
 */
import { cekRumus } from "./rumus";
import { ambilRumus, cariPenutup } from "./teksKaya";

export interface RentangRumus {
  /** Posisi "\" pembuka. */
  awal: number;
  /** Posisi sesudah penutup "\)" / "\]". */
  akhir: number;
  tex: string;
  blok: boolean;
}

/** Semua rumus di teks beserta posisinya. */
export function daftarRumus(teks: string): RentangRumus[] {
  const hasil: RentangRumus[] = [];
  for (let i = 0; i < teks.length; ) {
    if (teks[i] !== "\\") {
      i++;
      continue;
    }
    const n = teks[i + 1];
    if (n === "(" || n === "[") {
      const tutup = cariPenutup(teks, i + 2, n === "(" ? ")" : "]");
      if (tutup !== -1) {
        hasil.push({ awal: i, akhir: tutup + 2, tex: teks.slice(i + 2, tutup), blok: n === "[" });
        i = tutup + 2;
        continue;
      }
      i++;
      continue;
    }
    i += n === "\\" || n === "*" || n === "{" || n === "}" ? 2 : 1;
  }
  return hasil;
}

/** Rumus yang memuat posisi kursor (di antara pembatasnya), atau null. */
export function rumusDiPosisi(teks: string, posisi: number): RentangRumus | null {
  return daftarRumus(teks).find((r) => posisi > r.awal && posisi < r.akhir) ?? null;
}

export const bungkusRumus = (tex: string, blok: boolean) => (blok ? `\\[${tex}\\]` : `\\(${tex}\\)`);

/**
 * null = rumus boleh disisipkan; selain itu pesan dalam bahasa biasa.
 * Memakai cekRumus yang sama dengan validasi Ajukan.
 */
export function cekRumusEditor(tex: string, blok = false): string | null {
  const bersih = tex.trim();
  if (!bersih) return "Rumus masih kosong.";
  if (/\\placeholder\b/.test(bersih)) return "Masih ada kotak kosong di rumus. Isi dulu atau hapus kotaknya.";
  const galat = cekRumus(bersih, blok);
  if (galat) return `Rumus belum bisa ditampilkan: ${galat}`;
  // Pembatas harus terbaca ulang sebagai satu rumus utuh yang sama.
  const urai = ambilRumus(bungkusRumus(bersih, blok));
  if (urai.length !== 1 || urai[0].tex !== bersih) return "Rumus ini memuat tanda yang bentrok dengan pembatas rumus.";
  return null;
}

/**
 * Sisipkan rumus di kursor/pilihan [awal, akhir), atau ganti rumus lama bila
 * `ganti` diisi. Kursor ditaruh sesudah rumus.
 */
export function sisipkanRumus(
  teks: string,
  pilihan: { awal: number; akhir: number },
  tex: string,
  blok: boolean,
  ganti?: Pick<RentangRumus, "awal" | "akhir"> | null,
): { teks: string; kursor: number } {
  const rumus = bungkusRumus(tex.trim(), blok);
  const awal = ganti ? ganti.awal : Math.max(0, Math.min(pilihan.awal, teks.length));
  const akhir = ganti ? ganti.akhir : Math.max(awal, Math.min(pilihan.akhir, teks.length));
  return { teks: teks.slice(0, awal) + rumus + teks.slice(akhir), kursor: awal + rumus.length };
}
