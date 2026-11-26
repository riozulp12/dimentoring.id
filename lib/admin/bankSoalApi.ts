import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { SESSION_COOKIE_NAME, requireAdminAktif } from "@/lib/admin/enrollmentManual";
import { terjemahkanRpcAdmin } from "@/lib/shared/studio-soal/bankSoal";
import { isUuid } from "@/lib/shared/studio-soal/formSoal";

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
