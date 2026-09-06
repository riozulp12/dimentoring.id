"use client";

import { useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Avatar from "@/components/ui/Avatar";
import Button from "@/components/ui/Button";
import InputField from "@/components/ui/InputField";
import ChecklistGrid from "@/components/ui/ChecklistGrid";
import type { ProfilData, ProvinsiOption } from "@/lib/profil/getProfilData";

/** Halaman Profil — SATU komponen, kontennya menyesuaikan role sesi yang
 * login (PRD 7 poin 1). Toggle read-only <-> edit; setelah simpan sukses,
 * router.refresh() supaya Header/Sidebar (nama+avatar, di luar subtree ini)
 * ikut ter-update tanpa reload halaman penuh. */

const TINGKAT_KELAS_OPTIONS = [
  { label: "Kelas 10", value: "kelas_10" },
  { label: "Kelas 11", value: "kelas_11" },
  { label: "Kelas 12", value: "kelas_12" },
  { label: "Gap Year", value: "gap_year" },
];

const TINGKAT_KELAS_LABEL: Record<string, string> = {
  kelas_10: "Kelas 10",
  kelas_11: "Kelas 11",
  kelas_12: "Kelas 12",
  gap_year: "Gap Year",
};

const SUB_STATUS_LABEL: Record<string, string> = {
  calon_mahasiswa: "Calon Mahasiswa",
  mahasiswa: "Mahasiswa",
};

const MAX_AVATAR_BYTES = 1 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function isValidWhatsapp(value: string): boolean {
  return /^(62|0)8[0-9]{7,12}$/.test(value.replace(/[^0-9]/g, ""));
}

function formatTanggalIndonesia(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

function StatusBadge({ status }: { status: "active" | "pending" | "rejected" | null }) {
  if (status === "active") {
    return (
      <span className="inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700 sm:text-sm">
        Aktif
      </span>
    );
  }
  if (status === "pending") {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700 sm:text-sm">
        On Review
      </span>
    );
  }
  if (status === "rejected") {
    return (
      <span className="inline-flex items-center rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700 sm:text-sm">
        Ditolak
      </span>
    );
  }
  return null;
}

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-[#7E7C7C] sm:text-sm">{label}</span>
      <div className="text-sm font-medium text-black sm:text-base">{value}</div>
    </div>
  );
}

function ChipList({ items }: { items: string[] }) {
  if (items.length === 0) {
    return <span className="text-sm text-[#7E7C7C]">Belum diisi</span>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <span
          key={item}
          className="rounded-full border border-[#E3E3E3] bg-[#F9F9F9] px-3 py-1 text-xs font-medium text-black sm:text-sm"
        >
          {item}
        </span>
      ))}
    </div>
  );
}

function Card({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-5 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white p-5 sm:p-8">
      {children}
    </div>
  );
}

interface EditFormState {
  namaLengkap: string;
  whatsapp: string;
  namaSekolah: string;
  provinsiId: string;
  tingkatKelas: string;
  mapelTersulit: string[];
  asalPtn: string;
  semester: string;
  jurusan: string;
  subtesDiampu: string[];
}

function toFormState(profil: ProfilData): EditFormState {
  return {
    namaLengkap: profil.nama,
    whatsapp: profil.noWa,
    namaSekolah: profil.namaSekolah ?? "",
    provinsiId: profil.provinsiId ?? "",
    tingkatKelas: profil.tingkatKelas ?? "",
    mapelTersulit: profil.mapelTersulit,
    asalPtn: profil.mentorAsalPtn ?? "",
    semester: profil.mentorSemester ? String(profil.mentorSemester) : "",
    jurusan: profil.mentorJurusan ?? "",
    subtesDiampu: profil.mentorSubtesDiampu,
  };
}

