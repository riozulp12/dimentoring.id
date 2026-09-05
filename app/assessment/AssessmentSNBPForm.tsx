"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import Button from "@/components/ui/Button";
import InputField from "@/components/ui/InputField";
import Mascot from "@/components/ui/Mascot";
import MaskotLoading from "@/components/ui/MaskotLoading";
import {
  JUARA_BERAPA_OPTIONS,
  TINGKAT_KEJUARAAN_OPTIONS,
  type JuaraBerapa,
  type TingkatKejuaraan,
} from "@/lib/assessment/calculatePeluang";

export interface PtnJurusanOption {
  id: string;
  universitas: string;
  jurusan: string;
  jenjang: string;
}

// Ikon trash — belum ada aset serupa di public/icons, jadi dibuat mengikuti
// pola ikon inline SVG "currentColor" yang sudah dipakai project (lihat
// components/dashboard/sidebarIcons.tsx) supaya warnanya bisa ikut warna teks
// tombol (merah destructive), bukan ikon fixed-color kayak SVG lain di /icons.
function TrashIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <path
        d="M3 6h18M8 6V4.5A1.5 1.5 0 0 1 9.5 3h5A1.5 1.5 0 0 1 16 4.5V6m2 0-.7 12.6A2 2 0 0 1 15.3 20H8.7a2 2 0 0 1-2-1.9L6 6m4 4.5v6m4-6v6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type AssessmentTab = "snbp" | "snbt" | "mandiri";

const TABS: { key: AssessmentTab; label: string }[] = [
  { key: "snbp", label: "SNBP" },
  { key: "snbt", label: "SNBT" },
  { key: "mandiri", label: "Jalur Mandiri" },
];

// PLACEHOLDER taksonomi Jenis Prestasi — belum ada daftar resmi di PRD/skema
// (jenisPrestasi disimpan sebagai teks bebas), perlu dikonfirmasi tim akademik
// sekalian validasi mapping FR-3.7.
const JENIS_PRESTASI_OPTIONS = [
  "Akademik (OSN/KSN/Olimpiade)",
  "Non-Akademik (Olahraga/Seni)",
  "Organisasi/Kepemimpinan",
  "Lainnya",
];

const SEMESTER_FIELDS = [
  { key: "semester1", label: "Semester 1" },
  { key: "semester2", label: "Semester 2" },
  { key: "semester3", label: "Semester 3" },
  { key: "semester4", label: "Semester 4" },
  { key: "semester5", label: "Semester 5" },
] as const;

type SemesterKey = (typeof SEMESTER_FIELDS)[number]["key"];

interface PilihanState {
  universitas: string;
  ptnJurusanId: string;
}

const EMPTY_PILIHAN: PilihanState = { universitas: "", ptnJurusanId: "" };

