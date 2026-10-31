"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import Button from "@/components/ui/Button";
import Mascot from "@/components/ui/Mascot";
import LencanaSegera from "@/components/ui/LencanaSegera";
import LeadCaptureCard from "./LeadCaptureCard";

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
  /** Kalimat pendek: alasan saran, atau penjelasan jujur kenapa kosong. */
  keterangan: string;
}

export interface KelasRekomendasiData {
  id: string;
  nama: string;
  /** Harga setelah diskon kelas (kalau ada). */
  harga: number;
  /** Detail publik, atau halaman kelas siswa kalau sudah dimiliki. */
  href: string;
  labelAksi: string;
  /** "Sudah kamu ikuti" / "Menunggu pembayaran", null = belum punya. */
  status: string | null;
}

export interface AssessmentHasilData {
  rataRataRapor: number | null;
  nilaiPrestasi: number | null;
  nilaiAkhir: number | null;
  nilaiAkhirLabel: string | null;
  /** Sudah disaring (rapikanCatatan) dan sudah diganti teks cadangan kalau kosong. */
  noteAi: string;
  hasilPrediksi: PilihanCardData[];
  rekomendasiJurusan: RekomendasiJurusanGroup[];
  kelasRekomendasi: KelasRekomendasiData[];
  /** true = dipilih dari mapel tersulit; false = kelas umum persiapan PTN. */
  kelasPersonal: boolean;
  tryoutAksi: { href: string; label: string; segera?: boolean };
  /** Pengunjung halaman belum login. */
  isGuest: boolean;
  showDaftarCta: boolean;
  /** Dipakai CTA Daftar (pending_assessment) & Lead Capture. */
  assessmentId: string;
  /** PRD 7.4.6: tamu, atau user login yang belum punya no_wa. */
  showLeadCapture: boolean;
  leadSudahTerkirim: boolean;
}

// Catatan kecil pelengkap di bawah tiap angka Peluang — TERPISAH dari
// disclaimer besar di atas halaman (BR-4, tidak diganti/dihapus). Diringkas
// dari draf awal supaya muat rapi di kolom sempit (card Keketatan|Peluang
// berdampingan) tanpa mendominasi visual, tapi tetap menyampaikan dua inti:
// bukan ramalan pasti + tetap butuh usaha sendiri.
const PELUANG_MICRO_NOTE =
  "Perkiraan kasar dari nilaimu dan keketatan prodi. Bukan ramalan pasti, lolos atau nggak tetap tergantung usahamu.";

// Keterangan di bawah angka Keketatan — menegaskan metrik ini publik (sama
// untuk semua pendaftar), beda dari Peluang yang personal.
const KEKETATAN_KETERANGAN = "Seberapa ramai peminat prodi ini, sama untuk semua pendaftar.";

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

