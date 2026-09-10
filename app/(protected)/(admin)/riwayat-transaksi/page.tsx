import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ROLE_DASHBOARD_PATH, SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { getRiwayatTransaksiList } from "@/lib/admin/getRiwayatTransaksiData";
import PageTitle from "@/components/dashboard/PageTitle";
import RiwayatTransaksiClient from "@/components/admin/RiwayatTransaksiClient";

/** "Riwayat Transaksi" (Admin) — PRD Bagian 8 (BR-19, BR-20) & Bagian 13 (payments, kode_promo). */
export default async function RiwayatTransaksiPage() {
  const cookieStore = await cookies();
  const session = verifySessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return null;
  if (session.role !== "admin") {
    redirect(ROLE_DASHBOARD_PATH[session.role]);
  }

  const transaksi = await getRiwayatTransaksiList();

  return (
    <>
      <PageTitle value="Riwayat Transaksi" />
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 p-4 sm:gap-8 sm:p-6 lg:p-10">
        <RiwayatTransaksiClient initialTransaksi={transaksi} />
      </div>
    </>
  );
}
