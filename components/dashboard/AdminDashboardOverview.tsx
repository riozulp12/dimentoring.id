import Link from "next/link";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import type {
  AdminStats,
  KontenAiPreviewItem,
  MentorPengajuan,
  SiswaTerbaru,
} from "@/lib/admin/dashboardData";
import ApprovalMentorList from "@/components/admin/ApprovalMentorList";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"] });

/** Dashboard Admin — PRD Bagian 5, Bagian 8 BR-2 & BR-31. */

export interface AdminDashboardOverviewProps {
  adminName: string;
  stats: AdminStats;
  mentorPengajuan: MentorPengajuan[];
  siswaTerbaru: SiswaTerbaru[];
  kontenAiPreview: KontenAiPreviewItem[];
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

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

export default function AdminDashboardOverview({
  adminName,
  stats,
  mentorPengajuan,
  siswaTerbaru,
  kontenAiPreview,
}: AdminDashboardOverviewProps) {
  return (
    <div
      className={`${inter.className} mx-auto flex w-full max-w-[1600px] flex-col gap-6 p-4 sm:gap-8 sm:p-6 lg:gap-10 lg:p-10`}
    >
      <div className="flex flex-col gap-1 sm:gap-2">
        <h1 className="text-2xl font-bold tracking-[-0.02em] text-black sm:text-3xl">
          Haloo {adminName} 👋
        </h1>
        <p className="text-base text-black">Ringkasan operasional Dimentoring hari ini</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-4 lg:gap-8">
        <StatCard label="Siswa Terdaftar" value={String(stats.siswaTerdaftar)} unit="Siswa" />
        <StatCard label="Mentor Aktif" value={String(stats.mentorAktif)} unit="Mentor" />
        <StatCard
          label="Mentor Menunggu Approval"
          value={String(stats.mentorMenungguApproval)}
          unit="Mentor"
          href="/approval-mentor"
        />
        <StatCard
          label="Konten AI Menunggu Review"
          value={String(stats.kontenMenungguReview)}
          unit="Item"
          href="/kelola-konten"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-10">
        <Card className="gap-5 sm:gap-6 lg:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold tracking-[-0.02em] text-black sm:text-xl">
              Antrian Approval Mentor
            </h3>
            <Link href="/approval-mentor" className="shrink-0 text-sm font-medium text-[#081EEA]">
              Lihat Semua
            </Link>
          </div>
          <ApprovalMentorList items={mentorPengajuan} />
        </Card>

        <div className="flex flex-col gap-6 lg:gap-10">
          <Card className="gap-4 sm:gap-5">
            <h3 className="text-lg font-semibold tracking-[-0.02em] text-black sm:text-xl">
              Pendaftaran Siswa Terbaru
            </h3>
            {siswaTerbaru.length === 0 ? (
              <EmptyState text="Belum ada siswa yang daftar." />
            ) : (
              <div className="flex flex-col">
                {siswaTerbaru.map((s, index) => (
                  <div key={`${s.nama}-${index}`}>
                    {index > 0 ? <div className="h-px w-full bg-[#E3E3E3]" /> : null}
                    <div className="flex items-center justify-between gap-3 py-2.5 sm:py-3">
                      <p className="min-w-0 truncate text-base text-black">{s.nama}</p>
                      <p className="shrink-0 text-base text-[#7E7C7C]">{formatDate(s.tanggalDaftar)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="gap-4 sm:gap-5">
            <h3 className="text-lg font-semibold tracking-[-0.02em] text-black sm:text-xl">
              Konten AI Menunggu Review
            </h3>
            {kontenAiPreview.length === 0 ? (
              <EmptyState text="Tidak ada konten yang perlu direview saat ini." />
            ) : (
              <>
                <div className="flex flex-col">
                  {kontenAiPreview.map((item, index) => (
                    <div key={`${item.jenis}-${item.id}`}>
                      {index > 0 ? <div className="h-px w-full bg-[#E3E3E3]" /> : null}
                      <div className="flex flex-col gap-0.5 py-2.5 sm:py-3">
                        <p className="min-w-0 truncate text-base text-black">{item.judul}</p>
                        <p className="text-sm text-[#7E7C7C]">
                          {item.jenis === "materi" ? "Materi" : "Soal"} · {item.subtesNama}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                <Link href="/kelola-konten" className="text-sm font-medium text-[#081EEA]">
                  Lihat Semua
                </Link>
              </>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
