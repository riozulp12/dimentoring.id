"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import InputField from "@/components/ui/InputField";
import Mascot from "@/components/ui/Mascot";
import ChecklistGrid from "@/components/ui/ChecklistGrid";

/**
 * Wizard Profiling — PRD Bagian 7.0.2 DIREVISI TOTAL (Agustus 2026). Ini
 * "babak kedua" dari wizard register lama, DIPINDAH ke sini apa adanya
 * (role/kelas/mapel/PTN/semester/jurusan/subtes/whatsapp) — cuma bagian
 * Email/Password/Kode Referral yang DIHAPUS (sudah dikerjakan di /daftar
 * Langkah 1, lihat app/(auth)/daftar/page.tsx).
 *
 * Siswa: role -> kelas -> mapel -> whatsapp (4 langkah)
 * Mentor: role -> ptn -> semester_jurusan -> subtes -> whatsapp (5 langkah)
 */

type Role = "" | "siswa" | "mentor";

const SISWA_STEPS = ["role", "kelas", "mapel", "whatsapp"] as const;
const MENTOR_STEPS = ["role", "ptn", "semester_jurusan", "subtes", "whatsapp"] as const;

type StepKey = (typeof SISWA_STEPS)[number] | (typeof MENTOR_STEPS)[number];

interface FormState {
  role: Role;
  kelas: string;
  mapelSulit: string[];
  mapelLainnya: string;
  ptn: string;
  semester: string;
  jurusan: string;
  subtesDiampu: string[];
  subtesLainnya: string;
  whatsapp: string;
}

const INITIAL_FORM: FormState = {
  role: "",
  kelas: "",
  mapelSulit: [],
  mapelLainnya: "",
  ptn: "",
  semester: "",
  jurusan: "",
  subtesDiampu: [],
  subtesLainnya: "",
  whatsapp: "",
};

const ROLE_OPTIONS = [
  { label: "Siswa", value: "siswa" },
  { label: "Mentor", value: "mentor" },
];

const KELAS_OPTIONS = [
  { label: "Kelas 10", value: "10" },
  { label: "Kelas 11", value: "11" },
  { label: "Kelas 12", value: "12" },
  { label: "Gap Year", value: "gap-year" },
];

const MAPEL_SULIT_OPTIONS = [
  "Matematika",
  "Bahasa Inggris",
  "Bahasa Indonesia",
  "Kimia",
  "Fisika",
  "Biologi",
  "Sejarah",
  "Ekonomi",
  "Geografi",
  "Lainnya",
];

const SUBTES_OPTIONS = [
  "Literasi B. Indonesia",
  "Literasi B. Inggris",
  "Penalaran Matematika",
  "Penalaran Umum",
  "Pemahaman Bacaan & Menulis",
  "Pengetahuan Kuantitatif",
  "Matematika",
  "Fisika",
  "Kimia",
  "Biologi",
  "Bahasa Indonesia",
  "Bahasa Inggris",
  "Sejarah",
  "Ekonomi",
  "Geografi",
  "Lainnya",
];

const PTN_OPTIONS = [
  "Universitas Indonesia",
  "Institut Teknologi Bandung",
  "Universitas Gadjah Mada",
  "Institut Pertanian Bogor",
  "Universitas Airlangga",
  "Institut Teknologi Sepuluh Nopember",
  "Universitas Padjadjaran",
  "Universitas Diponegoro",
  "Universitas Brawijaya",
  "Universitas Sebelas Maret",
  "Universitas Hasanuddin",
  "Universitas Sumatera Utara",
  "Universitas Andalas",
  "Universitas Sriwijaya",
  "Universitas Negeri Yogyakarta",
  "Universitas Negeri Malang",
  "Universitas Negeri Semarang",
  "Universitas Negeri Jakarta",
  "Universitas Pendidikan Indonesia",
  "Universitas Jenderal Soedirman",
  "Universitas Lampung",
  "Universitas Riau",
  "Universitas Jember",
  "Universitas Udayana",
  "Universitas Mataram",
  "Lainnya",
].map((label) => ({ label, value: label }));

