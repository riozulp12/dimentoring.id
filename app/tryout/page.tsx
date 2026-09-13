import { redirect } from "next/navigation";

/**
 * Try Out — PRD Bagian 12. Integrasi Agensoal sudah final: route ini murni
 * meneruskan ke /api/agensoal/sso-redirect (yang menangani cek login + generate
 * token SSO). Link publik (TryoutCTA) & sidebar dashboard tetap menunjuk ke
 * "/tryout" seperti sebelumnya — tidak perlu diubah, sesuai catatan lama di sini.
 */
export default function TryoutPage() {
  redirect("/api/agensoal/sso-redirect");
}
