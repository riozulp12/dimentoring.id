import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ROLE_DASHBOARD_PATH, SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import LengkapiProfilClient from "./LengkapiProfilClient";

/**
 * Wizard profiling — PRD Bagian 7.0.2 DIREVISI TOTAL (Agustus 2026). Di LUAR
 * route group (protected) dengan sengaja: user di sini SUDAH login (auto-login
 * dari /daftar atau Google) tapi BELUM TENTU profiling_selesai, jadi tidak bisa
 * lewat (protected)/layout.tsx (guard-nya justru MELARANG akses selama belum
 * selesai — lihat app/(protected)/layout.tsx). Halaman ini pakai guard-nya
 * SENDIRI, terbalik: wajib ADA session (redirect /login kalau tidak), dan kalau
 * profiling TERNYATA sudah selesai (role di session bukan lagi "unassigned" —
 * cuma bisa terjadi setelah POST /api/auth/lengkapi-profil sukses reissue
 * session), redirect ke dashboard alih-alih menampilkan wizard lagi.
 */
export default async function LengkapiProfilPage() {
  const cookieStore = await cookies();
  const session = verifySessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);

  if (!session) {
    redirect("/login");
  }

  if (session.role !== "unassigned") {
    redirect(ROLE_DASHBOARD_PATH[session.role]);
  }

  return <LengkapiProfilClient />;
}