const STEP_COPY: Record<StepKey, { title: string; subtitle?: string }> = {
  role: { title: "Kamu mau daftar sebagai apa?" },
  kelas: { title: "Sekarang kamu kelas berapa?" },
  mapel: {
    title: "Mapel apa yang paling sulit menurutmu?",
    subtitle: "Pilih satu atau lebih",
  },
  ptn: { title: "Kamu kuliah di PTN mana?" },
  semester_jurusan: { title: "Semester berapa dan jurusan apa?" },
  subtes: {
    title: "Subtes apa yang mau kamu ampu?",
    subtitle: "Pilih satu atau lebih",
  },
  whatsapp: {
    title: "Tulis nomor WhatsApp kamu",
    subtitle: "Dipakai untuk verifikasi & informasi penting",
  },
};

function isValidWhatsapp(value: string) {
  return /^(\+62|62|0)8[0-9]{7,12}$/.test(value.replace(/[\s-]/g, ""));
}

function isStepValid(key: StepKey, form: FormState): boolean {
  switch (key) {
    case "role":
      return form.role === "siswa" || form.role === "mentor";
    case "kelas":
      return form.kelas !== "";
    case "mapel":
      return (
        form.mapelSulit.length > 0 &&
        (!form.mapelSulit.includes("Lainnya") || form.mapelLainnya.trim() !== "")
      );
    case "ptn":
      return form.ptn !== "";
    case "semester_jurusan":
      return form.semester.trim() !== "" && form.jurusan.trim() !== "";
    case "subtes":
      return (
        form.subtesDiampu.length > 0 &&
        (!form.subtesDiampu.includes("Lainnya") || form.subtesLainnya.trim() !== "")
      );
    case "whatsapp":
      return isValidWhatsapp(form.whatsapp);
    default:
      return true;
  }
}

function ProgressBar({ total, current }: { total: number; current: number }) {
  return (
    <div className="flex w-full items-center gap-2" aria-hidden="true">
      {Array.from({ length: total }).map((_, index) => (
        <div
          key={index}
          className={[
            "h-1.5 flex-1 rounded-full transition-colors sm:h-2",
            index <= current ? "bg-[#081EEA]" : "bg-[#E3E3E3]",
          ].join(" ")}
        />
      ))}
    </div>
  );
}

