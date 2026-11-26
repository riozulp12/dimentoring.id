import "server-only";
import { randomUUID } from "node:crypto";
import { supabaseServer } from "@/lib/supabase/server";
import type { GambarSiap } from "@/lib/admin/docxIsi";

/**
 * Berkas gambar soal di Supabase Storage (bucket privat, tanpa policy: hanya
 * service_role). Metadatanya di tabel soal_media (db/add_soal_media.sql).
 */

export const BUCKET_MEDIA = "soal-media";
export const BUCKET_STAGING = "impor-staging";

/** Baris soal_media yang dikirim ke RPC studio_soal_impor_admin. */
export interface BarisMedia {
  id: string;
  path: string;
  mime: string;
  ukuran_byte: number;
  lebar: number;
  tinggi: number;
  teks_alternatif: string;
}

/** Hapus berkas (best-effort). Mengembalikan jumlah yang gagal; kegagalan hanya dicatat. */
export async function hapusBerkas(bucket: string, paths: string[]): Promise<number> {
  if (paths.length === 0) return 0;
  const { error } = await supabaseServer.storage.from(bucket).remove(paths);
  if (!error) return 0;
  console.error(`[media-soal] gagal menghapus ${paths.length} berkas di ${bucket}:`, error, paths);
  return paths.length;
}

/** Unggah semua gambar ke folder baru. Gagal satu = yang sudah terunggah dihapus lagi, hasil null. */
export async function unggahGambar(media: GambarSiap[]): Promise<BarisMedia[] | null> {
  const folder = randomUUID();
  const baris: BarisMedia[] = [];
  for (const g of media) {
    const path = `${folder}/${g.media_id}.${g.ext}`;
    const { error } = await supabaseServer.storage.from(BUCKET_MEDIA).upload(path, g.data, { contentType: g.mime, upsert: false });
    if (error) {
      console.error("[media-soal] gagal mengunggah gambar:", error);
      await hapusBerkas(BUCKET_MEDIA, baris.map((b) => b.path));
      return null;
    }
    baris.push({
      id: g.media_id,
      path,
      mime: g.mime,
      ukuran_byte: g.data.length,
      lebar: g.lebar,
      tinggi: g.tinggi,
      teks_alternatif: g.alt,
    });
  }
  return baris;
}
