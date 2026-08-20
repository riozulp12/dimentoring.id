import Link from "next/link";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import type { MentorKelasSiswaProgress, MentorKelasTerdaftar, MentorStats } from "@/lib/mentor/dashboardData";
import type { BeasiswaEventItem } from "@/lib/dashboard/getInfoBeasiswaEvent";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"] });

/**
 * Dashboard Mentor — PRD Bagian 7.5.1/7.7 (revisi) & Bagian 8 BR-27.
 * "Honor Bulan Ini" SENGAJA tidak masuk sini (rumus belum final) — cuma ada
 * di halaman /honor terpisah.
 */

export interface MentorDashboardOverviewProps {
  mentorName: string;
  pending: boolean;
  stats: MentorStats;
  progressByKelas: MentorKelasSiswaProgress[];
  kelasTerdaftar: MentorKelasTerdaftar[];
  beasiswaEvent: BeasiswaEventItem[];
}

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`flex flex-col rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-4 sm:px-8 sm:py-5 ${className}`}
    >
      {children}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
      <p className="text-base text-[#7E7C7C]">{text}</p>
    </div>
  );
}

function StatCard({
  label,
  value,
  unit,
  href,
}: {
  label: string;
  value: string;
  unit: string;
  href?: string;
}) {
  const content = (
    <Card
      className={`items-center justify-center gap-3 text-center transition-colors sm:gap-4 ${
        href ? "cursor-pointer hover:border-[#081EEA]" : ""
      }`}
    >
      <p className="whitespace-nowrap text-base text-[#7E7C7C]">{label}</p>
      <p className="flex items-end gap-2 text-xl font-semibold tracking-[-0.02em] text-black">
        {value}
        <span className="text-base font-normal">{unit}</span>
      </p>
    </Card>
  );

  if (href) {
    return (
      <Link href={href} className="block">
        {content}
      </Link>
    );
  }
  return content;
}

function ProgressBar({ persen }: { persen: number }) {
  const clamped = Math.min(100, Math.max(0, persen));
  return (
    <div className="h-3 w-full overflow-hidden rounded-full bg-[#E3E3E3] sm:h-4">
      <div className="h-full rounded-full bg-[#081EEA]" style={{ width: `${clamped}%` }} />
    </div>
  );
}

function formatJadwal(jadwal: unknown): string {
  if (!jadwal || typeof jadwal !== "object") return "Jadwal belum diatur";
  const j = jadwal as Record<string, unknown>;
  const hari = typeof j.hari === "string" ? j.hari : null;
  const jamMulai = typeof j.jam_mulai === "string" ? j.jam_mulai : null;
  if (hari && jamMulai) return `${hari}, ${jamMulai} WIB`;
  if (hari) return hari;
  return "Jadwal belum diatur";
}

function LockedMengajarNotice() {
  return (
    <Card className="items-center gap-3 border-amber-200 bg-amber-50 text-center">
      <p className="text-base font-medium text-amber-800">
        Akun kamu sedang direview Admin, fitur mengajar akan aktif setelah disetujui
      </p>
    </Card>
  );
}

export default function MentorDashboardOverview({
  mentorName,
  pending,
  stats,
  progressByKelas,
  kelasTerdaftar,
  beasiswaEvent,
}: MentorDashboardOverviewProps) {
  return (
    <div
      className={`${inter.className} mx-auto flex w-full max-w-[1600px] flex-col gap-6 p-4 sm:gap-8 sm:p-6 lg:gap-10 lg:p-10`}
    >
      <div className="flex flex-col gap-1 sm:gap-2">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-black sm:text-3xl lg:text-[32px]">
          Haloo Kak {mentorName} 👋
        </h1>
        <p className="text-base text-black">Terus dampingi siswa binaanmu menuju PTN impian</p>
      </div>

      {pending ? (
        <LockedMengajarNotice />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-4 lg:gap-8">
            <StatCard label="Kelas Diampu" value={String(stats.kelasDiampu)} unit="Kelas" />
            <StatCard label="Siswa Binaan" value={String(stats.siswaBinaan)} unit="Siswa" />
            <StatCard
              label="Rata-rata Progress Siswa Binaan"
              value={stats.rataRataProgress === null ? "-" : String(stats.rataRataProgress)}
              unit={stats.rataRataProgress === null ? "" : "%"}
            />
            <StatCard
              label="Konten AI Menunggu Review"
              value={String(stats.kontenMenungguReview)}
              unit="Item"
              href="/review-konten"
            />
          </div>

          <Card className="gap-5 sm:gap-6">
            <h3 className="text-lg font-medium tracking-[-0.02em] text-black sm:text-xl lg:text-[28px]">
              Progress Siswa Binaan
            </h3>
            {progressByKelas.length === 0 ? (
              <EmptyState text="Belum ada siswa binaan di kelas kamu." />
            ) : (
              <div className="flex flex-col gap-6">
                {progressByKelas.map((kelas) => (
                  <div key={kelas.kelasId} className="flex flex-col gap-3">
                    <p className="text-base font-medium text-black">{kelas.kelasNama}</p>
                    {kelas.siswa.length === 0 ? (
                      <p className="text-sm text-[#7E7C7C]">Belum ada siswa terdaftar di kelas ini.</p>
                    ) : (
                      <div className="flex flex-col gap-4">
                        {kelas.siswa.map((s) => (
                          <div key={s.userId} className="flex flex-col gap-2">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-base text-black">{s.nama}</p>
                              <p className="text-base text-[#7E7C7C]">{s.progresPersen}%</p>
                            </div>
                            <ProgressBar persen={s.progresPersen} />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-10">
            <Card className="gap-4 sm:gap-5">
              <h3 className="text-lg font-medium tracking-[-0.02em] text-black sm:text-xl lg:text-[28px]">
                Kelas Terdaftar
              </h3>
              {kelasTerdaftar.length === 0 ? (
                <EmptyState text="Belum ada kelas yang di-assign untukmu." />
              ) : (
                <div className="flex flex-col">
                  {kelasTerdaftar.map((k, index) => (
                    <div key={k.id}>
                      {index > 0 ? <div className="h-px w-full bg-[#E3E3E3]" /> : null}
                      <div className="flex items-center justify-between gap-3 py-2.5 sm:py-3">
                        <p className="min-w-0 truncate text-base text-black">{k.nama}</p>
                        <p className="shrink-0 text-base text-[#7E7C7C]">{formatJadwal(k.jadwal)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card className="gap-4 sm:gap-5">
              <h3 className="text-lg font-medium tracking-[-0.02em] text-black sm:text-xl lg:text-[28px]">
                Info Beasiswa & Event
              </h3>
              {beasiswaEvent.length === 0 ? (
                <EmptyState text="Belum ada info beasiswa atau event aktif saat ini." />
              ) : (
                <div className="flex flex-col">
                  {beasiswaEvent.map((b, index) => (
                    <div key={b.id}>
                      {index > 0 ? <div className="h-px w-full bg-[#E3E3E3]" /> : null}
                      <div className="flex items-center justify-between gap-3 py-2.5 sm:py-3">
                        <p className="min-w-0 truncate text-base text-black">{b.judul}</p>
                        <p className="shrink-0 text-base text-[#E70A0A]">
                          {b.deadline ?? "Tanpa deadline"}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