export default function ProfilClient({
  profil: initialProfil,
  provinsiOptions,
  subtesOptions,
}: {
  profil: ProfilData;
  provinsiOptions: ProvinsiOption[];
  subtesOptions: string[];
}) {
  const router = useRouter();
  const [profil, setProfil] = useState(initialProfil);
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [form, setForm] = useState<EditFormState>(() => toFormState(initialProfil));
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function enterEdit() {
    setForm(toFormState(profil));
    setAvatarFile(null);
    setAvatarPreview(null);
    setAvatarError(null);
    setSubmitError(null);
    setMode("edit");
  }

  function cancelEdit() {
    setAvatarFile(null);
    setAvatarPreview(null);
    setAvatarError(null);
    setSubmitError(null);
    setMode("view");
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!file) return;

    setAvatarError(null);
    if (!ALLOWED_AVATAR_TYPES.has(file.type)) {
      setAvatarError("Format file harus JPG, PNG, atau WEBP.");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setAvatarError("Ukuran file maksimal 1MB.");
      return;
    }

    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  }

  function toggleMapel(value: string) {
    setForm((prev) => ({
      ...prev,
      mapelTersulit: prev.mapelTersulit.includes(value)
        ? prev.mapelTersulit.filter((v) => v !== value)
        : [...prev.mapelTersulit, value],
    }));
  }

  function toggleSubtes(value: string) {
    setForm((prev) => ({
      ...prev,
      subtesDiampu: prev.subtesDiampu.includes(value)
        ? prev.subtesDiampu.filter((v) => v !== value)
        : [...prev.subtesDiampu, value],
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);

    const namaLengkap = form.namaLengkap.trim();
    if (!namaLengkap) {
      setSubmitError("Nama lengkap wajib diisi.");
      return;
    }
    if (!isValidWhatsapp(form.whatsapp)) {
      setSubmitError("Nomor WhatsApp tidak valid.");
      return;
    }
    if (profil.role === "student") {
      if (!form.provinsiId) {
        setSubmitError("Provinsi wajib diisi.");
        return;
      }
      if (!form.tingkatKelas) {
        setSubmitError("Kelas wajib diisi.");
        return;
      }
      if (form.mapelTersulit.length === 0) {
        setSubmitError("Pilih minimal satu Mapel Tersulit.");
        return;
      }
    }
    if (profil.role === "mentor") {
      if (!form.asalPtn.trim()) {
        setSubmitError("Asal PTN wajib diisi.");
        return;
      }
      if (!form.jurusan.trim()) {
        setSubmitError("Jurusan wajib diisi.");
        return;
      }
      if (!form.semester.trim() || Number(form.semester) <= 0) {
        setSubmitError("Semester tidak valid.");
        return;
      }
      if (form.subtesDiampu.length === 0) {
        setSubmitError("Pilih minimal satu Subtes yang Diampu.");
        return;
      }
    }

    setIsSubmitting(true);

    // Kalau avatar SEKALIGUS data lain diubah: upload avatar dulu ke endpoint
    // terpisah, baru submit data teks — dua request terpisah (PRD 7 poin 3).
    let newAvatarUrl = profil.avatarUrl;
    if (avatarFile) {
      try {
        const fd = new FormData();
        fd.append("file", avatarFile);
        const avatarRes = await fetch("/api/profil/avatar", { method: "POST", body: fd });
        const avatarJson = await avatarRes.json();
        if (!avatarRes.ok || !avatarJson.success) {
          setSubmitError(avatarJson.error ?? "Gagal mengunggah foto. Coba lagi nanti.");
          setIsSubmitting(false);
          return;
        }
        newAvatarUrl = avatarJson.avatarUrl as string;
      } catch {
        setSubmitError("Gagal terhubung ke server saat unggah foto.");
        setIsSubmitting(false);
        return;
      }
    }

    const payload: Record<string, unknown> = {
      namaLengkap,
      whatsapp: form.whatsapp,
    };
    if (profil.role === "student") {
      payload.namaSekolah = form.namaSekolah.trim();
      payload.provinsiId = form.provinsiId;
      payload.tingkatKelas = form.tingkatKelas;
      payload.mapelTersulit = form.mapelTersulit;
    }
    if (profil.role === "mentor") {
      payload.asalPtn = form.asalPtn.trim();
      payload.semester = Number(form.semester);
      payload.jurusan = form.jurusan.trim();
      payload.subtesDiampu = form.subtesDiampu;
    }

    try {
      const response = await fetch("/api/profil/update", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        setSubmitError(json.error ?? "Gagal menyimpan perubahan. Coba lagi nanti.");
        setIsSubmitting(false);
        return;
      }
    } catch {
      setSubmitError("Gagal terhubung ke server. Periksa koneksi internet kamu.");
      setIsSubmitting(false);
      return;
    }

    const provinsiNama = provinsiOptions.find((p) => p.id === form.provinsiId)?.nama ?? null;
    const whatsappDigits = form.whatsapp.replace(/[^0-9]/g, "");

    setProfil((prev) => ({
      ...prev,
      nama: namaLengkap,
      noWa: whatsappDigits,
      avatarUrl: newAvatarUrl,
      namaSekolah: prev.role === "student" ? form.namaSekolah.trim() || null : prev.namaSekolah,
      provinsiId: prev.role === "student" ? form.provinsiId : prev.provinsiId,
      provinsiNama: prev.role === "student" ? provinsiNama : prev.provinsiNama,
      tingkatKelas: prev.role === "student" ? form.tingkatKelas : prev.tingkatKelas,
      mapelTersulit: prev.role === "student" ? form.mapelTersulit : prev.mapelTersulit,
      mentorAsalPtn: prev.role === "mentor" ? form.asalPtn.trim() : prev.mentorAsalPtn,
      mentorSemester: prev.role === "mentor" ? Number(form.semester) : prev.mentorSemester,
      mentorJurusan: prev.role === "mentor" ? form.jurusan.trim() : prev.mentorJurusan,
      mentorSubtesDiampu: prev.role === "mentor" ? form.subtesDiampu : prev.mentorSubtesDiampu,
    }));

    setAvatarFile(null);
    setAvatarPreview(null);
    setIsSubmitting(false);
    setMode("view");
    router.refresh();
  }

  if (mode === "view") {
    return (
      <div className="flex flex-col gap-6">
        <Card>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <Avatar avatarUrl={profil.avatarUrl} nama={profil.nama} size="lg" />
              <div className="flex flex-col gap-1">
                <h2 className="text-lg font-semibold text-black sm:text-xl">{profil.nama}</h2>
                <p className="text-sm text-[#7E7C7C]">{profil.email}</p>
              </div>
            </div>
            <Button type="button" variant="secondary" size="sm" onClick={enterEdit}>
              Edit Profil
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <InfoRow label="Nama Lengkap" value={profil.nama} />
            <InfoRow label="Email" value={profil.email} />
            <InfoRow label="Nomor WhatsApp" value={profil.noWa} />
            <InfoRow label="Bergabung sejak" value={formatTanggalIndonesia(profil.createdAt)} />
          </div>
        </Card>

        {profil.role === "student" ? (
          <Card>
            <h3 className="text-base font-semibold text-black sm:text-lg">Info Akademik</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <InfoRow label="Nama Sekolah" value={profil.namaSekolah || "Belum diisi"} />
              <InfoRow label="Provinsi" value={profil.provinsiNama || "Belum diisi"} />
              <InfoRow
                label="Kelas"
                value={profil.tingkatKelas ? TINGKAT_KELAS_LABEL[profil.tingkatKelas] : "Belum diisi"}
              />
              <InfoRow label="Status" value={profil.subStatus ? SUB_STATUS_LABEL[profil.subStatus] : "-"} />
            </div>
            <InfoRow label="Mapel Tersulit" value={<ChipList items={profil.mapelTersulit} />} />
          </Card>
        ) : null}

        {profil.role === "mentor" ? (
          <Card>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-black sm:text-lg">Info Mengajar</h3>
              <StatusBadge status={profil.mentorStatus} />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <InfoRow label="Asal PTN" value={profil.mentorAsalPtn || "-"} />
              <InfoRow label="Semester" value={profil.mentorSemester ?? "-"} />
              <InfoRow label="Jurusan" value={profil.mentorJurusan || "-"} />
            </div>
            <InfoRow label="Subtes yang Diampu" value={<ChipList items={profil.mentorSubtesDiampu} />} />
          </Card>
        ) : null}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <Card>
        <div className="flex items-center gap-4">
          <div className="relative flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#d9d9d9]">
            {avatarPreview ? (
              // Preview lokal (blob:) tidak didukung next/image, jadi pakai <img> biasa khusus untuk preview ini.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarPreview} alt={profil.nama} className="size-full object-cover" />
            ) : profil.avatarUrl ? (
              <Image src={profil.avatarUrl} alt={profil.nama} fill className="object-cover" sizes="80px" />
            ) : (
              <span className="flex size-full items-center justify-center bg-[#081EEA] text-2xl font-bold text-white">
                {profil.nama.trim().charAt(0).toUpperCase() || "?"}
              </span>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Button type="button" variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()}>
              Ganti Foto
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleFileChange}
            />
            <p className="text-xs text-[#7E7C7C]">JPG, PNG, atau WEBP — maks 1MB</p>
            {avatarError ? <p className="text-xs text-[#E70A0A]">{avatarError}</p> : null}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-black">Nama Lengkap</label>
            <InputField
              type="text"
              size="md"
              value={form.namaLengkap}
              onChange={(e) => setForm((prev) => ({ ...prev, namaLengkap: e.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-black">Email</label>
            <InputField type="text" size="md" value={profil.email} disabled />
            <p className="text-xs text-[#7E7C7C]">Hubungi Admin untuk ubah email.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-black">Nomor WhatsApp</label>
            <InputField
              type="text"
              size="md"
              value={form.whatsapp}
              onChange={(e) => setForm((prev) => ({ ...prev, whatsapp: e.target.value }))}
            />
          </div>
        </div>
      </Card>

      {profil.role === "student" ? (
        <Card>
          <h3 className="text-base font-semibold text-black sm:text-lg">Info Akademik</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-black">Nama Sekolah</label>
              <InputField
                type="text"
                size="md"
                placeholder="Nama sekolah kamu"
                value={form.namaSekolah}
                onChange={(e) => setForm((prev) => ({ ...prev, namaSekolah: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-black">Provinsi</label>
              <InputField
                type="dropdown"
                size="md"
                placeholder="Pilih provinsi"
                options={provinsiOptions.map((p) => ({ label: p.nama, value: p.id }))}
                value={form.provinsiId}
                onChange={(e) => setForm((prev) => ({ ...prev, provinsiId: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-black">Kelas</label>
              <InputField
                type="dropdown"
                size="md"
                placeholder="Pilih kelas"
                options={TINGKAT_KELAS_OPTIONS}
                value={form.tingkatKelas}
                onChange={(e) => setForm((prev) => ({ ...prev, tingkatKelas: e.target.value }))}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-black">Mapel Tersulit</label>
            <ChecklistGrid options={subtesOptions} selected={form.mapelTersulit} onToggle={toggleMapel} />
          </div>
        </Card>
      ) : null}

      {profil.role === "mentor" ? (
        <Card>
          <h3 className="text-base font-semibold text-black sm:text-lg">Info Mengajar</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-black">Asal PTN</label>
              <InputField
                type="text"
                size="md"
                value={form.asalPtn}
                onChange={(e) => setForm((prev) => ({ ...prev, asalPtn: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-black">Semester</label>
              <InputField
                type="text"
                size="md"
                inputMode="numeric"
                value={form.semester}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, semester: e.target.value.replace(/[^0-9]/g, "") }))
                }
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-black">Jurusan</label>
              <InputField
                type="text"
                size="md"
                value={form.jurusan}
                onChange={(e) => setForm((prev) => ({ ...prev, jurusan: e.target.value }))}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-black">Subtes yang Diampu</label>
            <ChecklistGrid options={subtesOptions} selected={form.subtesDiampu} onToggle={toggleSubtes} />
          </div>
        </Card>
      ) : null}

      {submitError ? <p className="text-sm text-[#E70A0A]">{submitError}</p> : null}

      <div className="flex justify-end gap-3">
        <Button type="button" variant="secondary" size="md" onClick={cancelEdit} disabled={isSubmitting}>
          Batal
        </Button>
        <Button type="submit" variant="primary" size="md" disabled={isSubmitting}>
          {isSubmitting ? "Menyimpan..." : "Simpan"}
        </Button>
      </div>
    </form>
  );
}
