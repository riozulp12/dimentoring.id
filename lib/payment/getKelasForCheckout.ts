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
