/**
 * Gambar soal Studio Soal — modul MURNI (dipakai validator, pengurai Word,
 * server, dan layar).
 *
 * Bacaan: blok { jenis: "gambar", media_id, alt }.
 * Soal: penanda {{g1}}, {{g2}}, ... di redaksi / pembahasan, dan
 * konten.gambar = [{ kode: "g1", media_id, alt }]. Berkasnya di bucket privat
 * 'soal-media', metadatanya di tabel soal_media (db/add_soal_media.sql).
 */

export const BATAS_GAMBAR = { byte: 2 * 1024 * 1024, dimensi: 2400, perSoal: 5, perBerkas: 60, altMaks: 300 } as const;
export const ALT_BAWAAN = "Gambar soal";

export const POLA_KODE_GAMBAR = /^g[1-9]\d?$/;
const POLA_PENANDA_GAMBAR = /\{\{(g[1-9]\d?)\}\}/g;
const POLA_UUID_MEDIA = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isMediaId = (v: unknown): v is string => typeof v === "string" && POLA_UUID_MEDIA.test(v);

export interface GambarEntri {
  kode: string;
  media_id: string;
  alt: string;
}

/** Kode penanda gambar di teks, berurutan (boleh berulang). */
export const penandaGambar = (teks: string): string[] => [...teks.matchAll(POLA_PENANDA_GAMBAR)].map((m) => m[1]);

const objek = (v: unknown): Record<string, unknown> | null =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
const daftar = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** Entri konten.gambar yang bentuknya benar. */
export function daftarGambar(konten: unknown): GambarEntri[] {
  return daftar(objek(konten)?.gambar).flatMap((g) => {
    const x = objek(g);
    return x && typeof x.kode === "string" && typeof x.media_id === "string"
      ? [{ kode: x.kode, media_id: x.media_id, alt: typeof x.alt === "string" ? x.alt : "" }]
      : [];
  });
}

/** media_id yang dirujuk konten soal (konten.gambar) atau bacaan (blok gambar). */
export function mediaDariKonten(konten: unknown): string[] {
  const blok = daftar(objek(konten)?.blok).flatMap((b) => {
    const x = objek(b);
    return x?.jenis === "gambar" && typeof x.media_id === "string" ? [x.media_id] : [];
  });
  return [...daftarGambar(konten).map((g) => g.media_id), ...blok];
}

/** Gambar yang alamatnya sudah diselesaikan server. url null = tidak bisa dimuat. */
export interface MediaTampil {
  url: string | null;
  lebar: number;
  tinggi: number;
}
export interface GambarTampil extends MediaTampil {
  alt: string;
}

/** Peta kode -> gambar untuk TeksKaya; undefined bila soal tidak punya gambar (tampilan lama). */
export function petaGambarSoal(konten: unknown, media: Record<string, MediaTampil> = {}): Record<string, GambarTampil> | undefined {
  const entri = daftarGambar(konten);
  if (entri.length === 0) return undefined;
  return Object.fromEntries(
    entri.map((g) => [g.kode, { ...(media[g.media_id] ?? { url: null, lebar: 0, tinggi: 0 }), alt: g.alt }]),
  );
}

/** Galat validator tentang penanda gambar yang hilang, ganda, atau tanpa gambar. */
export const masalahPenandaGambar = (errors: { pesan: string }[]): string[] => [
  ...new Set(errors.map((e) => e.pesan).filter((p) => /\{\{g\d+\}\}|^Gambar g\d+ hilang/.test(p))),
];

// ---------------------------------------------------------------------------
// Header berkas gambar (magic bytes + dimensi, tanpa mendekode piksel)
// ---------------------------------------------------------------------------

export type InfoGambar =
  | { ok: true; mime: "image/png" | "image/jpeg" | "image/webp"; ext: "png" | "jpg" | "webp"; lebar: number; tinggi: number }
  | { ok: false; alasan: "format"; format: string }
  | { ok: false; alasan: "rusak" };

export function bacaInfoGambar(b: Uint8Array): InfoGambar {
  const ascii = (dari: number, n: number) => String.fromCharCode(...b.subarray(dari, dari + n));
  const awal = (...x: number[]) => x.every((v, i) => b[i] === v);
  const be16 = (i: number) => (b[i] << 8) | b[i + 1];
  const le = (i: number, n: number) => Array.from({ length: n }, (_, k) => b[i + k] * 256 ** k).reduce((a, c) => a + c, 0);
  const be32 = (i: number) => be16(i) * 65536 + be16(i + 2);
  const rusak: InfoGambar = { ok: false, alasan: "rusak" };
  const hasil = (mime: "image/png" | "image/jpeg" | "image/webp", ext: "png" | "jpg" | "webp", lebar: number, tinggi: number): InfoGambar =>
    lebar > 0 && tinggi > 0 ? { ok: true, mime, ext, lebar, tinggi } : rusak;

  if (awal(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) {
    if (b.length < 24 || ascii(12, 4) !== "IHDR") return rusak;
    return hasil("image/png", "png", be32(16), be32(20));
  }
  if (awal(0xff, 0xd8, 0xff)) {
    // Loncati segmen sampai penanda SOF (berisi tinggi & lebar).
    for (let p = 2; p + 9 <= b.length; ) {
      if (b[p] !== 0xff) return rusak;
      const penanda = b[p + 1];
      if (penanda === 0xff) p += 1;
      else if (penanda === 0x01 || (penanda >= 0xd0 && penanda <= 0xd8)) p += 2;
      else if (penanda >= 0xc0 && penanda <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(penanda)) {
        return hasil("image/jpeg", "jpg", be16(p + 7), be16(p + 5));
      } else if (penanda === 0xd9 || penanda === 0xda) return rusak;
      else p += 2 + be16(p + 2);
    }
    return rusak;
  }
  if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") {
    const ragam = ascii(12, 4);
    if (ragam === "VP8 " && b.length >= 30 && b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a) {
      return hasil("image/webp", "webp", le(26, 2) & 0x3fff, le(28, 2) & 0x3fff);
    }
    if (ragam === "VP8L" && b.length >= 25 && b[20] === 0x2f) {
      const bit = le(21, 4);
      return hasil("image/webp", "webp", (bit % 16384) + 1, (Math.floor(bit / 16384) % 16384) + 1);
    }
    if (ragam === "VP8X" && b.length >= 30) return hasil("image/webp", "webp", le(24, 3) + 1, le(27, 3) + 1);
    return rusak;
  }

  const format = ascii(0, 4) === "GIF8"
    ? "GIF"
    : ascii(0, 2) === "BM"
      ? "BMP"
      : awal(0x49, 0x49, 0x2a, 0x00) || awal(0x4d, 0x4d, 0x00, 0x2a)
        ? "TIFF"
        : awal(0x01, 0x00, 0x00, 0x00) && ascii(40, 4) === " EMF"
          ? "EMF"
          : awal(0xd7, 0xcd, 0xc6, 0x9a) || awal(0x01, 0x00, 0x09, 0x00)
            ? "WMF"
            : /<svg[\s/>]/i.test(ascii(0, 1000))
              ? "SVG"
              : null;
  if (format) return { ok: false, alasan: "format", format };
  // Awal PNG/JPEG yang terpotong = rusak; selebihnya format tak dikenal.
  return b.length >= 2 && (awal(0x89, 0x50) || awal(0xff, 0xd8)) ? rusak : { ok: false, alasan: "format", format: "tidak dikenal" };
}
