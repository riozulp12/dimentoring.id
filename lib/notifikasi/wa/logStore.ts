import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import type { BarisLogWa, LogWaStore } from "./types";

/**
 * Catatan kiriman WhatsApp di tabel notifikasi_wa_log (db/add_notifikasi_wa.sql).
 * Kunci idempotensi = kunci_kejadian (UNIQUE): INSERT ... ON CONFLICT DO NOTHING,
 * kirim hanya kalau barisnya BENAR-BENAR baru dibuat.
 *
 * Kalau migrasi belum dijalankan, semua fungsi di sini mengembalikan
 * "tabel_tidak_ada" / null (bukan melempar galat) supaya pengiriman dilewati
 * dengan tenang.
 */

function tabelTidakAda(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  // 42P01 = relasi tidak ada (Postgres), PGRST205 = tabel tak ada di schema cache PostgREST
  return error.code === "42P01" || error.code === "PGRST205" || /notifikasi_wa_log/.test(error.message ?? "");
}

export function buatLogWaSupabase(): LogWaStore {
  return {
    async klaim(baris: BarisLogWa) {
      const { data, error } = await supabaseServer
        .from("notifikasi_wa_log")
        .upsert(baris, { onConflict: "kunci_kejadian", ignoreDuplicates: true })
        .select("id");
      if (error) {
        if (tabelTidakAda(error)) return "tabel_tidak_ada";
        throw new Error(`klaim notifikasi_wa_log gagal (kode ${error.code ?? "?"})`);
      }
      return (data ?? []).length > 0 ? "dibuat" : "duplikat";
    },

    async perbarui(kunci, perubahan) {
      const { error } = await supabaseServer
        .from("notifikasi_wa_log")
        .update({ status: perubahan.status, provider_ref: perubahan.provider_ref ?? null, error: perubahan.error ?? null })
        .eq("kunci_kejadian", kunci);
      if (error) console.error(`[notifikasi-wa] perbarui log gagal (kode ${error.code ?? "?"}).`);
    },

    async hitungSejak(sejakIso) {
      const { count, error } = await supabaseServer
        .from("notifikasi_wa_log")
        .select("id", { count: "exact", head: true })
        .in("status", ["pending", "terkirim"])
        .gte("created_at", sejakIso);
      if (error) return null;
      return count ?? 0;
    },
  };
}
