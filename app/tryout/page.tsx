import HalamanSegera, { metadataFiturSegera } from "@/components/ui/HalamanSegera";
import TryoutSsoRedirect from "@/components/tryout/TryoutSsoRedirect";
import { fiturTerbuka } from "@/lib/shared/fiturSegera";

export const generateMetadata = () => metadataFiturSegera("tryout");

/**
 * Try Out — PRD Bagian 12. Integrasi Agensoal sudah final: route ini menampilkan
 * layar transisi bermerek Dimentoring lalu meneruskan ke /api/agensoal/sso-redirect
 * (yang menangani cek login + generate token SSO). Link publik (TryoutCTA) &
 * sidebar dashboard tetap menunjuk ke "/tryout" seperti sebelumnya — tidak
 * perlu diubah, sesuai catatan lama di sini.
 *
 * Soft launch: selama fitur "tryout" belum dibuka (lib/shared/fiturSegera.ts),
 * halaman ini menampilkan alert "Segera hadir" — dicek di server, jadi URL
 * langsung pun tidak meneruskan ke SSO. Endpoint /api/agensoal/* TIDAK digembok.
 */
export default function TryoutPage() {
  if (!fiturTerbuka("tryout")) return <HalamanSegera id="tryout" />;
  return <TryoutSsoRedirect />;
}
