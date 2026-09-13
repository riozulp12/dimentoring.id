import TryoutSsoRedirect from "@/components/tryout/TryoutSsoRedirect";

/**
 * Try Out — PRD Bagian 12. Integrasi Agensoal sudah final: route ini menampilkan
 * layar transisi bermerek Dimentoring lalu meneruskan ke /api/agensoal/sso-redirect
 * (yang menangani cek login + generate token SSO). Link publik (TryoutCTA) &
 * sidebar dashboard tetap menunjuk ke "/tryout" seperti sebelumnya — tidak
 * perlu diubah, sesuai catatan lama di sini.
 */
export default function TryoutPage() {
  return <TryoutSsoRedirect />;
}
