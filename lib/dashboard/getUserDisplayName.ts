import "server-only";
import { getUserRingkas } from "@/lib/dashboard/getUserRingkas";

/**
 * Nama singkat untuk greeting "Haloo [nama]" — dipakai lintas dashboard
 * (Siswa/Mentor/Admin). Pakai nama panggilan kalau ada, kalau tidak ambil
 * kata pertama dari nama lengkap.
 */
export async function getUserDisplayName(userId: string, fallback: string): Promise<string> {
  // Baris users dibagi dengan layout (getAccountMenuData) lewat getUserRingkas — satu kueri per request.
  const data = await getUserRingkas(userId);

  return data?.nama_panggilan || data?.nama?.split(" ")[0] || fallback;
}
