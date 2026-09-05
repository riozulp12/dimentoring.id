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
  kuotaTahunBerjalan: number;
  jumlahPeminatTahunLalu: number;
}

/** Satu grup per pilihan siswa (1 atau 2) — `rekomendasi: null` berarti
 * pilihan itu tidak dapat kandidat serumpun yang lebih longgar (bukan berarti
 * seluruh accordion kosong; grup pilihan lain bisa tetap punya rekomendasi). */
export interface RekomendasiJurusanGroup {
  pilihanAsalUrutan: number;
  rekomendasi: PilihanCardData | null;
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
  noteAi: string | null;
  hasilPrediksi: PilihanCardData[];
  rekomendasiJurusan: RekomendasiJurusanGroup[];
  isLoggedInOwner: boolean;
  kelasRekomendasi: KelasRekomendasiData[];
  tryoutRekomendasi: TryoutRekomendasiData[];
  showDaftarCta: boolean;
}

// Sama dengan FALLBACK_NOTE di lib/ai/generateNote.ts — dipakai kalau note_ai
// masih NULL (mis. data lama sebelum BR-30 aktif, atau update sempat gagal).
const NOTE_FALLBACK =
  "Angka-angka di atas adalah gambaran, bukan keputusan akhir — banyak siswa yang keketatannya terlihat berat tetap berhasil lolos karena persiapan yang tepat, dan sebaliknya. Yang paling penting sekarang bukan cuma melihat hasilnya, tapi memakainya sebagai peta: kalau ada subtes yang masih terasa berat, itu titik yang paling worth dilatih dulu. Coba mulai dari Try Out gratis buat lihat sejauh mana pemahamanmu sekarang, atau ikut kelas bimbingan yang sesuai kebutuhanmu. Perjalanan ke PTN impian itu proses, bukan satu kali tes — dan kamu masih punya waktu buat memperbesar peluang itu.";

// Catatan kecil pelengkap di bawah tiap angka Peluang — TERPISAH dari
// disclaimer besar di atas halaman (BR-4, tidak diganti/dihapus). Diringkas
// dari draf awal supaya muat rapi di kolom sempit (card Keketatan|Peluang
// berdampingan) tanpa mendominasi visual, tapi tetap menyampaikan dua inti:
// bukan ramalan pasti + tetap butuh usaha sendiri.
const PELUANG_MICRO_NOTE =
  "Bukan ramalan pasti — cuma gambaran kasar. Lolos-nggaknya tetap tergantung usahamu sendiri.";

