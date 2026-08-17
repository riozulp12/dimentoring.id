"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import Button from "@/components/ui/Button";
import Mascot from "@/components/ui/Mascot";

export interface PilihanCardData {
  urutanPilihan: number;
  jenjang: string;
  namaJurusan: string;
  namaUniversitas: string;
  keketatanScore: number;
  keketatanLabel: string;
  peluangScore: number;
  peluangLabel: string;
}

export interface KelasRekomendasiData {
  id: string;
  nama: string;
  harga: number;
}

export interface TryoutRekomendasiData {
  id: string;
  nama: string;
  tipeAkses: "free" | "premium";
  alasan: string;
}

export interface AssessmentHasilData {
  rataRataRapor: number | null;
  nilaiPrestasi: number | null;
  nilaiAkhir: number | null;
  nilaiAkhirLabel: string | null;
  hasilPrediksi: PilihanCardData[];
  rekomendasiJurusan: PilihanCardData[];
  isLoggedInOwner: boolean;
  kelasRekomendasi: KelasRekomendasiData[];
  tryoutRekomendasi: TryoutRekomendasiData[];
  showDaftarCta: boolean;
}

function formatNilai(value: number | null): string {
  if (value === null) return "-";
  return value.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatRupiah(value: number): string {
  return value === 0 ? "Gratis" : `Rp${value.toLocaleString("id-ID")}`;
}

/** Warna label kualitatif Keketatan/Peluang — PRD Bagian 7.4.3: merah=ketat/kecil, hijau=sedang, biru=longgar/besar. */
function labelColorClass(label: string): string {
  if (label.includes("Ketat") || label.includes("Kecil")) return "text-[#E70A0A]";
  if (label.includes("Sedang")) return "text-[#0CBA00]";
  if (label.includes("Longgar") || label.includes("Besar")) return "text-[#006ABD]";
  return "text-black";
}

function AccordionSection({
  title,
  subtitle,
  open,
  onToggle,
  children,
}: {
  title: ReactNode;
  subtitle?: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="w-full rounded-[32px] border-[0.6px] border-[#E3E3E3] bg-white shadow-[1px_2px_4px_rgba(0,0,0,0.1)]">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-5 py-5 text-left sm:gap-4 sm:px-10 sm:py-8 lg:px-16"
      >
        <span className="min-w-0 flex-1 text-lg font-semibold leading-[1.5] tracking-[-0.02em] text-[#081EEA] sm:text-2xl lg:text-[28px]">
          {title}
          {subtitle ? (
            <span className="ml-2 text-sm font-normal text-[#7E7C7C] sm:text-lg lg:text-xl">{subtitle}</span>
          ) : null}
        </span>
        <Image
          src="/icons/assessment-accordion-chevron.svg"
          width={24}
          height={24}
          alt=""
          className={`shrink-0 transition-transform duration-200 ${open ? "" : "-rotate-90"}`}
        />
      </button>
      {open ? (
        <div className="flex flex-col gap-6 px-5 pb-8 sm:gap-8 sm:px-10 sm:pb-10 lg:px-16 lg:pb-16">{children}</div>
      ) : null}
    </div>
  );
}

function PilihanCard({ pilihan, label }: { pilihan: PilihanCardData; label: string }) {
  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      <span className="text-lg font-medium tracking-[-0.02em] text-black sm:text-xl lg:text-2xl">{label}</span>
      <div className="flex w-full flex-col gap-5 rounded-[20px] border border-[#CAC9C9] bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-8 sm:py-5">
        <div className="flex flex-col gap-2 sm:gap-3">
          <p className="text-lg font-medium tracking-[-0.02em] text-black sm:text-xl lg:text-2xl">
            {pilihan.jenjang} {pilihan.namaJurusan}
          </p>
          <p className="text-xl font-semibold tracking-[-0.02em] text-[#081EEA] sm:text-2xl">
            {pilihan.namaUniversitas}
          </p>
        </div>
        <div className="flex gap-6 sm:gap-10 lg:gap-16">
          <div className="flex flex-col items-center gap-2 sm:gap-4">
            <p className="text-sm text-[#7E7C7C] sm:text-lg lg:text-xl">Keketatan</p>
            <p className={`text-center text-lg font-semibold tracking-[-0.02em] sm:text-2xl ${labelColorClass(pilihan.keketatanLabel)}`}>
              {formatNilai(pilihan.keketatanScore)}% - {pilihan.keketatanLabel}
            </p>
          </div>
          <div className="flex flex-col items-center gap-2 sm:gap-4">
            <p className="text-sm text-[#7E7C7C] sm:text-lg lg:text-xl">Peluang</p>
            <p className={`text-center text-lg font-semibold tracking-[-0.02em] sm:text-2xl ${labelColorClass(pilihan.peluangLabel)}`}>
              {formatNilai(pilihan.peluangScore)} - {pilihan.peluangLabel}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AssessmentHasilAccordions({ data }: { data: AssessmentHasilData }) {
  const [openSections, setOpenSections] = useState({
    nilaiAkhir: true,
    hasilPrediksi: true,
    rekomendasiJurusan: false,
    rekomendasiKelas: false,
    rekomendasiTryout: false,
    note: false,
  });

  function toggle(key: keyof typeof openSections) {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <div className="flex flex-col gap-6 sm:gap-10">
      <AccordionSection
        title="Nilai Akhir"
        subtitle="Nilai rata-rata rapotmu + Prestasi"
        open={openSections.nilaiAkhir}
        onToggle={() => toggle("nilaiAkhir")}
      >
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3 sm:gap-8">
          <div className="flex flex-col gap-2">
            <p className="text-base text-[#7E7C7C] sm:text-xl">Nilai Rata-Rata Raportmu</p>
            <p className="text-2xl font-semibold tracking-[-0.02em] text-black sm:text-[28px]">
              {formatNilai(data.rataRataRapor)}
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-base text-[#7E7C7C] sm:text-xl">Nilai Prestasimu</p>
            <p className="text-2xl font-semibold tracking-[-0.02em] text-black sm:text-[28px]">
              {formatNilai(data.nilaiPrestasi)}
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-base text-[#7E7C7C] sm:text-xl">Nilai Akhir</p>
            <p className="text-2xl font-semibold tracking-[-0.02em] text-[#081EEA] sm:text-[28px]">
              {formatNilai(data.nilaiAkhir)}
              {data.nilaiAkhirLabel ? (
                <span className="ml-2 font-normal">({data.nilaiAkhirLabel})</span>
              ) : null}
            </p>
          </div>
        </div>
      </AccordionSection>

      <AccordionSection title="Hasil Prediksi" open={openSections.hasilPrediksi} onToggle={() => toggle("hasilPrediksi")}>
        {data.hasilPrediksi.map((pilihan) => (
          <PilihanCard key={pilihan.urutanPilihan} pilihan={pilihan} label={`Pilihan ${pilihan.urutanPilihan}`} />
        ))}
      </AccordionSection>

      <AccordionSection
        title="Rekomendasi Jurusan"
        open={openSections.rekomendasiJurusan}
        onToggle={() => toggle("rekomendasiJurusan")}
      >
        {data.rekomendasiJurusan.length > 0 ? (
          data.rekomendasiJurusan.map((pilihan) => (
            <PilihanCard key={pilihan.urutanPilihan} pilihan={pilihan} label={`Pilihan ${pilihan.urutanPilihan}`} />
          ))
        ) : (
          <p className="text-base text-[#7E7C7C] sm:text-xl">Belum ada rekomendasi jurusan alternatif saat ini.</p>
        )}
      </AccordionSection>

      <AccordionSection
        title="Rekomendasi Kelas"
        open={openSections.rekomendasiKelas}
        onToggle={() => toggle("rekomendasiKelas")}
      >
        {!data.isLoggedInOwner ? (
          <p className="text-base text-[#7E7C7C] sm:text-xl">
            Login untuk lihat rekomendasi kelas personal berdasarkan mapel tersulitmu.
          </p>
        ) : data.kelasRekomendasi.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 sm:gap-6">
            {data.kelasRekomendasi.map((kelas) => (
              <div
                key={kelas.id}
                className="flex flex-col gap-4 rounded-[20px] border border-[#CAC9C9] bg-white px-5 py-4 sm:px-6 sm:py-5"
              >
                <p className="text-lg font-medium tracking-[-0.02em] text-black sm:text-xl">{kelas.nama}</p>
                <p className="text-xl font-semibold tracking-[-0.02em] text-[#081EEA] sm:text-2xl">
                  {formatRupiah(kelas.harga)}
                </p>
                <Link href={`/kelas/${kelas.id}`} className="self-start">
                  <Button size="sm">Lihat Kelas</Button>
                </Link>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-base text-[#7E7C7C] sm:text-xl">
            Belum ada rekomendasi kelas yang cocok dengan mapel tersulitmu saat ini.
          </p>
        )}
      </AccordionSection>

      <AccordionSection
        title="Rekomendasi Paket Tryout"
        open={openSections.rekomendasiTryout}
        onToggle={() => toggle("rekomendasiTryout")}
      >
        {data.tryoutRekomendasi.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 sm:gap-6">
            {data.tryoutRekomendasi.map((tryout) => (
              <div
                key={tryout.id}
                className="flex flex-col gap-3 rounded-[20px] border border-[#CAC9C9] bg-white px-5 py-4 sm:px-6 sm:py-5"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-lg font-medium tracking-[-0.02em] text-black sm:text-xl">{tryout.nama}</p>
                  <span
                    className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium sm:text-sm ${
                      tryout.tipeAkses === "premium"
                        ? "bg-[#FFF5BA] text-[#988101]"
                        : "bg-[#E7FBE5] text-[#0CBA00]"
                    }`}
                  >
                    {tryout.tipeAkses === "premium" ? "Premium" : "Free"}
                  </span>
                </div>
                <p className="text-sm text-[#7E7C7C] sm:text-base">{tryout.alasan}</p>
                <Link href={`/tryout/${tryout.id}`} className="self-start">
                  <Button size="sm">{tryout.tipeAkses === "premium" ? "Lihat Paket" : "Mulai Tryout Gratis"}</Button>
                </Link>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-base text-[#7E7C7C] sm:text-xl">Belum ada paket tryout yang relevan saat ini.</p>
        )}
      </AccordionSection>

      <AccordionSection title="Note" open={openSections.note} onToggle={() => toggle("note")}>
        <p className="text-base text-[#7E7C7C] sm:text-xl">Catatan dari mentor akan muncul di sini</p>
      </AccordionSection>

      {data.showDaftarCta ? (
        <div className="flex w-full flex-col items-center gap-5 rounded-[24px] border border-[#E3E3E3] bg-[#F9FAFF] px-5 py-6 sm:flex-row sm:justify-between sm:gap-6 sm:rounded-[32px] sm:px-8">
          <div className="flex items-center gap-4">
            <Mascot variant="Happy1" alt="" className="h-14 w-auto shrink-0 sm:h-16" />
            <p className="text-base leading-[1.5] tracking-[-0.02em] text-black sm:text-xl">
              Suka sama hasilnya? Daftar sekarang biar hasil ini tersimpan dan dapat rekomendasi kelas + tryout
              yang lebih personal
            </p>
          </div>
          <Link href="/daftar" className="w-full shrink-0 sm:w-auto">
            <Button size="lg" className="w-full">
              Daftar Sekarang
            </Button>
          </Link>
        </div>
      ) : null}
    </div>
  );
}
