import Image from "next/image";
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
    <section className="flex w-full items-center gap-[120px] bg-[#081EEA] px-[164px] py-16">
      <div className="flex flex-1 flex-col items-start justify-center gap-5">
        <h2 className="text-[40px] leading-[1.5] font-semibold tracking-[-0.8px] text-white">
          Belajar Jadi Seru dengan Referral & Leaderboard
        </h2>
        <p className="text-2xl leading-[1.5] tracking-[-0.48px] text-white">
          Kumpulkan poin dari referral & tryout, naik level, dan lihat
          posisimu di leaderboard teman & sekolah.
        </p>
        <Button
          variant="secondary"
          size="lg"
          className="w-[300px]"
          style={{ padding: "20px 32px" }}
        >
          Lihat Leaderboard
        </Button>
      </div>

      <div className="flex w-[800px] flex-col gap-8">
        {LEADERBOARD.map((entry) => (
          <div
            key={entry.name}
            className="flex w-full items-center justify-between rounded-[32px] border-[0.8px] border-[#E3E3E3] bg-white px-8 py-4 shadow-[1px_2px_4px_0px_rgba(0,0,0,0.1)]"
          >
            <div className="flex items-center gap-5">
              <Image src={entry.medal} width={32} height={56} alt="" />
              <p className="text-2xl leading-[1.5] font-medium tracking-[-0.48px] text-black">
                {entry.name}
              </p>
            </div>
            <p className="text-2xl leading-[1.5] font-semibold tracking-[-0.48px] text-black">
              {entry.points} pts
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
