/**
 * Rumus KaTeX Studio Soal — dipakai builder di browser (pratinjau + cek
 * sebelum Ajukan) DAN API route Ajukan (server memvalidasi ulang). Modul ini
 * mengimpor `katex` (tidak ada akses server/DB), jadi tetap aman di klien.
 *
 * Opsi keamanan (desain Bagian 4): trust:false (\href, \url, \includegraphics,
 * \htmlClass dsb. ditolak), maxExpand & maxSize dibatasi supaya makro tidak
 * meledak. Error rumus = error "kelengkapan": draf boleh menyimpannya, tapi
 * wajib bersih saat diajukan.
 */
import katex from "katex";
import type { ErrorValidasi } from "./validasi";
import { ambilRumus } from "./teksKaya";

export const OPSI_KATEX = {
  trust: false,
  strict: "ignore",
  maxExpand: 1000,
  maxSize: 10,
  output: "htmlAndMathml",
} as const;

/**
 * null = rumus valid; selain itu pesan error yang bisa dibaca mentor.
 * Dengan trust:false KaTeX TIDAK melempar error untuk \href, \url,
 * \includegraphics, \htmlClass dsb. — perintah itu hanya tampil sebagai teks
 * merah (aman, tanpa tautan). Supaya mentor tahu dan soal tidak terbit dengan
 * teks merah, setiap percobaan perintah itu dicatat lewat fungsi `trust`
 * (selalu menolak) dan dianggap error.
 */
export function cekRumus(tex: string, blok = false): string | null {
  if (tex.trim().length === 0) return "Rumus kosong.";
  const ditolak: string[] = [];
  try {
    katex.renderToString(tex, {
      ...OPSI_KATEX,
      displayMode: blok,
      throwOnError: true,
      trust: (konteks: { command: string }) => {
        ditolak.push(konteks.command);
        return false;
      },
    });
    if (ditolak.length > 0) return `Perintah ${[...new Set(ditolak)].join(", ")} tidak diizinkan di soal.`;
    return null;
  } catch (err) {
    const pesan = err instanceof Error ? err.message.replace(/^KaTeX parse error:\s*/, "") : String(err);
    return pesan.length > 160 ? `${pesan.slice(0, 157)}…` : pesan;
  }
}

/** Error untuk satu teks: semua rumus di dalamnya harus lolos KaTeX. */
export function cekRumusTeks(field: string, teks: unknown): ErrorValidasi[] {
  if (typeof teks !== "string" || !teks.includes("\\")) return [];
  const hasil: ErrorValidasi[] = [];
  for (const r of ambilRumus(teks)) {
    const galat = cekRumus(r.tex, r.blok);
    if (galat) {
      const cuplik = r.tex.length > 40 ? `${r.tex.slice(0, 37)}…` : r.tex;
      hasil.push({ field, pesan: `Rumus "${cuplik}" tidak bisa ditampilkan: ${galat}`, jenis: "kelengkapan" });
    }
  }
  return hasil;
}

const objek = (v: unknown): Record<string, unknown> | null =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
const daftar = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** Rumus di redaksi, pembahasan, opsi PG, dan pernyataan majemuk. */
export function validasiRumusSoal(input: unknown): ErrorValidasi[] {
  const soal = objek(input);
  if (!soal) return [];
  const konten = objek(soal.konten) ?? {};
  return [
    ...cekRumusTeks("redaksi", soal.redaksi),
    ...cekRumusTeks("pembahasan", soal.pembahasan),
    ...daftar(konten.opsi).flatMap((o, i) => cekRumusTeks(`konten.opsi.${i}.teks`, objek(o)?.teks)),
    ...daftar(konten.pernyataan).flatMap((p, i) => cekRumusTeks(`konten.pernyataan.${i}.teks`, objek(p)?.teks)),
  ];
}

/** Rumus di blok teks dan tabel (judul, kepala, sel) stimulus. */
export function validasiRumusStimulus(input: unknown): ErrorValidasi[] {
  const stimulus = objek(input);
  if (!stimulus) return [];
  return daftar(objek(stimulus.konten)?.blok).flatMap((b, i) => {
    const blok = objek(b);
    if (!blok) return [];
    const f = `konten.blok.${i}`;
    if (blok.jenis === "teks") return cekRumusTeks(`${f}.teks`, blok.teks);
    if (blok.jenis !== "tabel") return [];
    return [
      ...cekRumusTeks(`${f}.judul`, blok.judul),
      ...daftar(blok.kepala).flatMap((sel, k) => cekRumusTeks(`${f}.kepala.${k}`, sel)),
      ...daftar(blok.baris).flatMap((row, b2) =>
        daftar(row).flatMap((sel, k) => cekRumusTeks(`${f}.baris.${b2}.${k}`, sel)),
      ),
    ];
  });
}
