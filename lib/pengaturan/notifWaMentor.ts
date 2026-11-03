import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import { normalisasiNoWa } from "@/lib/shared/noWa";

/**
 * Persetujuan Mentor menerima WhatsApp otomatis "siswa baru"
 * (users.notif_wa_setuju + notif_wa_setuju_at, db/add_notifikasi_wa.sql).
 * Terpisah dari toggle umum "Notifikasi WhatsApp" (users.notif_wa).
 *
 * Kalau migrasi belum dijalankan, kolomnya belum ada: fungsi di sini
 * mengembalikan status ramah ("tersedia: false" / "kolom_belum_ada"),
 * tidak melempar galat dan tidak merusak halaman Pengaturan.
 */

export interface NotifWaMentorData {
  /** false = kolom persetujuan belum ada di database (migrasi belum dijalankan). */
  tersedia: boolean;
  setuju: boolean;
  /** Nomor tersimpan dalam format 628…, null kalau kosong/tidak valid. */
  noWa: string | null;
}

export type SimpanNotifWaHasil = "ok" | "nomor_tidak_valid" | "kolom_belum_ada" | "gagal";

export function kolomPersetujuanBelumAda(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  // 42703 = undefined_column (Postgres); PostgREST kadang melapor lewat pesan
  return error.code === "42703" || /notif_wa_setuju/.test(error.message ?? "");
}

export async function getNotifWaMentor(userId: string): Promise<NotifWaMentorData> {
  const lengkap = await supabaseServer.from("users").select("no_wa, notif_wa_setuju").eq("id", userId).maybeSingle();
  if (!lengkap.error) {
    return {
      tersedia: true,
      setuju: lengkap.data?.notif_wa_setuju === true,
      noWa: normalisasiNoWa(lengkap.data?.no_wa),
    };
  }

  // Kolom belum ada (atau galat lain): tampilkan nomor saja, saklar dinonaktifkan.
  const nomor = await supabaseServer.from("users").select("no_wa").eq("id", userId).maybeSingle();
  return { tersedia: false, setuju: false, noWa: normalisasiNoWa(nomor.data?.no_wa) };
}

export async function simpanNotifWaMentor(userId: string, setuju: boolean): Promise<SimpanNotifWaHasil> {
  if (setuju) {
    const { data, error } = await supabaseServer.from("users").select("no_wa").eq("id", userId).maybeSingle();
    if (error || !data) return "gagal";
    if (!normalisasiNoWa(data.no_wa)) return "nomor_tidak_valid";
  }

  const perubahan = setuju
    ? { notif_wa_setuju: true, notif_wa_setuju_at: new Date().toISOString() }
    : { notif_wa_setuju: false };
  const { error } = await supabaseServer.from("users").update(perubahan).eq("id", userId);
  if (error) {
    if (kolomPersetujuanBelumAda(error)) return "kolom_belum_ada";
    console.error(`[pengaturan/notif-wa] simpan gagal (kode ${error.code ?? "?"}).`);
    return "gagal";
  }
  return "ok";
}
