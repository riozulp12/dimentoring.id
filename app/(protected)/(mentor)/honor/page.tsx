import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { ROLE_DASHBOARD_PATH, SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { getMentorRoleStatus } from "@/lib/mentor/getMentorRoleStatus";
import { getHonorBulanIni, TIPE_KELAS_LABEL, type HonorKelasBreakdown } from "@/lib/mentor/getHonorData";
import { getReferralHistory, getReferralStats, getRewardHistory } from "@/lib/referral/getReferralData";
import { getAvailableRewardCatalog, getRedemptionHistory } from "@/lib/reward/getRewardCatalogData";
import PageTitle from "@/components/dashboard/PageTitle";
import ReferralSummary from "@/components/shared/ReferralSummary";

/** "Honor" (Mentor) — PRD Bagian 7.5.3 (rumus honor) & Bagian 7.1 (Referral, FR-R1 berlaku juga untuk Mentor). */

function formatRupiah(value: number): string {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}

function BreakdownRow({ item }: { item: HonorKelasBreakdown }) {
  return (
    <div className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="text-base text-black">{item.kelasNama}</p>
        <p className="text-sm text-[#7E7C7C]">
          {TIPE_KELAS_LABEL[item.tipeKelas] ?? item.tipeKelas} · {item.jumlahSiswaLunas} siswa lunas ·{" "}
          {item.persentase}%
        </p>
      </div>
      <p className="shrink-0 text-base font-medium text-black">{formatRupiah(item.subtotal)}</p>
    </div>
  );
}

export default async function HonorPage() {
  const cookieStore = await cookies();
  const session = verifySessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return null;
  if (session.role !== "mentor") {
    redirect(ROLE_DASHBOARD_PATH[session.role]);
  }

  // BR-27: fitur mengajar (termasuk Honor) terkunci selama Pending.
  if ((await getMentorRoleStatus(session.userId)) !== "active") {
    redirect("/dashboard/mentor");
  }

  const [honor, stats, referralHistory, rewardHistory, rewardCatalog, redemptionHistory, headersList] =
    await Promise.all([
      getHonorBulanIni(session.userId),
      getReferralStats(session.userId),
      getReferralHistory(session.userId),
      getRewardHistory(session.userId),
      getAvailableRewardCatalog(),
      getRedemptionHistory(session.userId),
      headers(),
    ]);

  const host = headersList.get("host") ?? "localhost:3000";
  const protocol = host.startsWith("localhost") ? "http" : "https";
  const referralLink = stats.kodeReferral ? `${protocol}://${host}/r/${stats.kodeReferral}` : "";

  return (
    <>
      <PageTitle value="Honor" />
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-8 p-4 sm:gap-10 sm:p-6 lg:p-10">
        <section className="flex flex-col gap-4 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-4 sm:px-8 sm:py-6">
          <div className="flex flex-col gap-1">
            <p className="text-sm text-[#7E7C7C]">Total Honor Bulan Ini</p>
            <p className="text-3xl font-semibold tracking-[-0.02em] text-[#081EEA] sm:text-4xl">
              {formatRupiah(honor.totalHonor)}
            </p>
            <p className="text-xs text-[#7E7C7C] sm:text-sm">
              Honor dihitung otomatis dari pembayaran siswa yang sudah lunas
            </p>
          </div>

          {honor.breakdown.length === 0 ? (
            <p className="pt-2 text-sm text-[#7E7C7C]">Belum ada kelas yang diampu.</p>
          ) : (
            <div className="flex flex-col divide-y divide-[#E3E3E3] pt-2">
              {honor.breakdown.map((item) => (
                <BreakdownRow key={item.kelasId} item={item} />
              ))}
            </div>
          )}
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-medium tracking-[-0.02em] text-black sm:text-xl">Kode & Poin Referral</h2>
          <ReferralSummary
            stats={stats}
            link={referralLink}
            referralHistory={referralHistory}
            rewardHistory={rewardHistory}
            rewardCatalog={rewardCatalog}
            redemptionHistory={redemptionHistory}
          />
        </section>
      </div>
    </>
  );
}
