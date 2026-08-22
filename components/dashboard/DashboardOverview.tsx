import type { ReactNode } from "react";
import Link from "next/link";
import { Inter } from "next/font/google";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"] });

// Server Component ini sengaja tidak import Button (client component, punya
// onClick) supaya tidak perlu jadi "use client" cuma buat 2 CTA link — style
// disamakan manual dengan Button variant="primary" size="sm".
const CTA_LINK_CLASS =
  "inline-flex items-center justify-center rounded-[18px] font-medium leading-[1.5] whitespace-nowrap transition-[filter,border-color] duration-150 ease-out px-5 py-2 text-sm sm:text-base tracking-[-0.32px] bg-[#081EEA] text-white border border-solid border-transparent drop-shadow-[2px_2px_0px_#000000] hover:border-white hover:drop-shadow-[0px_0px_5px_#000000] active:border-white active:drop-shadow-[2px_2px_0px_#000000]";

/**
 * Dashboard Siswa — overview cards (Figma node 653:2163).
 * Data disambungkan ke lib/dashboard/getSiswaDashboardData.ts — nama prop di
 * sini SENGAJA dibuat sama persis dengan field return function itu (lihat
 * app/(protected)/dashboard/siswa/page.tsx), supaya page.tsx cukup spread
 * hasilnya tanpa mapping manual.
 */

export interface ProgressBelajarItem {
  subtes: string;
  persen: number;
}

export interface KelasTerdaftarItem {
  nama: string;
  jadwal: string;
}

export interface InfoBeasiswaItem {
  nama: string;
  tanggal: string;
}

export interface TargetPtnData {
  targetJenjang: string;
  targetJurusan: string;
  targetUniversitas: string;
  keketatanScore: string;
  keketatanLabel: string;
}

export interface DashboardOverviewProps {
  userName?: string;
  /** null = siswa belum pernah isi Assessment — tampilkan CTA, bukan card kosong. */
  targetPtn: TargetPtnData | null;
  jumlahKelas: number;
  badgeKelas: string | null;
  /** null = siswa belum pernah mengerjakan Try Out sama sekali. */
  nilaiTryoutTertinggi: number | null;
  tryoutSubtes: string | null;
  badgeTryout: string | null;
  totalPoin: number;
  level: string | null;
  progressBelajar: ProgressBelajarItem[];
  kelasTerdaftar: KelasTerdaftarItem[];
  infoBeasiswa: InfoBeasiswaItem[];
}

