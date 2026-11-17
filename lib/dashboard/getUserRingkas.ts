import "server-only";
import { cache } from "react";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Baris ringkas tabel `users` untuk tampilan (nama, nama panggilan, avatar) — SATU pembacaan yang dipakai bersama oleh
 * (protected)/layout.tsx (lewat getAccountMenuData) dan sapaan dashboard (getUserDisplayName). Sebelumnya keduanya
 * membaca `users` sendiri-sendiri dalam satu render.
 *
 * cache() React = memoize PER REQUEST (bukan lintas-request): kunci = userId (string), jadi pengguna berbeda tidak
 * pernah berbagi hasil. Galat baca diperlakukan sama seperti sebelumnya: null (pemanggil memakai fallback-nya sendiri).
 * Hasilnya hanya dibaca, jangan dimutasi.
 */
export interface UserRingkas {
  nama: string | null;
  nama_panggilan: string | null;
  avatar_url: string | null;
}

export const getUserRingkas = cache(async (userId: string): Promise<UserRingkas | null> => {
  const { data } = await supabaseServer
    .from("users")
    .select("nama, nama_panggilan, avatar_url")
    .eq("id", userId)
    .maybeSingle();

  return (data as UserRingkas | null) ?? null;
});
