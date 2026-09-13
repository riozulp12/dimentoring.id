import "server-only";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Data layer halaman Checkout — PRD Bagian 13 (kelas, enrollments). Harga
 * SELALU dibaca dari sini di server (bukan dari client) sesuai instruksi
 * checkout: jangan percaya harga dari frontend.
 */

export interface KelasCheckoutData {
  id: string;
  nama: string;
  harga: number;
}

export async function getKelasForCheckout(kelasId: string): Promise<KelasCheckoutData | null> {
  const { data, error } = await supabaseServer
    .from("kelas")
    .select("id, nama, harga")
    .eq("id", kelasId)
    .maybeSingle();

  if (error) {
    console.error("[getKelasForCheckout] query kelas failed:", error);
    return null;
  }
  if (!data) return null;

  return { id: data.id as string, nama: data.nama as string, harga: Number(data.harga) };
}

export interface KelasSubtesOption {
  id: string;
  nama: string;
}

/**
 * Pool Subtes yang tersedia untuk kelas ini (kelas_subtes) — dipakai halaman
 * Checkout untuk tampilkan checklist (kalau > 1, "paket") atau skip langsung
 * (kalau <= 1). Fallback ke kelas.subtes_id (kolom lama) kalau kelas ini
 * belum pernah disentuh form kelas_subtes yang baru, supaya kelas lama tetap
 * dapat 1 subtes terisi otomatis di enrollment_subtes.
 */
export async function getKelasSubtesOptions(kelasId: string): Promise<KelasSubtesOption[]> {
  const { data, error } = await supabaseServer
    .from("kelas_subtes")
    .select("subtes_id, subtes:subtes_id(nama)")
    .eq("kelas_id", kelasId);

  if (error) {
    console.error("[getKelasSubtesOptions] query kelas_subtes failed:", error);
    return [];
  }

  type SubtesJoin = { nama: string } | { nama: string }[] | null;
  const rows = (data ?? []) as unknown as { subtes_id: string; subtes: SubtesJoin }[];
  if (rows.length > 0) {
    return rows.map((row) => {
      const subtes = Array.isArray(row.subtes) ? (row.subtes[0] ?? null) : row.subtes;
      return { id: row.subtes_id, nama: subtes?.nama ?? "-" };
    });
  }

  // Fallback kelas lama (subtes_id tunggal, belum ada baris kelas_subtes).
  const { data: kelasRow, error: kelasError } = await supabaseServer
    .from("kelas")
    .select("subtes_id, subtes:subtes_id(nama)")
    .eq("id", kelasId)
    .maybeSingle();
  if (kelasError || !kelasRow?.subtes_id) return [];

  const subtes = Array.isArray(kelasRow.subtes) ? (kelasRow.subtes[0] ?? null) : kelasRow.subtes;
  return [{ id: kelasRow.subtes_id as string, nama: (subtes as { nama: string } | null)?.nama ?? "-" }];
}

/** Cegah checkout ulang kelas yang sudah lunas (enrollments.status_pembayaran='lunas'). */
export async function isKelasSudahLunas(userId: string, kelasId: string): Promise<boolean> {
  const { data, error } = await supabaseServer
    .from("enrollments")
    .select("status_pembayaran")
    .eq("user_id", userId)
    .eq("kelas_id", kelasId)
    .maybeSingle();

  if (error) {
    console.error("[isKelasSudahLunas] query enrollments failed:", error);
    return false;
  }

  return data?.status_pembayaran === "lunas";
}
