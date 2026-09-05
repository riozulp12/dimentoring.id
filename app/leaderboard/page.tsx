import Image from "next/image";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { getNavbarProps } from "@/lib/dashboard/getNavbarProps";
import { getPublicLeaderboard, type LeaderboardEntry } from "@/lib/leaderboard/getPublicLeaderboard";
import Navbar from "@/components/ui/Navbar";
import Footer from "@/components/sections/Footer";

/**
 * Leaderboard publik (PRD Bagian 7.1/7.2) — PUBLIC ROUTE, tidak perlu login,
 * pola sama dengan app/assessment/page.tsx & app/beasiswa-event/page.tsx:
 * pakai Navbar landing page yang berubah otomatis sesuai status login,
 * bukan Header+Sidebar dashboard.
 */

const MEDAL_ICON: Record<number, string> = {
  1: "/icons/leaderboard-medal-gold.svg",
  2: "/icons/leaderboard-medal-silver.svg",
  3: "/icons/leaderboard-medal-bronze.svg",
};

function LeaderboardRow({ entry }: { entry: LeaderboardEntry }) {
  const medalSrc = MEDAL_ICON[entry.rank];

  return (
    <div className="flex items-center gap-4 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-3 shadow-[1px_2px_4px_0px_rgba(0,0,0,0.1)] sm:gap-5 sm:px-6 sm:py-4">
      <div className="flex w-9 shrink-0 items-center justify-center sm:w-10">
        {medalSrc ? (
          <Image
            src={medalSrc}
            width={32}
            height={56}
            alt={`Juara ${entry.rank}`}
            className="h-8 w-auto sm:h-10"
          />
        ) : (
          <span className="text-lg font-semibold text-[#7E7C7C]">{entry.rank}</span>
        )}
      </div>
      <p className="min-w-0 flex-1 truncate text-base font-medium text-black sm:text-lg">{entry.maskedNama}</p>
      <span className="inline-flex shrink-0 items-center rounded-full bg-[#EDE9FE] px-2.5 py-0.5 text-xs font-bold tracking-wide text-[#6D28D9]">
        {entry.level}
      </span>
      <p className="shrink-0 text-base font-semibold tracking-[-0.02em] text-black sm:text-lg">
        {entry.totalPoin.toLocaleString("id-ID")} pts
      </p>
    </div>
  );
}

export default async function LeaderboardPage() {
  const cookieStore = await cookies();
  const session = verifySessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);

  // navbarProps & entries independen satu sama lain — Promise.all supaya
  // tidak menunggu bergantian.
  const [navbarProps, entries] = await Promise.all([
    getNavbarProps(session),
    getPublicLeaderboard(),
  ]);

  return (
    <div className="flex w-full flex-col">
      <Navbar {...navbarProps} />
      <main className="mx-auto w-full max-w-[900px] flex-1 px-5 py-10 sm:px-8 sm:py-12 md:px-12 lg:px-20 lg:py-16">
        <div className="mb-8 flex flex-col items-center gap-2 text-center sm:mb-10">
          <h1 className="text-2xl font-bold tracking-[-0.02em] text-black sm:text-3xl">Leaderboard</h1>
          <p className="text-base text-[#7E7C7C]">
            Siswa & mentor dengan poin referral dan tryout terbanyak
          </p>
        </div>

        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-16 text-center">
            <p className="text-base text-[#7E7C7C]">
              Leaderboard akan mulai terisi begitu ada yang mengumpulkan poin referral atau tryout!
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {entries.map((entry) => (
              <LeaderboardRow key={entry.rank} entry={entry} />
            ))}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