/** Sama dengan konvensi warna Keketatan di Hasil Assessment (PRD 7.4.3). */
function keketatanColorClass(label: string): string {
  if (label.includes("Ketat")) return "text-[#E70A0A]";
  if (label.includes("Sedang")) return "text-[#0CBA00]";
  if (label.includes("Longgar")) return "text-[#006ABD]";
  return "text-black";
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

function StatCard({
  label,
  value,
  unit,
  status,
  statusColor = "text-[#0CBA00]",
}: {
  label: string;
  value: string;
  unit?: string;
  status?: string | null;
  statusColor?: string;
}) {
  return (
    <Card className="items-center justify-center gap-3 text-center sm:gap-4">
      <p className="whitespace-nowrap text-base text-[#7E7C7C]">{label}</p>
      <p className="flex items-end gap-2 text-xl font-semibold tracking-[-0.02em] text-black">
        {value}
        {unit ? <span className="text-base font-normal">{unit}</span> : null}
      </p>
      {status ? <p className={`text-base ${statusColor}`}>{status}</p> : null}
    </Card>
  );
}

function ProgressBar({ persen }: { persen: number }) {
  const clamped = Math.min(100, Math.max(0, persen));
  return (
    <div className="h-3 w-full overflow-hidden rounded-full bg-[#E3E3E3] sm:h-4">
      <div className="h-full rounded-full bg-[#081EEA]" style={{ width: `${clamped}%` }} />
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
      <p className="text-base text-[#7E7C7C]">{text}</p>
    </div>
  );
}

function ListCard({
  title,
  rows,
  emptyText,
}: {
  title: string;
  rows: Array<{ left: string; right: string; rightColor?: string }>;
  emptyText: string;
}) {
  return (
    <Card className="gap-4 sm:gap-5 lg:w-full">
      <h3 className="text-lg font-semibold tracking-[-0.02em] text-black sm:text-xl">{title}</h3>
      {rows.length === 0 ? (
        <EmptyState text={emptyText} />
      ) : (
        <div className="flex flex-col">
          {rows.map((row, index) => (
            <div key={`${row.left}-${index}`}>
              {index > 0 ? <div className="h-px w-full bg-[#E3E3E3]" /> : null}
              <div className="flex items-center justify-between gap-3 py-2.5 sm:py-3">
                <p className="min-w-0 truncate text-base text-black">{row.left}</p>
                <p className={`shrink-0 text-base ${row.rightColor ?? "text-[#7E7C7C]"}`}>
                  {row.right}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export default function DashboardOverview({
  userName = "Kamu",
  targetPtn,
  jumlahKelas,
  badgeKelas,
  nilaiTryoutTertinggi,
  tryoutSubtes,
  badgeTryout,
  totalPoin,
  level,
  progressBelajar,
  kelasTerdaftar,
  infoBeasiswa,
}: DashboardOverviewProps) {
  return (
    <div
      className={`${inter.className} mx-auto flex w-full max-w-[1600px] flex-col gap-6 p-4 sm:gap-8 sm:p-6 lg:gap-10 lg:p-10`}
    >
      <div className="flex flex-col gap-1 sm:gap-2">
        <h1 className="text-2xl font-bold tracking-[-0.02em] text-black sm:text-3xl">
          Haloo {userName} 👋
        </h1>
        <p className="text-base text-black">Lanjutkan belajar buat PTN impianmu</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-5 lg:gap-8">
        <Card className="justify-center gap-4 sm:col-span-2 lg:col-span-2">
          {targetPtn ? (
            <>
              <div className="flex flex-col gap-2">
                <p className="text-base text-[#7E7C7C]">Target PTN kamu</p>
                <p className="text-xl font-medium tracking-[-0.02em] text-black">
                  {targetPtn.targetJenjang} {targetPtn.targetJurusan}
                </p>
                <p className="text-xl font-semibold tracking-[-0.02em] text-[#081EEA]">
                  {targetPtn.targetUniversitas}
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <p className="text-base text-[#7E7C7C]">Estimasi Keketatan</p>
                <p
                  className={`flex items-end gap-2 text-xl font-semibold tracking-[-0.02em] ${keketatanColorClass(targetPtn.keketatanLabel)}`}
                >
                  {targetPtn.keketatanScore}
                  <span className="text-xl font-normal">({targetPtn.keketatanLabel})</span>
                </p>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 py-2 text-center">
              <p className="text-base text-[#7E7C7C]">
                Kamu belum punya hasil Assessment Prediksi PTN nih
              </p>
              <Link href="/assessment" className={CTA_LINK_CLASS}>
                Coba Assessment Sekarang
              </Link>
            </div>
          )}
        </Card>

        <StatCard label="Kelasmu" value={String(jumlahKelas)} unit="Kelas" status={badgeKelas} />
        <StatCard
          label="Tryout Terbaikmu"
          value={nilaiTryoutTertinggi === null ? "-" : String(nilaiTryoutTertinggi)}
          unit={nilaiTryoutTertinggi === null ? undefined : (tryoutSubtes ?? undefined)}
          status={nilaiTryoutTertinggi === null ? "Belum ada Try Out" : badgeTryout}
        />
        <StatCard label="Poin Referralmu" value={String(totalPoin)} unit="Poin" status={level} />
      </div>

      <Card className="gap-5 sm:gap-6">
        <h3 className="text-lg font-semibold tracking-[-0.02em] text-black sm:text-xl">
          Progress Belajar
        </h3>
        {progressBelajar.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-4 text-center">
            <p className="text-base text-[#7E7C7C]">
              Kamu belum ikut kelas apa pun nih. Yuk mulai belajar bareng mentor kami!
            </p>
            <Link href="/kelas" className={CTA_LINK_CLASS}>
              Lihat Kelas
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-4 sm:gap-5">
            {progressBelajar.map((item, index) => (
              <div key={`${item.subtes}-${index}`} className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-base text-black">{item.subtes}</p>
                  <p className="text-base text-[#7E7C7C]">{item.persen}%</p>
                </div>
                <ProgressBar persen={item.persen} />
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-10">
        <ListCard
          title="Kelas Terdaftar"
          rows={kelasTerdaftar.map((k) => ({ left: k.nama, right: k.jadwal }))}
          emptyText="Belum ada kelas terdaftar."
        />
        <ListCard
          title="Info Beasiswa & Event"
          rows={infoBeasiswa.map((b) => ({ left: b.nama, right: b.tanggal, rightColor: "text-[#E70A0A]" }))}
          emptyText="Belum ada info beasiswa atau event aktif saat ini."
        />
      </div>
    </div>
  );
}