function PilihanCard({ pilihan, label, keterangan }: { pilihan: PilihanCardData; label: string; keterangan?: string }) {
  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      <div className="flex flex-col gap-1">
        <span className="text-base font-medium tracking-[-0.02em] text-black sm:text-lg">{label}</span>
        {keterangan ? <p className="text-sm text-[#7E7C7C] sm:text-base">{keterangan}</p> : null}
      </div>
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
            <p className="max-w-[8.5rem] text-center text-[10px] leading-snug text-[#7E7C7C] sm:max-w-[11rem] sm:text-[11px]">
              {KEKETATAN_KETERANGAN}
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
          <p className="max-w-[8.5rem] text-center text-[10px] leading-snug text-[#7E7C7C] sm:max-w-[11rem] sm:text-[11px]">
            {KEKETATAN_KETERANGAN}
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
  // Default TERBUKA semua (revisi Oktober 2026) — hasil assessment adalah
  // tujuan utama halaman ini, jadi tidak ada yang perlu disembunyikan di balik
  // klik. User tetap bisa menutup tiap section manual.
  const [openSections, setOpenSections] = useState({
    rekomendasiJurusan: true,
    rekomendasiKelas: true,
    rekomendasiTryout: true,
    note: true,
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
                label={`Saran untuk Pilihan ${group.pilihanAsalUrutan}`}
                keterangan={group.keterangan}
              />
            ) : (
              <div key={group.pilihanAsalUrutan} className="flex flex-col gap-3 sm:gap-4">
                <span className="text-base font-medium tracking-[-0.02em] text-black sm:text-lg">
                  Saran untuk Pilihan {group.pilihanAsalUrutan}
                </span>
                <p className="text-base text-[#7E7C7C] sm:text-lg">{group.keterangan}</p>
              </div>
            ),
          )
        ) : (
          <p className="text-base text-[#7E7C7C] sm:text-lg">Belum ada saran untuk saat ini.</p>
        )}
      </AccordionSection>

      <AccordionSection
        title="Rekomendasi Kelas"
        open={openSections.rekomendasiKelas}
        onToggle={() => toggle("rekomendasiKelas")}
      >
        {data.kelasRekomendasi.length > 0 ? (
          <>
            <p className="text-sm text-[#7E7C7C] sm:text-base">
              {data.kelasPersonal
                ? "Dipilih dari mapel yang menurutmu paling sulit."
                : data.isGuest
                  ? "Kelas persiapan masuk PTN yang bisa kamu lihat dulu. Masuk untuk dapat saran yang lebih pas buatmu."
                  : "Kelas persiapan masuk PTN yang bisa kamu lihat dulu."}
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 sm:gap-6">
              {data.kelasRekomendasi.map((kelas) => (
                <div
                  key={kelas.id}
                  className="flex flex-col gap-4 rounded-[20px] border border-[#CAC9C9] bg-white px-5 py-4 sm:px-6 sm:py-5"
                >
                  <div className="flex flex-col gap-2">
                    {kelas.status ? (
                      <span
                        className={`w-fit rounded-full px-3 py-1 text-xs font-medium sm:text-sm ${
                          kelas.status === "Sudah kamu ikuti" ? "bg-[#E7FBE5] text-[#0CBA00]" : "bg-[#FFF5BA] text-[#988101]"
                        }`}
                      >
                        {kelas.status}
                      </span>
                    ) : null}
                    <p className="text-lg font-medium tracking-[-0.02em] text-black sm:text-xl">{kelas.nama}</p>
                  </div>
                  {kelas.status === "Sudah kamu ikuti" ? null : (
                    <p className="text-lg font-semibold tracking-[-0.02em] text-[#081EEA] sm:text-xl">
                      {formatRupiah(kelas.harga)}
                    </p>
                  )}
                  <Link href={kelas.href} className="self-start">
                    <Button size="sm">{kelas.labelAksi}</Button>
                  </Link>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="text-base text-[#7E7C7C] sm:text-lg">Belum ada kelas yang bisa disarankan saat ini.</p>
        )}
      </AccordionSection>

      <AccordionSection
        title="Rekomendasi Try Out"
        open={openSections.rekomendasiTryout}
        onToggle={() => toggle("rekomendasiTryout")}
      >
        <div className="flex flex-col gap-3 rounded-[20px] border border-[#CAC9C9] bg-white px-5 py-4 sm:max-w-xl sm:px-6 sm:py-5">
          <p className="text-lg font-medium tracking-[-0.02em] text-black sm:text-xl">Try Out SNBT dan TKA</p>
          <p className="text-sm text-[#7E7C7C] sm:text-base">
            Simulasi ujian biar kamu tahu posisimu sekarang dan bagian mana yang perlu dikejar.
            {data.isGuest && !data.tryoutAksi.segera ? " Masuk dulu, nanti kamu langsung diarahkan ke halaman Try Out." : ""}
          </p>
          {data.tryoutAksi.segera ? <LencanaSegera /> : null}
          <Link href={data.tryoutAksi.href} className="self-start">
            <Button size="sm">{data.tryoutAksi.label}</Button>
          </Link>
        </div>
        {/* Latihan soal untuk siswa belum ada (Studio Soal masih sisi mentor),
            jadi cukup info teks tanpa tautan atau tombol. */}
        <p className="text-sm text-[#7E7C7C] sm:text-base">Latihan soal sedang kami siapkan.</p>
      </AccordionSection>

      <AccordionSection title="Note" open={openSections.note} onToggle={() => toggle("note")}>
        <div className="flex flex-col gap-2">
          <p className="text-base leading-[1.5] tracking-[-0.02em] text-black sm:text-xl">
            {data.noteAi}
          </p>
          <p className="text-xs text-[#7E7C7C] sm:text-sm">Catatan dibuat otomatis</p>
        </div>
      </AccordionSection>

      {data.showLeadCapture ? (
        <LeadCaptureCard assessmentId={data.assessmentId} sudahTerkirim={data.leadSudahTerkirim} />
      ) : null}

      {data.showDaftarCta ? (
        <div className="flex w-full flex-col items-center gap-5 rounded-[24px] border border-[#E3E3E3] bg-[#F9FAFF] px-5 py-6 sm:flex-row sm:justify-between sm:gap-6 sm:rounded-[32px] sm:px-8">
          <div className="flex items-center gap-4">
            <Mascot variant="Happy1" alt="" className="h-14 w-auto shrink-0 sm:h-16" />
            <p className="text-base leading-[1.5] tracking-[-0.02em] text-black sm:text-xl">
              Suka sama hasilnya? Daftar sekarang biar hasil ini tersimpan dan dapat rekomendasi kelas + tryout
              yang lebih personal
            </p>
          </div>
          {/* pending_assessment: hasil anonim ke-1/ke-2 ikut tertaut ke akun baru (PRD 7.4.1b). */}
          <Link
            href={`/daftar?pending_assessment=${encodeURIComponent(data.assessmentId)}`}
            className="w-full shrink-0 sm:w-auto"
          >
            <Button size="lg" className="w-full">
              Daftar Sekarang
            </Button>
          </Link>
        </div>
      ) : null}
    </div>
  );
}