/** Nilai Raport wajib number only — buang semua karakter selain digit & satu titik desimal. */
function sanitizeNilaiInput(value: string) {
  const cleaned = value.replace(/[^0-9.]/g, "");
  const firstDotIndex = cleaned.indexOf(".");
  if (firstDotIndex === -1) return cleaned;
  return cleaned.slice(0, firstDotIndex + 1) + cleaned.slice(firstDotIndex + 1).replace(/\./g, "");
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
            <span className="ml-2 text-sm font-normal text-black sm:text-base">{subtitle}</span>
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

export default function AssessmentSNBPForm({
  ptnJurusanOptions,
  tahunData,
}: {
  ptnJurusanOptions: PtnJurusanOption[];
  tahunData: number | null;
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<AssessmentTab>("snbp");

  const [openSections, setOpenSections] = useState({ raport: true, prestasi: true, pilihan: true });
  function toggleSection(key: keyof typeof openSections) {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  const [nilaiRapor, setNilaiRapor] = useState<Record<SemesterKey, string>>({
    semester1: "",
    semester2: "",
    semester3: "",
    semester4: "",
    semester5: "",
  });

  const [jenisPrestasi, setJenisPrestasi] = useState("");
  const [tingkatKejuaraan, setTingkatKejuaraan] = useState<TingkatKejuaraan | "">("");
  const [juaraBerapa, setJuaraBerapa] = useState<JuaraBerapa | "">("");

  const [pilihan1, setPilihan1] = useState<PilihanState>(EMPTY_PILIHAN);
  const [showPilihan2, setShowPilihan2] = useState(false);
  const [pilihan2, setPilihan2] = useState<PilihanState>(EMPTY_PILIHAN);

  const [attempted, setAttempted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const universitasOptions = useMemo(() => {
    const unique = Array.from(new Set(ptnJurusanOptions.map((o) => o.universitas)));
    return unique.sort((a, b) => a.localeCompare(b)).map((nama) => ({ label: nama, value: nama }));
  }, [ptnJurusanOptions]);

  function jurusanOptionsFor(universitas: string) {
    return ptnJurusanOptions
      .filter((o) => o.universitas === universitas)
      .map((o) => ({ label: `${o.jenjang} ${o.jurusan}`, value: o.id }));
  }

  const prestasiFilledCount = [jenisPrestasi, tingkatKejuaraan, juaraBerapa].filter(Boolean).length;
  const prestasiPartiallyFilled = prestasiFilledCount > 0 && prestasiFilledCount < 3;

  const semesterValid = SEMESTER_FIELDS.every(({ key }) => {
    const raw = nilaiRapor[key];
    if (raw.trim() === "") return false;
    const value = Number(raw);
    return !Number.isNaN(value) && value >= 0 && value <= 100;
  });

  const pilihan1Valid = pilihan1.ptnJurusanId !== "";
  const pilihan2Valid =
    !showPilihan2 || (pilihan2.ptnJurusanId !== "" && pilihan2.ptnJurusanId !== pilihan1.ptnJurusanId);

  const formValid = semesterValid && !prestasiPartiallyFilled && pilihan1Valid && pilihan2Valid;

  async function handleSubmit() {
    setAttempted(true);
    setSubmitError(null);
    if (!formValid) return;

    setIsSubmitting(true);
    try {
      const payload = {
        nilaiRapor: {
          semester1: Number(nilaiRapor.semester1),
          semester2: Number(nilaiRapor.semester2),
          semester3: Number(nilaiRapor.semester3),
          semester4: Number(nilaiRapor.semester4),
          semester5: Number(nilaiRapor.semester5),
        },
        prestasi: prestasiFilledCount === 3 ? { jenisPrestasi, tingkatKejuaraan, juaraBerapa } : null,
        pilihan: showPilihan2
          ? [{ ptnJurusanId: pilihan1.ptnJurusanId }, { ptnJurusanId: pilihan2.ptnJurusanId }]
          : [{ ptnJurusanId: pilihan1.ptnJurusanId }],
      };

      const response = await fetch("/api/assessment/snbp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await response.json();

      if (!response.ok || !json.success) {
        setSubmitError(json.error ?? "Gagal menyimpan Assessment. Coba lagi nanti.");
        setIsSubmitting(false);
        return;
      }

      // BR-29: server yang memutuskan tujuan akhir — hasil langsung (login,
      // atau anonim submit ke-1/ke-2), atau digembok ke /daftar (anonim submit
      // ke-3+) — jangan diasumsikan selalu ke halaman hasil di sisi client.
      router.push(json.redirectTo ?? `/assessment/hasil/${json.assessmentId}`);
    } catch {
      setSubmitError("Gagal terhubung ke server. Periksa koneksi internet kamu.");
      setIsSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-[1760px] flex-col gap-8 px-5 py-8 sm:gap-10 sm:px-8 sm:py-12 md:px-12 lg:gap-12 lg:px-20 lg:py-16 min-[1440px]:gap-14">
      <header className="flex flex-col gap-4 sm:gap-5">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold leading-[1.5] tracking-[-0.02em] text-[#081EEA] sm:text-3xl">
            Assessment Prediksi Masuk PTN
          </h1>
          <p className="text-base text-[#7E7C7C] sm:text-lg">
            Pilih jalur yang ingin kamu cek peluangnya
          </p>
        </div>

        <div className="flex w-full flex-wrap items-center gap-3 sm:gap-6">
          {TABS.map((tab) => {
            const isActive = tab.key === activeTab;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                aria-pressed={isActive}
                className={[
                  "rounded-[12px] px-5 py-2 text-sm font-medium tracking-[-0.02em] drop-shadow-[2px_2px_0px_black] transition-colors sm:px-8 sm:py-3 sm:text-base",
                  isActive ? "bg-[#081EEA] text-white" : "border border-[#7E7C7C] bg-white text-[#7E7C7C]",
                ].join(" ")}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="flex w-full items-center gap-4 rounded-[24px] border border-[#FDD803] bg-[#FFF5BA] px-5 py-4 sm:gap-6 sm:rounded-[32px] sm:px-8">
          <p className="min-w-0 flex-1 text-sm leading-[1.5] tracking-[-0.02em] text-[#988101] sm:text-base">
            <span className="font-semibold">Disclaimer: </span>
            Hasil ini adalah estimasi berbasis data keketatan historis (tahun data: {tahunData ?? "-"}), bukan
            jaminan kelulusan. Kebijakan kampus & jumlah peminat tahun berjalan bisa berubah.
          </p>
          <Mascot variant="Guidance" alt="" className="hidden h-14 w-auto shrink-0 sm:block lg:h-16" />
        </div>
      </header>

      {activeTab !== "snbp" ? (
        <section className="flex min-h-[240px] w-full flex-col items-center justify-center gap-4 rounded-[32px] border-[0.6px] border-[#E3E3E3] bg-white px-5 py-12 text-center shadow-[1px_2px_4px_rgba(0,0,0,0.1)] sm:min-h-[320px] sm:py-20">
          <Mascot variant="Confuse" alt="" className="h-24 w-auto sm:h-32" />
          <p className="text-lg font-semibold text-[#081EEA] sm:text-xl">Segera Hadir</p>
          <p className="max-w-md text-base text-[#7E7C7C] sm:text-lg">
            Assessment {activeTab === "snbt" ? "SNBT" : "Jalur Mandiri"} masih dalam pengembangan. Coba tab SNBP
            dulu, ya.
          </p>
        </section>
      ) : (
        <section className="flex flex-col gap-6 sm:gap-8">
          <div className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold leading-[1.5] tracking-[-0.02em] text-[#081EEA] sm:text-xl">
              Assesment Prediksi SNBP
            </h2>
            <p className="text-base text-[#7E7C7C] sm:text-lg">Jalur nilai raport dan prestasi</p>
          </div>

          <div className="flex flex-col gap-6 sm:gap-10">
            <AccordionSection
              title="Nilai Raport"
              open={openSections.raport}
              onToggle={() => toggleSection("raport")}
            >
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-x-16 sm:gap-y-8">
                {SEMESTER_FIELDS.map(({ key, label }) => {
                  const raw = nilaiRapor[key];
                  const numeric = Number(raw);
                  const hasError =
                    attempted && (raw.trim() === "" || Number.isNaN(numeric) || numeric < 0 || numeric > 100);
                  return (
                    <div key={key} className="flex flex-col gap-3">
                      <label
                        htmlFor={`nilai-${key}`}
                        className="text-base font-medium tracking-[-0.02em] text-black sm:text-lg"
                      >
                        {label}
                      </label>
                      <InputField
                        id={`nilai-${key}`}
                        type="text"
                        size="md"
                        inputMode="decimal"
                        placeholder={`Nilai ${label}`}
                        value={raw}
                        onChange={(e) =>
                          setNilaiRapor((prev) => ({ ...prev, [key]: sanitizeNilaiInput(e.target.value) }))
                        }
                        status={hasError ? "error" : "default"}
                      />
                    </div>
                  );
                })}
              </div>
              {attempted && !semesterValid ? (
                <p className="text-base text-[#E70A0A]">Isi Nilai Semester 1-5 dengan angka 0-100.</p>
              ) : null}
            </AccordionSection>

            <AccordionSection
              title="Prestasi"
              subtitle="(Opsional)"
              open={openSections.prestasi}
              onToggle={() => toggleSection("prestasi")}
            >
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-x-16 sm:gap-y-8">
                <div className="flex flex-col gap-3">
                  <label
                    htmlFor="jenis-prestasi"
                    className="text-base font-medium tracking-[-0.02em] text-black sm:text-lg"
                  >
                    Jenis Prestasi
                  </label>
                  <InputField
                    id="jenis-prestasi"
                    type="dropdown"
                    size="md"
                    placeholder="Pilih salah satu"
                    options={JENIS_PRESTASI_OPTIONS.map((label) => ({ label, value: label }))}
                    value={jenisPrestasi}
                    onChange={(e) => setJenisPrestasi(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-3">
                  <label
                    htmlFor="juara-berapa"
                    className="text-base font-medium tracking-[-0.02em] text-black sm:text-lg"
                  >
                    Juara Berapa?
                  </label>
                  <InputField
                    id="juara-berapa"
                    type="dropdown"
                    size="md"
                    placeholder="Pilih salah satu"
                    options={JUARA_BERAPA_OPTIONS}
                    value={juaraBerapa}
                    onChange={(e) => setJuaraBerapa(e.target.value as JuaraBerapa)}
                  />
                </div>
                <div className="flex flex-col gap-3">
                  <label
                    htmlFor="tingkat-kejuaraan"
                    className="text-base font-medium tracking-[-0.02em] text-black sm:text-lg"
                  >
                    Tingkat Kejuaraan
                  </label>
                  <InputField
                    id="tingkat-kejuaraan"
                    type="dropdown"
                    size="md"
                    placeholder="Pilih salah satu"
                    options={TINGKAT_KEJUARAAN_OPTIONS}
                    value={tingkatKejuaraan}
                    onChange={(e) => setTingkatKejuaraan(e.target.value as TingkatKejuaraan)}
                  />
                </div>
              </div>
              {attempted && prestasiPartiallyFilled ? (
                <p className="text-base text-[#E70A0A]">
                  Lengkapi ketiga field Prestasi (Jenis, Juara Berapa, Tingkat Kejuaraan), atau kosongkan
                  semuanya kalau tidak ingin mengisi.
                </p>
              ) : null}
            </AccordionSection>

            <AccordionSection
              title="Pilihan Universitas dan Jurusan"
              open={openSections.pilihan}
              onToggle={() => toggleSection("pilihan")}
            >
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <span className="text-base font-medium tracking-[-0.02em] text-black sm:text-lg">
                    Pilihan 1
                  </span>
                  <span className="text-sm text-[#E70A0A] sm:text-base">*Wajib</span>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:pl-4">
                  <div className="flex flex-col gap-3">
                    <label
                      htmlFor="pilihan1-universitas"
                      className="text-base font-normal tracking-[-0.02em] text-black sm:text-lg"
                    >
                      Universitas
                    </label>
                    <InputField
                      id="pilihan1-universitas"
                      type="dropdown"
                      size="md"
                      placeholder="Pilih salah satu"
                      options={universitasOptions}
                      value={pilihan1.universitas}
                      onChange={(e) => setPilihan1({ universitas: e.target.value, ptnJurusanId: "" })}
                      status={attempted && !pilihan1.universitas ? "error" : "default"}
                    />
                  </div>
                  <div className="flex flex-col gap-3">
                    <label
                      htmlFor="pilihan1-jurusan"
                      className="text-base font-normal tracking-[-0.02em] text-black sm:text-lg"
                    >
                      Jurusan
                    </label>
                    <InputField
                      id="pilihan1-jurusan"
                      type="dropdown"
                      size="md"
                      placeholder="Pilih salah satu"
                      options={jurusanOptionsFor(pilihan1.universitas)}
                      value={pilihan1.ptnJurusanId}
                      onChange={(e) => setPilihan1((prev) => ({ ...prev, ptnJurusanId: e.target.value }))}
                      disabled={!pilihan1.universitas}
                      status={attempted && !pilihan1Valid ? "error" : "default"}
                    />
                  </div>
                </div>
              </div>

              {showPilihan2 ? (
                <div className="flex flex-col gap-4">
                  <span className="text-base font-medium tracking-[-0.02em] text-black sm:text-lg">
                    Pilihan 2
                  </span>
                  <div className="grid grid-cols-1 gap-4 sm:pl-4">
                    <div className="flex flex-col gap-3">
                      <label
                        htmlFor="pilihan2-universitas"
                        className="text-base font-normal tracking-[-0.02em] text-black sm:text-lg"
                      >
                        Universitas
                      </label>
                      <InputField
                        id="pilihan2-universitas"
                        type="dropdown"
                        size="md"
                        placeholder="Pilih salah satu"
                        options={universitasOptions}
                        value={pilihan2.universitas}
                        onChange={(e) => setPilihan2({ universitas: e.target.value, ptnJurusanId: "" })}
                      />
                    </div>
                    <div className="flex flex-col gap-3">
                      <label
                        htmlFor="pilihan2-jurusan"
                        className="text-base font-normal tracking-[-0.02em] text-black sm:text-lg"
                      >
                        Jurusan
                      </label>
                      <InputField
                        id="pilihan2-jurusan"
                        type="dropdown"
                        size="md"
                        placeholder="Pilih salah satu"
                        options={jurusanOptionsFor(pilihan2.universitas)}
                        value={pilihan2.ptnJurusanId}
                        onChange={(e) => setPilihan2((prev) => ({ ...prev, ptnJurusanId: e.target.value }))}
                        disabled={!pilihan2.universitas}
                        status={attempted && !pilihan2Valid ? "error" : "default"}
                      />
                    </div>
                  </div>
                  {attempted && pilihan2.ptnJurusanId && pilihan2.ptnJurusanId === pilihan1.ptnJurusanId ? (
                    <p className="text-base text-[#E70A0A]">Pilihan 1 dan Pilihan 2 tidak boleh sama.</p>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      setShowPilihan2(false);
                      setPilihan2(EMPTY_PILIHAN);
                    }}
                    className="flex items-center gap-1.5 self-start text-sm text-[#E70A0A] underline sm:text-base"
                  >
                    <TrashIcon className="h-4 w-4 shrink-0 sm:h-5 sm:w-5" />
                    Hapus Pilihan Kedua
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowPilihan2(true)}
                  className="flex items-center gap-2.5 self-start"
                >
                  <Image src="/icons/assessment-add-choice.svg" width={24} height={24} alt="" />
                  <span className="text-base tracking-[-0.02em] text-[#006ABD] sm:text-xl">
                    Tambah Pilihan Kedua (Opsional)
                  </span>
                </button>
              )}
            </AccordionSection>
          </div>

          {submitError ? (
            <p className="w-full rounded-[16px] bg-[#FFEBEB] px-5 py-4 text-sm text-[#E70A0A] sm:px-6 sm:text-base">
              {submitError}
            </p>
          ) : null}

          <div className="flex w-full flex-col gap-2 sm:items-end">
            <Button
              type="button"
              size="xl"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="w-full sm:w-auto"
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center gap-2">
                  <MaskotLoading size="sm" />
                  Menyimpan...
                </span>
              ) : (
                "Lihat Hasil Prediksi"
              )}
            </Button>
            {isSubmitting ? (
              <p className="text-sm text-[#7E7C7C] sm:text-right">
                Sedang menghitung prediksi & menyiapkan catatan personal — bisa memakan waktu sampai
                sekitar 20-25 detik, mohon tunggu, jangan tutup halaman ini.
              </p>
            ) : null}
          </div>
        </section>
      )}
    </main>
  );
}