function formatNilai(value: number | null): string {
  if (value === null) return "-";
  return value.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatRupiah(value: number): string {
  return value === 0 ? "Gratis" : `Rp${value.toLocaleString("id-ID")}`;
}

function formatCount(value: number): string {
  return value.toLocaleString("id-ID");
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
        <span className="min-w-0 flex-1 text-lg font-semibold leading-[1.5] tracking-[-0.02em] text-[#081EEA] sm:text-xl">
          {title}
          {subtitle ? (
            <span className="ml-2 text-sm font-normal text-[#7E7C7C] sm:text-base">{subtitle}</span>
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
      <span className="text-base font-medium tracking-[-0.02em] text-black sm:text-lg">{label}</span>
      <div className="flex w-full flex-col gap-5 rounded-[20px] border border-[#CAC9C9] bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-8 sm:py-5">
        <div className="flex flex-col gap-2 sm:gap-3">
          <p className="text-base font-medium tracking-[-0.02em] text-black sm:text-lg">
            {pilihan.jenjang} {pilihan.namaJurusan}
          </p>
          <p className="text-lg font-semibold tracking-[-0.02em] text-[#081EEA] sm:text-xl">
            {pilihan.namaUniversitas}
          </p>
        </div>
        <div className="flex items-start gap-6 sm:gap-10 lg:gap-16">
          <div className="flex flex-col items-center gap-2 sm:gap-4">
            <p className="text-sm text-[#7E7C7C] sm:text-base">Keketatan</p>
            <p className={`text-center text-base font-semibold tracking-[-0.02em] sm:text-lg ${labelColorClass(pilihan.keketatanLabel)}`}>
              {formatNilai(pilihan.keketatanScore)}% - {pilihan.keketatanLabel}
            </p>
          </div>
          <div className="flex flex-col items-center gap-2 sm:gap-4">
            <p className="text-sm text-[#7E7C7C] sm:text-base">Peluang</p>
            <p className={`text-center text-base font-semibold tracking-[-0.02em] sm:text-lg ${labelColorClass(pilihan.peluangLabel)}`}>
              {formatNilai(pilihan.peluangScore)}% - {pilihan.peluangLabel}
            </p>
            <p className="max-w-[8.5rem] text-center text-[10px] leading-snug text-[#7E7C7C] sm:max-w-[11rem] sm:text-[11px]">
              {PELUANG_MICRO_NOTE}
            </p>
          </div>
        </div>
      </div>
      <div className="flex gap-6 text-sm text-[#7E7C7C] sm:gap-10 sm:text-base">
        <p>
          Kuota Tahun Berjalan: <span className="font-medium text-black">{formatCount(pilihan.kuotaTahunBerjalan)}</span>
        </p>
        <p>
          Peminat Tahun Lalu: <span className="font-medium text-black">{formatCount(pilihan.jumlahPeminatTahunLalu)}</span>
        </p>
      </div>
    </div>
  );
}

function MainPilihanCard({ pilihan, label }: { pilihan: PilihanCardData; label: string }) {
  return (
    <div className="relative flex flex-col items-center gap-3 overflow-hidden rounded-[20px] border border-[#CAC9C9] bg-white py-6 pl-8 pr-6 sm:gap-4 sm:py-8 sm:pl-10 sm:pr-8">
      <div className="absolute inset-y-0 left-0 w-[6px] rounded-l-[20px] bg-[#081EEA]" />
      <span className="text-lg font-semibold tracking-[-0.02em] text-black sm:text-xl">{label}</span>
      <p className="text-center text-base tracking-[-0.02em] text-black sm:text-lg">
        {pilihan.jenjang} {pilihan.namaJurusan}
      </p>
      <p className="text-center text-xl font-semibold tracking-[-0.02em] text-[#081EEA] sm:text-2xl">
        {pilihan.namaUniversitas}
      </p>
      <div className="mt-2 flex w-full items-start justify-center gap-10 sm:gap-16">
        <div className="flex flex-col items-center gap-1 sm:gap-2">
          <p className="text-sm text-[#7E7C7C] sm:text-base">Keketatan</p>
          <p
            className={`text-center text-base font-semibold tracking-[-0.02em] sm:text-lg ${labelColorClass(pilihan.keketatanLabel)}`}
          >
            {formatNilai(pilihan.keketatanScore)}% - {pilihan.keketatanLabel}
          </p>
        </div>
        <div className="flex flex-col items-center gap-1 sm:gap-2">
          <p className="text-sm text-[#7E7C7C] sm:text-base">Peluang</p>
          <p
            className={`text-center text-base font-semibold tracking-[-0.02em] sm:text-lg ${labelColorClass(pilihan.peluangLabel)}`}
          >
            {formatNilai(pilihan.peluangScore)}% - {pilihan.peluangLabel}
          </p>
          <p className="max-w-[8.5rem] text-center text-[10px] leading-snug text-[#7E7C7C] sm:max-w-[11rem] sm:text-[11px]">
            {PELUANG_MICRO_NOTE}
          </p>
        </div>
      </div>
      <div className="mt-1 flex w-full items-start justify-center gap-6 text-center text-sm text-[#7E7C7C] sm:gap-10">
        <p>
          Kuota Tahun Berjalan: <span className="font-medium text-black">{formatCount(pilihan.kuotaTahunBerjalan)}</span>
        </p>
        <p>
          Peminat Tahun Lalu: <span className="font-medium text-black">{formatCount(pilihan.jumlahPeminatTahunLalu)}</span>
        </p>
      </div>
    </div>
  );
}

function MainResultCard({ data }: { data: AssessmentHasilData }) {
  const columns = data.hasilPrediksi.length;

  return (
    <div className="relative w-full rounded-[32px] border-[0.6px] border-[#E3E3E3] bg-white px-5 py-8 shadow-[1px_2px_4px_rgba(0,0,0,0.1)] sm:px-10 sm:py-10 lg:px-16">
      <div className="flex flex-col items-center gap-6 text-center sm:gap-8">
        <div className="flex flex-col items-center gap-2">
          <p className="text-sm font-medium text-[#7E7C7C] sm:text-lg">
            Berdasarkan perhitungan, berikut hasil untuk nilai kamu
          </p>
          <div className="flex flex-col items-center gap-1">
            <p className="text-base font-medium text-black sm:text-xl">Nilai Akhir</p>
            <p className="text-3xl font-semibold tracking-[-0.02em] text-[#081EEA] sm:text-4xl">
              {formatNilai(data.nilaiAkhir)}
              {data.nilaiAkhirLabel ? (
                <span className="ml-2 font-normal">({data.nilaiAkhirLabel})</span>
              ) : null}
            </p>
          </div>
        </div>

        <div
          className={`grid w-full grid-cols-1 gap-6 sm:gap-8 ${
            columns === 2 ? "sm:grid-cols-2" : "sm:max-w-xl"
          }`}
        >
          {data.hasilPrediksi.map((pilihan) => (
            <MainPilihanCard
              key={pilihan.urutanPilihan}
              pilihan={pilihan}
              label={`Pilihan ${pilihan.urutanPilihan}`}
            />
          ))}
        </div>
      </div>

      <Mascot
        variant="Guidance"
        alt=""
        className="pointer-events-none absolute -right-3 -bottom-4 hidden h-28 w-auto select-none sm:block sm:h-32 lg:h-36"
      />
    </div>
  );
}

export default function AssessmentHasilAccordions({ data }: { data: AssessmentHasilData }) {
  const [openSections, setOpenSections] = useState({
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
      <MainResultCard data={data} />

      <AccordionSection
        title="Rekomendasi Jurusan"
        open={openSections.rekomendasiJurusan}
        onToggle={() => toggle("rekomendasiJurusan")}
      >
        {data.rekomendasiJurusan.length > 0 ? (
          data.rekomendasiJurusan.map((group) =>
            group.rekomendasi ? (
              <PilihanCard
                key={group.pilihanAsalUrutan}
                pilihan={group.rekomendasi}
                label={`Rekomendasi untuk Pilihan ${group.pilihanAsalUrutan}`}
              />
            ) : (
              <div key={group.pilihanAsalUrutan} className="flex flex-col gap-3 sm:gap-4">
                <span className="text-base font-medium tracking-[-0.02em] text-black sm:text-lg">
                  Rekomendasi untuk Pilihan {group.pilihanAsalUrutan}
                </span>
                <p className="text-base text-[#7E7C7C] sm:text-lg">Belum ada rekomendasi tersedia untuk pilihan ini.</p>
              </div>
            ),
          )
        ) : (
          <p className="text-base text-[#7E7C7C] sm:text-lg">Belum ada rekomendasi tersedia untuk saat ini</p>
        )}
      </AccordionSection>

      <AccordionSection
        title="Rekomendasi Kelas"
        open={openSections.rekomendasiKelas}
        onToggle={() => toggle("rekomendasiKelas")}
      >
        {!data.isLoggedInOwner ? (
          <p className="text-base text-[#7E7C7C] sm:text-lg">
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
                <p className="text-lg font-semibold tracking-[-0.02em] text-[#081EEA] sm:text-xl">
                  {formatRupiah(kelas.harga)}
                </p>
                <Link href={`/kelas/${kelas.id}`} className="self-start">
                  <Button size="sm">Lihat Kelas</Button>
                </Link>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-base text-[#7E7C7C] sm:text-lg">
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
          <p className="text-base text-[#7E7C7C] sm:text-lg">Belum ada paket tryout yang relevan saat ini.</p>
        )}
      </AccordionSection>

      <AccordionSection title="Note" open={openSections.note} onToggle={() => toggle("note")}>
        <div className="flex flex-col gap-2">
          <p className="text-base leading-[1.5] tracking-[-0.02em] text-black sm:text-xl">
            {data.noteAi ?? NOTE_FALLBACK}
          </p>
          <p className="text-xs text-[#7E7C7C] sm:text-sm">Catatan dibuat otomatis</p>
        </div>
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
