import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { SESSION_COOKIE_NAME, requireAdminAktif } from "@/lib/admin/enrollmentManual";
import { bersihkanMediaYatim } from "@/lib/admin/mediaSoal";
import { terjemahkanRpcAdmin } from "@/lib/shared/studio-soal/bankSoal";
import { inputValidasiSoal, isUuid, parseBodySimpanSoal, rapikanKontenKunci } from "@/lib/shared/studio-soal/formSoal";
import { cekSoalLengkap } from "@/lib/shared/studio-soal/kelengkapan";
import { validasiSoal } from "@/lib/shared/studio-soal/validasi";

/**
 * Handler API Bank Soal (Admin). Dipakai app/api/admin/studio-soal/bank/**.
 * Urutan: Admin aktif (database) -> bentuk masukan -> RPC studio_soal_admin_*
 * (satu-satunya jalur tulis; aktor selalu dari session).
 */

export const gagal = (status: number, error: string, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ success: false, error, ...extra }, { status });

export const adminDari = (request: NextRequest) => requireAdminAktif(request.cookies.get(SESSION_COOKIE_NAME)?.value);

const GANGGUAN = "Ada gangguan di server. Coba lagi sebentar lagi.";

/** Hasil RPC studio_soal_admin_*; null = panggilannya sendiri gagal (hasil di database tidak diketahui). */
async function rpcAdmin(nama: string, args: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabaseServer.rpc(nama, args);
  if (error) {
    console.error(`[admin/bank-soal] ${nama} gagal:`, error);
    return null;
  }
  const hasil = (data ?? {}) as Record<string, unknown>;
  if (hasil.status === "data_tidak_valid") console.error(`[admin/bank-soal] ${nama} data_tidak_valid:`, hasil.detail);
  return hasil;
}

/** `bersihkan`: aksi hapus/arsip, sesudah berhasil gambar yang tak terpakai ikut dibuang. */
export async function panggilRpcAdmin(nama: string, args: Record<string, unknown>, bersihkan = false) {
  const hasil = await rpcAdmin(nama, args);
  if (!hasil) return gagal(500, GANGGUAN);
  const t = terjemahkanRpcAdmin(hasil);
  const extra = {
    ...(hasil.soal_id ? { soalId: hasil.soal_id } : {}),
    ...(hasil.updated_at ? { updatedAt: hasil.updated_at } : {}),
  };
  if (!t.success) return gagal(t.httpStatus, t.pesan, extra);
  if (!bersihkan) return NextResponse.json({ success: true, pesan: t.pesan, ...extra });
  const { gagal: sisa } = await bersihkanMediaYatim(String(args.p_admin_id));
  const catatan = sisa > 0 ? ` ${sisa} berkas gambar belum terhapus (dicoba lagi pada penghapusan berikutnya).` : "";
  return NextResponse.json({ success: true, pesan: `${t.pesan}${catatan}`, gambarGagalDihapus: sisa, ...extra });
}

/** DELETE: hapus semua soal DRAF satu batch impor (dan bacaan draf yang jadi kosong). */
export async function hapusBatchDraf(request: NextRequest, batchId: string) {
  const auth = await adminDari(request);
  if (!auth.ok) return gagal(auth.status, auth.error);
  if (!isUuid(batchId)) return gagal(400, "Batch tidak valid. Muat ulang halaman.");
  return panggilRpcAdmin("studio_soal_admin_hapus_batch_draf", { p_admin_id: auth.adminId, p_batch_id: batchId }, true);
}

/** Admin aktif + soal ada + sumber Buatan Sendiri (RPC memeriksa ulang). */
async function siapkanSoal(request: NextRequest, id: string) {
  const auth = await adminDari(request);
  if (!auth.ok) return gagal(auth.status, auth.error);
  if (!isUuid(id)) return gagal(400, "Alamat soal tidak valid. Buka lagi dari Bank Soal.");
  const { data, error } = await supabaseServer.from("soal_bank").select("id, sumber").eq("id", id).maybeSingle();
  if (error) {
    console.error("[admin/bank-soal] baca soal gagal:", error);
    return gagal(500, "Ada gangguan di server. Coba lagi sebentar lagi.");
  }
  if (!data) return gagal(404, "Soal tidak ditemukan. Mungkin sudah dihapus.");
  if ((data as { sumber: string }).sumber !== "buatan_sendiri") return gagal(403, "Soal buatan mentor hanya bisa dilihat.");
  return { adminId: auth.adminId };
}

/** Body form -> { updatedAt, pData } yang sudah divalidasi. Mode "ajukan" = syarat terbit lengkap. */
async function bacaIsi(request: NextRequest, mode: "draf" | "ajukan") {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return gagal(400, "Body request harus JSON yang valid.");
  }
  const parsed = parseBodySimpanSoal(body);
  if (!parsed.ok) return gagal(400, parsed.error);
  const updatedAt = (body as { updated_at?: unknown }).updated_at;
  if (typeof updatedAt !== "string" || updatedAt.length > 40 || Number.isNaN(Date.parse(updatedAt))) {
    return gagal(400, "Versi soal tidak terbaca. Muat ulang halaman.");
  }
  const data = parsed.data;
  const subtes = await supabaseServer.from("subtes").select("kategori").eq("id", data.subtes_id).maybeSingle();
  if (subtes.error) {
    console.error("[admin/bank-soal] baca subtes gagal:", subtes.error);
    return gagal(500, "Ada gangguan di server. Coba lagi sebentar lagi.");
  }
  const kategori = (subtes.data as { kategori: string } | null)?.kategori ?? null;
  const errors = mode === "ajukan" ? cekSoalLengkap(data, kategori) : validasiSoal(inputValidasiSoal(data, kategori), "draf");
  if (errors.length > 0) return gagal(400, "Ada isian yang perlu dibetulkan (ditandai merah).", { errors });
  const rapi = rapikanKontenKunci(data.tipe, data.konten, data.kunci);
  return { updatedAt, pData: { ...data, ...rapi, sumber_rujukan: data.sumber_rujukan.trim() || null } };
}

