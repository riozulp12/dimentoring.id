import type { ReactNode } from "react";
import Link from "next/link";
import { Inter } from "next/font/google";
import {
  HREF_KELAS_SISWA,
  HREF_REFERRAL_SISWA,
  hrefEvent,
  hrefKelasSiswa,
} from "@/lib/shared/dashboardLinks";
import BarisKlik from "@/components/dashboard/BarisKlik";
import IsiBarisDuaKolom from "@/components/dashboard/IsiBarisDuaKolom";

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
  /** id kelas — dasar link ke halaman kelas (tanpa id = baris tidak diklik). */
  kelasId?: string | null;
  subtes: string;
  persen: number;
}

export interface KelasTerdaftarItem {
  kelasId?: string | null;
  nama: string;
  jadwal: string;
}

export interface InfoBeasiswaItem {
  /** konten_info.id — dasar link ke halaman detail (tanpa id = baris tidak diklik). */
  kontenId?: string | null;
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
  href,
}: {
  label: string;
  value: string;
  unit?: string;
  status?: string | null;
  statusColor?: string;
  href?: string;
}) {
  const content = (
    <Card
      className={`h-full items-center justify-center gap-3 text-center transition-colors sm:gap-4 ${
        href ? "cursor-pointer hover:border-[#081EEA]" : ""
      }`}
    >
      <p className="whitespace-nowrap text-base text-[#7E7C7C]">{label}</p>
      <p className="flex items-end gap-2 text-xl font-semibold tracking-[-0.02em] text-black">
        {value}
        {unit ? <span className="text-base font-normal">{unit}</span> : null}
      </p>
      {status ? <p className={`text-base ${statusColor}`}>{status}</p> : null}
    </Card>
  );

  if (href) {
    return (
      <Link href={href} className="block rounded-[20px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#081EEA]">
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

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
      <p className="text-base text-[#7E7C7C]">{text}</p>
    </div>
  );
}

/** Diexport supaya card "Info Beasiswa & Event" yang sama bisa dipakai ulang
 * di halaman "Kelas Saya" (section "Event dan Beasiswa") — `headerAction`
 * opsional, mis. link "Lihat Semua". */
export function ListCard({
  title,
  rows,
  emptyText,
  headerAction,
  duaKolom = false,
}: {
  title: string;
  rows: Array<{ left: string; right: string; rightColor?: string; href?: string | null }>;
  emptyText: string;
  headerAction?: { href: string; label: string };
  /** Baris dua kolom sama lebar (nama maks. 2 baris + jadwal wrap; ditumpuk di layar sempit) — untuk Kelas Terdaftar. */
  duaKolom?: boolean;
}) {
  return (
    <Card className="gap-4 sm:gap-5 lg:w-full">
      <div className="flex items-center justify-between gap-3">
        <h3 className="min-w-0 text-lg font-semibold tracking-[-0.02em] text-black sm:text-xl">{title}</h3>
        {headerAction ? (
          <Link
            href={headerAction.href}
            className="shrink-0 text-sm font-medium text-[#081EEA] transition-opacity hover:opacity-80 sm:text-base"
          >
            {headerAction.label}
          </Link>
        ) : null}
      </div>
      {rows.length === 0 ? (
        <EmptyState text={emptyText} />
      ) : (
        <div className="flex flex-col">
          {rows.map((row, index) => (
            <div key={`${row.left}-${index}`}>
              {index > 0 ? <div className="h-px w-full bg-[#E3E3E3]" /> : null}
              {duaKolom ? (
                <BarisKlik href={row.href} className="-mx-2 px-2 py-2.5 sm:py-3">
                  <IsiBarisDuaKolom kiri={row.left} kanan={row.right} kananClass={row.rightColor} />
                </BarisKlik>
              ) : (
                <BarisKlik
                  href={row.href}
                  className="-mx-2 flex items-center justify-between gap-3 px-2 py-2.5 sm:py-3"
                >
                  <p className="min-w-0 truncate text-base text-black">{row.left}</p>
                  <p className={`shrink-0 text-base ${row.rightColor ?? "text-[#7E7C7C]"}`}>
                    {row.right}
                  </p>
                </BarisKlik>
              )}
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

        <StatCard label="Kelasmu" value={String(jumlahKelas)} unit="Kelas" status={badgeKelas} href={HREF_KELAS_SISWA} />
        <StatCard
          label="Tryout Terbaikmu"
          value={nilaiTryoutTertinggi === null ? "-" : String(nilaiTryoutTertinggi)}
          unit={nilaiTryoutTertinggi === null ? undefined : (tryoutSubtes ?? undefined)}
          status={nilaiTryoutTertinggi === null ? "Belum ada Try Out" : badgeTryout}
        />
        <StatCard label="Poin Referralmu" value={String(totalPoin)} unit="Poin" status={level} href={HREF_REFERRAL_SISWA} />
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
              <BarisKlik
                key={`${item.subtes}-${index}`}
                href={hrefKelasSiswa(item.kelasId)}
                className="-mx-2 flex flex-col gap-2 px-2 py-1"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-base text-black">{item.subtes}</p>
                  <p className="text-base text-[#7E7C7C]">{item.persen}%</p>
                </div>
                <ProgressBar persen={item.persen} />
              </BarisKlik>
            ))}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-10">
        <ListCard
          title="Kelas Terdaftar"
          duaKolom
          rows={kelasTerdaftar.map((k) => ({ left: k.nama, right: k.jadwal, href: hrefKelasSiswa(k.kelasId) }))}
          emptyText="Belum ada kelas terdaftar."
        />
        <ListCard
          title="Info Beasiswa & Event"
          rows={infoBeasiswa.map((b) => ({ left: b.nama, right: b.tanggal, rightColor: "text-[#E70A0A]", href: hrefEvent(b.kontenId) }))}
          emptyText="Belum ada info beasiswa atau event aktif saat ini."
        />
      </div>
    </div>
  );
}
