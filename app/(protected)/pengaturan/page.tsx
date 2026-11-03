import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { getPengaturanData } from "@/lib/pengaturan/getPengaturanData";
import { getNotifWaMentor } from "@/lib/pengaturan/notifWaMentor";
import PageTitle from "@/components/dashboard/PageTitle";
import PengaturanClient from "@/components/pengaturan/PengaturanClient";

/** Halaman Pengaturan — SATU halaman untuk Siswa/Mentor/Admin, 5 section
 * berurutan, section yang tidak relevan disembunyikan sesuai role (PRD
 * Bagian 8 BR-14/BR-25, Bagian 13). */
export default async function PengaturanPage() {
  const cookieStore = await cookies();
  const session = verifySessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if (!session) redirect("/login");

  const data = await getPengaturanData(session.userId);
  if (!data) redirect("/login");

  // Saklar WhatsApp "siswa baru" hanya untuk Mentor; dibaca terpisah supaya
  // halaman tetap jalan walau kolomnya belum ada (migrasi belum dijalankan).
  const notifWaMentor = session.role === "mentor" ? await getNotifWaMentor(session.userId) : null;

  return (
    <>
      <PageTitle value="Pengaturan" />
      <div className="mx-auto flex w-full max-w-[900px] flex-col gap-6 p-4 sm:gap-8 sm:p-6 lg:p-10">
        <PengaturanClient
          role={session.role}
          notifEmail={data.notifEmail}
          notifWa={data.notifWa}
          notifWaMentor={notifWaMentor}
          optOutLeaderboard={data.optOutLeaderboard}
          consentLeaderboardLokasi={data.consentLeaderboardLokasi}
          permintaanHapusAkun={data.permintaanHapusAkun}
          tanggalPermintaanHapus={data.tanggalPermintaanHapus}
        />
      </div>
    </>
  );
}