/** Simpan draf, atau simpan + terbitkan draf versi baru. updated_at = yang dibaca layar. */
async function simpanIsi(request: NextRequest, id: string, mode: "draf" | "ajukan") {
  const siap = await siapkanSoal(request, id);
  if (siap instanceof NextResponse) return siap;
  const isi = await bacaIsi(request, mode);
  if (isi instanceof NextResponse) return isi;
  return panggilRpcAdmin(mode === "ajukan" ? "studio_soal_admin_terbitkan_versi" : "studio_soal_admin_simpan", {
    p_admin_id: siap.adminId,
    p_soal_id: id,
    p_updated_at: isi.updatedAt,
    p_data: isi.pData,
  });
}

/**
 * "Edit & terbitkan ulang" soal TERBIT dalam satu permintaan, tanpa RPC baru:
 *   1. versi_baru      -> draf salinan (siswa tidak melihat draf; versi lama tetap terbit)
 *   2. terbitkan_versi -> SATU transaksi: simpan isi, versi lama 'digantikan', versi
 *                         baru 'terpublikasi'; gagal = tidak ada yang berubah
 *   3. bila 2 gagal    -> draf dari langkah 1 dihapus lagi
 * Isi diperiksa sebelum langkah 1, jadi isian yang kurang tidak membuat draf.
 */
async function terbitUlang(request: NextRequest, id: string) {
  const siap = await siapkanSoal(request, id);
  if (siap instanceof NextResponse) return siap;
  const isi = await bacaIsi(request, "ajukan");
  if (isi instanceof NextResponse) return isi;
  const argumen = (soalId: string) => ({ p_admin_id: siap.adminId, p_soal_id: soalId });

  const buat = await rpcAdmin("studio_soal_admin_versi_baru", argumen(id));
  if (!buat) return gagal(500, `${GANGGUAN} Muat ulang halaman; bila muncul draf versi lain, lanjutkan atau hapus draf itu.`);
  if (buat.status !== "versi_dibuat" || typeof buat.soal_id !== "string") {
    const t = terjemahkanRpcAdmin(buat);
    // 'ada_versi_terbuka': draf yang sudah ada tidak disentuh, hanya diberitahukan.
    return gagal(t.success ? 500 : t.httpStatus, t.success ? GANGGUAN : t.pesan, buat.soal_id ? { soalId: buat.soal_id } : {});
  }
  const draf = buat.soal_id;
  const berhasil = () => NextResponse.json({ success: true, pesan: terjemahkanRpcAdmin({ status: "versi_terbit" }).pesan, soalId: draf });

  const baca = await supabaseServer.from("soal_bank").select("updated_at").eq("id", draf).maybeSingle();
  if (baca.error) console.error("[admin/bank-soal] baca draf versi baru gagal:", baca.error);
  const updatedAt = (baca.data as { updated_at: string } | null)?.updated_at;
  const terbit = updatedAt
    ? await rpcAdmin("studio_soal_admin_terbitkan_versi", { ...argumen(draf), p_updated_at: updatedAt, p_data: isi.pData })
    : null;
  if (terbit?.status === "versi_terbit") return berhasil();

  const buang = await rpcAdmin("studio_soal_admin_hapus_draf", argumen(draf));
  // Jawaban terbit hilang di jalan padahal tersimpan: "draf" itu sudah bukan draf.
  if (updatedAt && !terbit && buang?.status === "status_tidak_valid") return berhasil();

  const t = terbit ? terjemahkanRpcAdmin(terbit) : { httpStatus: 500, pesan: GANGGUAN };
  if (buang?.status === "dihapus") return gagal(t.httpStatus, `${t.pesan} Soal terbit tidak berubah.`);
  return gagal(
    t.httpStatus,
    `${t.pesan} Soal terbit tidak berubah, tetapi draf versi baru belum terhapus (tidak terlihat siswa). Buka draf itu untuk melanjutkan atau menghapusnya.`,
    { soalId: draf },
  );
}

export const simpanDrafAdmin = (request: NextRequest, id: string) => simpanIsi(request, id, "draf");

const RPC_TANPA_ISI = {
  "versi-baru": "studio_soal_admin_versi_baru",
  arsipkan: "studio_soal_admin_arsipkan",
  hapus: "studio_soal_admin_hapus_draf",
} as const;

async function jalankanTanpaIsi(request: NextRequest, id: string, aksi: keyof typeof RPC_TANPA_ISI) {
  const siap = await siapkanSoal(request, id);
  if (siap instanceof NextResponse) return siap;
  return panggilRpcAdmin(RPC_TANPA_ISI[aksi], { p_admin_id: siap.adminId, p_soal_id: id }, aksi !== "versi-baru");
}

export const hapusDrafAdmin = (request: NextRequest, id: string) => jalankanTanpaIsi(request, id, "hapus");

export async function aksiAdmin(request: NextRequest, id: string, aksi: string) {
  if (aksi === "terbitkan-versi") return simpanIsi(request, id, "ajukan");
  if (aksi === "terbit-ulang") return terbitUlang(request, id);
  if (aksi === "versi-baru" || aksi === "arsipkan") return jalankanTanpaIsi(request, id, aksi);
  // Aksi tidak dikenal tetap melewati pemeriksaan Admin dulu.
  const auth = await adminDari(request);
  return auth.ok ? gagal(404, "Aksi tidak dikenal.") : gagal(auth.status, auth.error);
}
