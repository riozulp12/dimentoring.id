import type {
  ReferralHistoryItem,
  ReferralStats,
  ReferralStatus,
  RewardHistoryItem,
} from "@/lib/referral/getReferralData";
import ReferralLinkCard from "./ReferralLinkCard";

/**
 * Blok "Kode & Link, Stat, Riwayat Referral, Riwayat Reward" — PRD Bagian
 * 7.1. Dipakai ulang PERSIS oleh halaman Referral Siswa
 * (app/(protected)/(siswa)/referral/page.tsx) dan section 2 halaman Honor
 * Mentor (app/(protected)/(mentor)/honor/page.tsx), sesuai FR-R1 (kode
 * referral berlaku untuk Student maupun Mentor) — jangan duplikasi JSX ini.
 */

const STATUS_LABEL: Record<ReferralStatus, string> = {
  terdaftar: "Terdaftar",
  dalam_proses: "Dalam Proses",
  terkonversi: "Terkonversi",
  tidak_valid: "Tidak Valid",
};

const STATUS_BADGE: Record<ReferralStatus, string> = {
  terdaftar: "bg-[#F9FAFF] text-[#081EEA]",
  dalam_proses: "bg-amber-50 text-amber-700",
  terkonversi: "bg-[#F0FDF4] text-[#0CBA00]",
  tidak_valid: "bg-[#FFEBEB] text-[#E70A0A]",
};

const REWARD_STATUS_LABEL: Record<string, string> = {
  tertunda: "Tertunda",
  cair: "Cair",
  ditahan: "Ditahan",
};

const REWARD_STATUS_BADGE: Record<string, string> = {
  tertunda: "bg-amber-50 text-amber-700",
  cair: "bg-[#F0FDF4] text-[#0CBA00]",
  ditahan: "bg-[#FFEBEB] text-[#E70A0A]",
};

function formatTanggal(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

function StatCard({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-4 text-center sm:gap-4 sm:px-8 sm:py-5">
      <p className="whitespace-nowrap text-base text-[#7E7C7C]">{label}</p>
      <p className="flex items-end gap-2 text-xl font-semibold tracking-[-0.02em] text-black">
        {value}
        {unit ? <span className="text-base font-normal">{unit}</span> : null}
      </p>
    </div>
  );
}

export default function ReferralSummary({
  stats,
  link,
  referralHistory,
  rewardHistory,
}: {
  stats: ReferralStats;
  link: string;
  referralHistory: ReferralHistoryItem[];
  rewardHistory: RewardHistoryItem[];
}) {
  return (
    <div className="flex flex-col gap-6">
      <ReferralLinkCard kodeReferral={stats.kodeReferral} link={link} />

      <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
        <StatCard label="Total Klik" value={String(stats.totalKlik)} />
        <StatCard label="Pendaftaran" value={String(stats.totalPendaftaran)} />
        <StatCard label="Terkonversi" value={String(stats.totalTerkonversi)} />
        <StatCard label="Poin Referral" value={String(stats.totalPoin)} unit="Poin" />
      </div>

      <section className="flex flex-col gap-4 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-4 sm:px-8 sm:py-6">
        <h2 className="text-lg font-semibold tracking-[-0.02em] text-black sm:text-xl">Riwayat Referral</h2>
        {referralHistory.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
            <p className="text-base text-[#7E7C7C]">
              Belum ada yang daftar pakai kode referral kamu. Yuk share ke teman-temanmu!
            </p>
          </div>
        ) : (
          <div className="flex flex-col">
            {referralHistory.map((item, index) => (
              <div key={item.id}>
                {index > 0 ? <div className="h-px w-full bg-[#E3E3E3]" /> : null}
                <div className="flex items-center justify-between gap-3 py-2.5 sm:py-3">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <p className="truncate text-base text-black">{item.refereeNama}</p>
                    <p className="text-sm text-[#7E7C7C]">{formatTanggal(item.tanggalDaftar)}</p>
                  </div>
                  <span
                    className={`shrink-0 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[item.status]}`}
                  >
                    {STATUS_LABEL[item.status]}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-4 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-4 sm:px-8 sm:py-6">
        <div className="flex flex-col gap-1.5">
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-black sm:text-xl">Riwayat Reward</h2>
          <p className="text-sm text-[#7E7C7C]">
            Reward cair otomatis setelah temanmu melakukan pembayaran pertama
          </p>
        </div>
        {rewardHistory.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
            <p className="text-base text-[#7E7C7C]">Belum ada reward yang cair</p>
          </div>
        ) : (
          <div className="flex flex-col">
            {rewardHistory.map((item, index) => (
              <div key={item.id}>
                {index > 0 ? <div className="h-px w-full bg-[#E3E3E3]" /> : null}
                <div className="flex items-center justify-between gap-3 py-2.5 sm:py-3">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <p className="truncate text-base text-black">
                      {item.jenisReward} · {item.refereeNama}
                    </p>
                    <p className="text-sm text-[#7E7C7C]">{formatTanggal(item.tanggal)}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <p className="text-base text-black">{item.nominalAtauPoin}</p>
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${REWARD_STATUS_BADGE[item.statusPencairan]}`}
                    >
                      {REWARD_STATUS_LABEL[item.statusPencairan]}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
