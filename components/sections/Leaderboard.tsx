import Image from "next/image";
import Link from "next/link";
import Button from "@/components/ui/Button";

interface LeaderboardEntry {
  medal: string;
  name: string;
  points: number;
}

const LEADERBOARD: LeaderboardEntry[] = [
  { medal: "/icons/leaderboard-medal-gold.svg", name: "S***", points: 805 },
  { medal: "/icons/leaderboard-medal-silver.svg", name: "I***", points: 761 },
  { medal: "/icons/leaderboard-medal-bronze.svg", name: "R**", points: 739 },
];

export default function Leaderboard() {
  return (
    <section className="flex w-full flex-col items-center gap-10 bg-[#081EEA] px-5 py-10 sm:px-8 sm:py-12 md:px-12 lg:flex-row lg:items-center lg:gap-10 lg:px-12 lg:py-16 min-[1440px]:gap-16 min-[1440px]:px-16 min-[1920px]:gap-[120px] min-[1920px]:px-[164px]">
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center sm:gap-5 lg:items-start lg:text-left">
        <h4 className="text-lg leading-[1.5] font-semibold tracking-[-0.36px] text-white sm:text-xl">
          Belajar Jadi Seru dengan Referral & Leaderboard
        </h4>
        <p className="text-base leading-[1.5] tracking-[-0.36px] text-white">
          Kumpulkan poin dari referral & tryout, naik level, dan lihat
          posisimu di leaderboard teman & sekolah.
        </p>
        <Link href="/daftar" className="w-full sm:w-[220px]">
          <Button variant="secondary" size="sm" className="w-full">
            Lihat Leaderboard
          </Button>
        </Link>
      </div>

      <div className="flex w-full max-w-[420px] shrink-0 flex-col gap-4 sm:gap-6 lg:gap-8 min-[1440px]:max-w-[500px] min-[1920px]:max-w-[800px]">
        {LEADERBOARD.map((entry) => (
          <div
            key={entry.name}
            className="flex w-full items-center justify-between rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-3 shadow-[1px_2px_4px_0px_rgba(0,0,0,0.1)] sm:rounded-[24px] sm:px-6 sm:py-4 lg:rounded-[32px] lg:px-8"
          >
            <div className="flex items-center gap-3 sm:gap-5">
              <Image
                src={entry.medal}
                width={32}
                height={56}
                alt=""
                className="h-9 w-auto sm:h-12 lg:h-14"
              />
              <p className="text-lg leading-[1.5] font-medium tracking-[-0.36px] text-black">
                {entry.name}
              </p>
            </div>
            <p className="text-lg leading-[1.5] font-semibold tracking-[-0.36px] text-black">
              {entry.points} pts
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
