import "server-only";
import { randomUUID } from "node:crypto";
import { supabaseServer } from "@/lib/supabase/server";
import type { GambarSiap } from "@/lib/admin/docxIsi";
import { isMediaId, type MediaTampil } from "@/lib/shared/studio-soal/gambar";

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

/** Alamat gambar berlaku singkat; halaman memintanya lagi saat dimuat ulang. */
export const BERLAKU_URL_GAMBAR_DETIK = 600;

/**
 * media_id -> alamat bertanda tangan + ukuran. HANYA dipanggil sesudah pemeriksaan
 * Admin: bucket privat, jadi alamat inilah satu-satunya jalan melihat gambarnya.
 * Gagal dibaca = tidak ada di hasil (layar menampilkan keterangan).
 */
export async function urlGambarSoal(ids: string[]): Promise<Record<string, MediaTampil>> {
  const unik = [...new Set(ids)].filter(isMediaId);
  if (unik.length === 0) return {};
  const { data, error } = await supabaseServer.from("soal_media").select("id, path, lebar, tinggi").in("id", unik);
  if (error) {
    console.error("[media-soal] gagal membaca soal_media:", error);
    return {};
  }
  const rows = (data ?? []) as { id: string; path: string; lebar: number; tinggi: number }[];
  if (rows.length === 0) return {};
  const tanda = await supabaseServer.storage.from(BUCKET_MEDIA).createSignedUrls(
    rows.map((r) => r.path),
    BERLAKU_URL_GAMBAR_DETIK,
  );
  if (tanda.error) console.error("[media-soal] gagal membuat alamat gambar:", tanda.error);
  const alamat = new Map((tanda.data ?? []).map((t) => [t.path, t.signedUrl || null]));
  return Object.fromEntries(rows.map((r) => [r.id, { url: alamat.get(r.path) ?? null, lebar: r.lebar, tinggi: r.tinggi }]));
}

/**
 * Sesudah hapus/arsip: buang gambar yang tidak dirujuk soal/bacaan mana pun.
 * Best-effort: berkas dulu, baru barisnya (RPC memeriksa ulang rujukan). Berkas
 * yang gagal dihapus tetap tercatat dan dicoba lagi pada pembersihan berikutnya.
 */
export async function bersihkanMediaYatim(adminId: string): Promise<{ gagal: number }> {
  // Belum ada gambar sama sekali (atau migrasi belum dijalankan): tidak ada yang dikerjakan.
  const ada = await supabaseServer.from("soal_media").select("id").limit(1);
  if (ada.error || (ada.data?.length ?? 0) === 0) return { gagal: 0 };
  const yatim = await supabaseServer.rpc("studio_soal_admin_media_yatim", { p_admin_id: adminId });
  const r = (yatim.data ?? {}) as { status?: unknown; media?: { id: string; path: string }[] };
  if (yatim.error || r.status !== "ok") {
    console.error("[media-soal] gagal mencari gambar tak terpakai:", yatim.error ?? r);
    return { gagal: 0 };
  }
  const daftar = r.media ?? [];
  if (daftar.length === 0) return { gagal: 0 };

  // Sekaligus dulu; bila gagal, satu per satu supaya yang bisa dihapus tetap terhapus.
  let terhapus = daftar;
  if ((await hapusBerkas(BUCKET_MEDIA, daftar.map((m) => m.path))) > 0) {
    terhapus = [];
    for (const m of daftar) if ((await hapusBerkas(BUCKET_MEDIA, [m.path])) === 0) terhapus.push(m);
  }
  if (terhapus.length > 0) {
    const hapus = await supabaseServer.rpc("studio_soal_admin_hapus_media", { p_admin_id: adminId, p_ids: terhapus.map((m) => m.id) });
    if (hapus.error) console.error("[media-soal] gagal menghapus baris soal_media:", hapus.error);
  }
  return { gagal: daftar.length - terhapus.length };
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
