import type { ReactNode } from "react";
import { Inter } from "next/font/google";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"] });

/**
 * Dashboard Siswa — overview cards (Figma node 653:2163).
 * Semua data lewat props dengan default placeholder — belum ditautkan ke
 * data asli (progress belajar, kelas terdaftar, dsb. belum ada sumber data
 * di skema saat ini), jadi halaman ini murni implementasi visual dulu.
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

export interface DashboardOverviewProps {
  userName?: string;
  targetJenjang?: string;
  targetJurusan?: string;
  targetUniversitas?: string;
  keketatanScore?: string;
  keketatanLabel?: string;
  kelasCount?: number;
  kelasStatus?: string;
  tryoutScore?: number;
  tryoutSubtes?: string;
  tryoutStatus?: string;
  referralPoin?: number;
  referralLevel?: string;
  progressBelajar?: ProgressBelajarItem[];
  kelasTerdaftar?: KelasTerdaftarItem[];
  infoBeasiswa?: InfoBeasiswaItem[];
}

const DEFAULT_PROGRESS: ProgressBelajarItem[] = [
  { subtes: "Matematika - TKA", persen: 65 },
  { subtes: "Bahasa Indonesia - TKA", persen: 65 },
  { subtes: "Bahasa Indonesia - TKA", persen: 65 },
];

const DEFAULT_KELAS: KelasTerdaftarItem[] = [
  { nama: "Bahasa Indonesia - TKA", jadwal: "Senin, 19.00 WIB" },
  { nama: "Bahasa Indonesia - TKA", jadwal: "Senin, 19.00 WIB" },
  { nama: "Bahasa Indonesia - TKA", jadwal: "Senin, 19.00 WIB" },
];

const DEFAULT_BEASISWA: InfoBeasiswaItem[] = [
  { nama: "Beasiswa LPDP", tanggal: "21 Agustus 2026" },
  { nama: "Beasiswa Unggulan Kemendikbud", tanggal: "24 Agustus 2026" },
  { nama: "Webinar Kupas Tuntas TKA", tanggal: "30 Agustus 2026" },
];

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
  unit: string;
  status: string;
  statusColor?: string;
}) {
  return (
    <Card className="items-center justify-center gap-3 text-center sm:gap-4">
      <p className="whitespace-nowrap text-base text-[#7E7C7C]">{label}</p>
      <p className="flex items-end gap-2 text-xl font-semibold tracking-[-0.02em] text-black">
        {value}
        <span className="text-base font-normal">{unit}</span>
      </p>
      <p className={`text-base ${statusColor}`}>{status}</p>
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

function ListCard({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ left: string; right: string; rightColor?: string }>;
}) {
  return (
    <Card className="gap-4 sm:gap-5 lg:w-full">
      <h3 className="text-lg font-medium tracking-[-0.02em] text-black sm:text-xl lg:text-[28px]">{title}</h3>
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
    </Card>
  );
}

export default function DashboardOverview({
  userName = "Dulce",
  targetJenjang = "S1",
  targetJurusan = "Hukum",
  targetUniversitas = "Universitas Gajah Mada",
  keketatanScore = "2,32%",
  keketatanLabel = "Super Ketat",
  kelasCount = 10,
  kelasStatus = "Rajin Banget!",
  tryoutScore = 861,
  tryoutSubtes = "TKA",
  tryoutStatus = "Skor Impresif!",
  referralPoin = 1235,
  referralLevel = "Level: Rising Star",
  progressBelajar = DEFAULT_PROGRESS,
  kelasTerdaftar = DEFAULT_KELAS,
  infoBeasiswa = DEFAULT_BEASISWA,
}: DashboardOverviewProps) {
  return (
    <div
      className={`${inter.className} mx-auto flex w-full max-w-[1600px] flex-col gap-6 p-4 sm:gap-8 sm:p-6 lg:gap-10 lg:p-10`}
    >
      <div className="flex flex-col gap-1 sm:gap-2">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-black sm:text-3xl lg:text-[32px]">
          Haloo {userName} 👋
        </h1>
        <p className="text-base text-black">Lanjutkan belajar buat PTN impianmu</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-5 lg:gap-8">
        <Card className="justify-center gap-4 sm:col-span-2 lg:col-span-2">
          <div className="flex flex-col gap-2">
            <p className="text-base text-[#7E7C7C]">Target PTN kamu</p>
            <p className="text-xl font-medium tracking-[-0.02em] text-black">
              {targetJenjang} {targetJurusan}
            </p>
            <p className="text-xl font-semibold tracking-[-0.02em] text-[#081EEA]">
              {targetUniversitas}
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-base text-[#7E7C7C]">Estimasi Keketatan</p>
            <p
              className={`flex items-end gap-2 text-xl font-semibold tracking-[-0.02em] ${keketatanColorClass(keketatanLabel)}`}
            >
              {keketatanScore}
              <span className="text-xl font-normal">({keketatanLabel})</span>
            </p>
          </div>
        </Card>

        <StatCard label="Kelasmu" value={String(kelasCount)} unit="Kelas" status={kelasStatus} />
        <StatCard
          label="Tryout Terbaikmu"
          value={String(tryoutScore)}
          unit={tryoutSubtes}
          status={tryoutStatus}
        />
        <StatCard
          label="Poin Referralmu"
          value={String(referralPoin)}
          unit="Poin"
          status={referralLevel}
        />
      </div>

      <Card className="gap-5 sm:gap-6">
        <h3 className="text-lg font-medium tracking-[-0.02em] text-black sm:text-xl lg:text-[28px]">
          Progress Belajar
        </h3>
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
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-10">
        <ListCard
          title="Kelas Terdaftar"
          rows={kelasTerdaftar.map((k) => ({ left: k.nama, right: k.jadwal }))}
        />
        <ListCard
          title="Info Beasiswa & Event"
          rows={infoBeasiswa.map((b) => ({ left: b.nama, right: b.tanggal, rightColor: "text-[#E70A0A]" }))}
        />
      </div>
    </div>
  );
}