function SingleSelectGrid({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid w-full grid-cols-2 gap-3">
      {options.map((option) => (
        <Button
          key={option.value}
          type="button"
          size="md"
          variant={value === option.value ? "primary" : "secondary"}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}

export default function LengkapiProfilClient() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [stepIndex, setStepIndex] = useState(0);
  const [attempted, setAttempted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const steps = form.role === "mentor" ? MENTOR_STEPS : SISWA_STEPS;
  const stepKey = steps[stepIndex];
  const copy = STEP_COPY[stepKey];
  const valid = isStepValid(stepKey, form);

  function updateForm(patch: Partial<FormState>) {
    setSubmitError(null);
    setForm((prev) => ({ ...prev, ...patch }));
  }

  function toggleInList(field: "mapelSulit" | "subtesDiampu", value: string) {
    setForm((prev) => {
      const list = prev[field];
      const next = list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
      return { ...prev, [field]: next };
    });
  }

  async function handleNext() {
    setAttempted(true);
    if (!valid) return;
    setAttempted(false);

    if (stepIndex === steps.length - 1) {
      await submitProfil();
      return;
    }
    setStepIndex((prev) => prev + 1);
  }

  async function submitProfil() {
    setSubmitError(null);
    setIsSubmitting(true);

    const payload: Record<string, unknown> = {
      role: form.role,
      whatsapp: form.whatsapp,
    };

    if (form.role === "siswa") {
      payload.kelas = form.kelas;
      payload.mapelSulit = form.mapelSulit;
    } else {
      payload.ptn = form.ptn;
      payload.semester = form.semester;
      payload.jurusan = form.jurusan;
      payload.subtesDiampu = form.subtesDiampu;
    }

    try {
      const response = await fetch("/api/auth/lengkapi-profil", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await response.json();

      if (!response.ok || !json.success) {
        setSubmitError(json.error ?? "Gagal menyimpan profil. Coba lagi nanti.");
        setIsSubmitting(false);
        return;
      }

      router.push(json.redirectTo);
    } catch {
      setSubmitError("Gagal terhubung ke server. Periksa koneksi internet kamu.");
      setIsSubmitting(false);
    }
  }

  function handleBack() {
    setAttempted(false);
    setSubmitError(null);
    if (stepIndex === 0) return;
    setStepIndex((prev) => prev - 1);
  }

  return (
    <main className="flex min-h-dvh w-full items-center justify-center bg-[#F9FAFF] px-5 py-6 sm:px-8 md:px-10 lg:px-16 lg:py-8">
      <div className="flex w-full max-w-[1150px] items-center justify-center gap-10 xl:justify-between xl:gap-14">
        <div className="relative hidden shrink-0 items-center justify-center xl:flex xl:h-[560px] xl:w-[560px]">
          <div className="absolute inset-0 rounded-full border-[3px] border-dashed border-[#081EEA]/50" />
          <div className="absolute inset-[9%] rounded-full border-[3px] border-dashed border-[#081EEA]/50" />
          <div className="absolute inset-[18%] rounded-full border-[3px] border-dashed border-[#081EEA]/50" />
          <div className="absolute inset-[27%] rounded-full border-[3px] border-dashed border-[#081EEA]/50" />

          <div className="absolute top-[8%] right-[4%] z-10 w-[300px] xl:w-[340px]">
            <img src="/images/daftar-isi-dulu-yups.svg" alt="Isi Dulu Yups..." className="h-auto w-full" />
          </div>

          <Mascot
            variant="Happy1"
            alt="Maskot Dimentoring menyambut Anda"
            className="relative h-[440px] w-auto -translate-x-12"
            priority
          />
        </div>

        <div className="flex w-full max-w-[500px] flex-col items-center gap-4 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-5 shadow-[1px_2px_4px_0px_rgba(0,0,0,0.1)] sm:gap-5 sm:rounded-[24px] sm:px-8 sm:py-7 lg:gap-6 lg:rounded-[28px] lg:px-10 lg:py-8">
          <div className="flex w-full flex-col items-center gap-1 text-center">
            <h1 className="w-full text-lg leading-[1.5] font-semibold tracking-[-0.36px] text-black sm:text-xl lg:text-2xl">
              Jawab pertanyaan dulu yaa
            </h1>
            <p className="text-xs leading-[1.5] tracking-[-0.24px] text-[#7E7C7C] sm:text-sm sm:tracking-[-0.28px]">
              Sebelum masuk Dashboard, jawab ini dulu yaa
            </p>
          </div>

          <div className="flex w-full items-center gap-1.5 sm:gap-2">
            {stepIndex > 0 ? (
              <button
                type="button"
                onClick={handleBack}
                aria-label="Kembali"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-base text-[#7E7C7C] transition-colors hover:bg-[#F9F9F9] hover:text-black sm:h-8 sm:w-8 sm:text-lg"
              >
                ←
              </button>
            ) : null}
            <p className="text-xs leading-[1.5] tracking-[-0.24px] text-[#7E7C7C] sm:text-sm">
              Langkah {stepIndex + 1} dari {steps.length}
            </p>
          </div>

          <ProgressBar total={steps.length} current={stepIndex} />

          <div className="flex w-full flex-col items-center gap-1.5 text-center sm:gap-2">
            <h2 className="w-full text-lg leading-[1.5] font-semibold tracking-[-0.36px] text-[#081EEA] sm:text-xl lg:text-2xl">
              {copy.title}
            </h2>
            {copy.subtitle ? (
              <p className="text-xs leading-[1.5] tracking-[-0.24px] text-[#7E7C7C] sm:text-sm sm:tracking-[-0.28px] lg:text-base">
                {copy.subtitle}
              </p>
            ) : null}
          </div>

          <div className="flex w-full flex-col items-center gap-3 sm:gap-4">
            {stepKey === "role" ? (
              <InputField
                type="dropdown"
                size="md"
                className="w-full"
                placeholder="Pilih peran kamu"
                options={ROLE_OPTIONS}
                value={form.role}
                onChange={(event) => updateForm({ role: event.target.value as Role })}
              />
            ) : null}

            {stepKey === "kelas" ? (
              <SingleSelectGrid
                options={KELAS_OPTIONS}
                value={form.kelas}
                onChange={(value) => updateForm({ kelas: value })}
              />
            ) : null}

            {stepKey === "mapel" ? (
              <>
                <ChecklistGrid
                  options={MAPEL_SULIT_OPTIONS}
                  selected={form.mapelSulit}
                  onToggle={(value) => toggleInList("mapelSulit", value)}
                />
                {form.mapelSulit.includes("Lainnya") ? (
                  <InputField
                    type="text"
                    size="md"
                    placeholder="Tulis mapel lainnya"
                    value={form.mapelLainnya}
                    onChange={(event) => updateForm({ mapelLainnya: event.target.value })}
                  />
                ) : null}
              </>
            ) : null}

            {stepKey === "ptn" ? (
              <InputField
                type="dropdown"
                size="md"
                className="w-full"
                placeholder="Pilih PTN kamu"
                options={PTN_OPTIONS}
                value={form.ptn}
                onChange={(event) => updateForm({ ptn: event.target.value })}
              />
            ) : null}

            {stepKey === "semester_jurusan" ? (
              <div className="flex w-full flex-col gap-2.5 sm:gap-3 lg:gap-4">
                <div className="flex w-full flex-col gap-1.5">
                  <label className="w-full text-xs leading-[1.5] font-medium tracking-[-0.24px] text-black sm:text-sm">
                    Semester
                  </label>
                  <InputField
                    type="text"
                    size="md"
                    inputMode="numeric"
                    placeholder="Semester (mis. 4)"
                    value={form.semester}
                    onChange={(event) =>
                      updateForm({ semester: event.target.value.replace(/[^0-9]/g, "") })
                    }
                  />
                </div>
                <div className="flex w-full flex-col gap-1.5">
                  <label className="w-full text-xs leading-[1.5] font-medium tracking-[-0.24px] text-black sm:text-sm">
                    Jurusan
                  </label>
                  <InputField
                    type="text"
                    size="md"
                    placeholder="Jurusan (mis. Teknik Informatika)"
                    value={form.jurusan}
                    onChange={(event) => updateForm({ jurusan: event.target.value })}
                  />
                </div>
              </div>
            ) : null}

            {stepKey === "subtes" ? (
              <>
                <ChecklistGrid
                  options={SUBTES_OPTIONS}
                  selected={form.subtesDiampu}
                  onToggle={(value) => toggleInList("subtesDiampu", value)}
                />
                {form.subtesDiampu.includes("Lainnya") ? (
                  <InputField
                    type="text"
                    size="md"
                    placeholder="Tulis subtes lainnya"
                    value={form.subtesLainnya}
                    onChange={(event) => updateForm({ subtesLainnya: event.target.value })}
                  />
                ) : null}
              </>
            ) : null}

            {stepKey === "whatsapp" ? (
              <InputField
                type="text"
                size="md"
                inputMode="numeric"
                placeholder="08xxxxxxxxxx"
                value={form.whatsapp}
                onChange={(event) => updateForm({ whatsapp: event.target.value.replace(/[^0-9]/g, "") })}
              />
            ) : null}

            {attempted && !valid ? (
              <p className="w-full text-center text-xs leading-[1.5] tracking-[-0.24px] text-[#E70A0A] sm:text-sm sm:tracking-[-0.28px]">
                {stepKey === "whatsapp"
                  ? "Masukkan nomor WhatsApp yang valid (mis. 08xxxxxxxxxx)."
                  : "Lengkapi dulu sebelum lanjut."}
              </p>
            ) : null}

            {submitError ? (
              <p className="w-full text-center text-xs leading-[1.5] tracking-[-0.24px] text-[#E70A0A] sm:text-sm sm:tracking-[-0.28px]">
                {submitError}
              </p>
            ) : null}
          </div>

          <Button
            type="button"
            variant="primary"
            size="md"
            className="w-full"
            onClick={handleNext}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Memproses..." : stepIndex === steps.length - 1 ? "Selesai" : "Lanjut"}
          </Button>
        </div>
      </div>
    </main>
  );
}
