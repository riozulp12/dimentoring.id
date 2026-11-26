import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { SESSION_COOKIE_NAME, requireAdminAktif } from "@/lib/admin/enrollmentManual";
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

export async function panggilRpcAdmin(nama: string, args: Record<string, unknown>) {
  const { data, error } = await supabaseServer.rpc(nama, args);
  if (error) {
    console.error(`[admin/bank-soal] ${nama} gagal:`, error);
    return gagal(500, "Ada gangguan di server. Coba lagi sebentar lagi.");
  }
  const hasil = (data ?? {}) as Record<string, unknown>;
  if (hasil.status === "data_tidak_valid") console.error(`[admin/bank-soal] ${nama} data_tidak_valid:`, hasil.detail);
  const t = terjemahkanRpcAdmin(hasil);
  const extra = {
    ...(hasil.soal_id ? { soalId: hasil.soal_id } : {}),
    ...(hasil.updated_at ? { updatedAt: hasil.updated_at } : {}),
  };
  if (!t.success) return gagal(t.httpStatus, t.pesan, extra);
  return NextResponse.json({ success: true, pesan: t.pesan, ...extra });
}

/** DELETE: hapus semua soal DRAF satu batch impor (dan bacaan draf yang jadi kosong). */
export async function hapusBatchDraf(request: NextRequest, batchId: string) {
  const auth = await adminDari(request);
  if (!auth.ok) return gagal(auth.status, auth.error);
  if (!isUuid(batchId)) return gagal(400, "Batch tidak valid. Muat ulang halaman.");
  return panggilRpcAdmin("studio_soal_admin_hapus_batch_draf", { p_admin_id: auth.adminId, p_batch_id: batchId });
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

/** Isi form + updated_at yang dibaca layar -> argumen RPC. Mode "ajukan" = syarat terbit lengkap. */
async function simpanIsi(request: NextRequest, id: string, mode: "draf" | "ajukan") {
  const siap = await siapkanSoal(request, id);
  if (siap instanceof NextResponse) return siap;
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
  return panggilRpcAdmin(mode === "ajukan" ? "studio_soal_admin_terbitkan_versi" : "studio_soal_admin_simpan", {
    p_admin_id: siap.adminId,
    p_soal_id: id,
    p_updated_at: updatedAt,
    p_data: { ...data, ...rapi, sumber_rujukan: data.sumber_rujukan.trim() || null },
  });
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
  return panggilRpcAdmin(RPC_TANPA_ISI[aksi], { p_admin_id: siap.adminId, p_soal_id: id });
}

export const hapusDrafAdmin = (request: NextRequest, id: string) => jalankanTanpaIsi(request, id, "hapus");

export async function aksiAdmin(request: NextRequest, id: string, aksi: string) {
  if (aksi === "terbitkan-versi") return simpanIsi(request, id, "ajukan");
  if (aksi === "versi-baru" || aksi === "arsipkan") return jalankanTanpaIsi(request, id, aksi);
  // Aksi tidak dikenal tetap melewati pemeriksaan Admin dulu.
  const auth = await adminDari(request);
  return auth.ok ? gagal(404, "Aksi tidak dikenal.") : gagal(auth.status, auth.error);
}
