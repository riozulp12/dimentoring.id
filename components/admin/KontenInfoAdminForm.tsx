"use client";

import { useState, type FormEvent } from "react";
import InputField from "@/components/ui/InputField";
import Button from "@/components/ui/Button";
import type { KontenInfoAdminItem } from "@/lib/admin/getKelolaKontenData";
import { KONTEN_INFO_TIPE_LABEL } from "@/lib/shared/kontenInfoLabels";

/**
 * Form Tambah/Edit Info Beasiswa/Internship/Event/Webinar/Workshop — SATU
 * komponen dipakai kedua mode (initialItem ada = edit, tidak ada = tambah),
 * pola sama dengan KelolaKelasForm.tsx. PRD Bagian 13 (konten_info). Opsi
 * Tipe REUSE KONTEN_INFO_TIPE_LABEL (satu-satunya sumber daftar tipe) supaya
 * dropdown ini otomatis konsisten dengan badge & filter di halaman publik.
 */

const TIPE_OPTIONS = Object.entries(KONTEN_INFO_TIPE_LABEL).map(([value, label]) => ({ label, value }));

const STATUS_OPTIONS = [
  { label: "Aktif", value: "aktif" },
  { label: "Ditutup", value: "ditutup" },
];

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export default function KontenInfoAdminForm({
  initialItem,
  onSuccess,
  onCancel,
}: {
  initialItem?: KontenInfoAdminItem;
  onSuccess: (item: KontenInfoAdminItem) => void;
  onCancel: () => void;
}) {
  const [tipe, setTipe] = useState(initialItem?.tipe ?? "");
  const [judul, setJudul] = useState(initialItem?.judul ?? "");
  const [deskripsi, setDeskripsi] = useState(initialItem?.deskripsi ?? "");
  const [deskripsiLengkap, setDeskripsiLengkap] = useState(initialItem?.deskripsiLengkap ?? "");
  const [deadline, setDeadline] = useState(initialItem?.deadline ?? "");
  const [linkPendaftaran, setLinkPendaftaran] = useState(initialItem?.linkPendaftaran ?? "");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [status, setStatus] = useState(initialItem?.status ?? "aktif");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);
    setLinkError(null);

    const trimmedLink = linkPendaftaran.trim();
    if (trimmedLink && !isValidUrl(trimmedLink)) {
      setLinkError("Isi dengan link yang valid (harus diawali http:// atau https://).");
      return;
    }

    setIsSubmitting(true);
    const payload = {
      tipe,
      judul,
      deskripsi: deskripsi.trim() || undefined,
      deskripsiLengkap: deskripsiLengkap.trim() || undefined,
      deadline: deadline || undefined,
      linkPendaftaran: trimmedLink || undefined,
      status,
    };

    try {
      const url = initialItem ? `/api/kelola-konten/info/${initialItem.id}` : "/api/kelola-konten/info";
      const method = initialItem ? "PATCH" : "POST";
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        setSubmitError(json.error ?? "Gagal menyimpan info. Coba lagi nanti.");
        setIsSubmitting(false);
        return;
      }

      onSuccess({
        id: initialItem?.id ?? (json.id as string),
        tipe,
        judul,
        deskripsi: deskripsi.trim() || null,
        deskripsiLengkap: deskripsiLengkap.trim() || null,
        linkPendaftaran: trimmedLink || null,
        deadline: deadline || null,
        status,
      });
      setIsSubmitting(false);
    } catch {
      setSubmitError("Gagal terhubung ke server. Periksa koneksi internet kamu.");
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-black">{initialItem ? "Edit Info" : "Tambah Info"}</h2>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-black">Tipe</label>
          <InputField
            type="dropdown"
            size="md"
            placeholder="Pilih tipe"
            required
            value={tipe}
            onChange={(e) => setTipe(e.target.value)}
            options={TIPE_OPTIONS}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-black">Status</label>
          <InputField
            type="dropdown"
            size="md"
            required
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            options={STATUS_OPTIONS}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-black">Judul</label>
        <InputField
          type="text"
          size="md"
          required
          value={judul}
          onChange={(e) => setJudul(e.target.value)}
          placeholder="Judul beasiswa/internship/event"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-black">Deskripsi Singkat</label>
        <textarea
          value={deskripsi}
          onChange={(e) => setDeskripsi(e.target.value)}
          rows={2}
          placeholder="Ringkasan singkat — tampil di card list & landing page."
          className="w-full rounded-[16px] border border-[#AFAFAF] bg-white px-4 py-2.5 text-sm text-black outline-none transition-colors placeholder:text-[#AFAFAF] focus:border-black"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-black">Deskripsi Lengkap</label>
        <textarea
          value={deskripsiLengkap}
          onChange={(e) => setDeskripsiLengkap(e.target.value)}
          rows={5}
          placeholder="Konten detail — tampil di halaman /beasiswa-event/[id]. Kalau dikosongkan, fallback ke Deskripsi Singkat."
          className="w-full rounded-[16px] border border-[#AFAFAF] bg-white px-4 py-2.5 text-sm text-black outline-none transition-colors placeholder:text-[#AFAFAF] focus:border-black"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-black">Deadline</label>
        <input
          type="date"
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
          className="w-full rounded-[16px] border border-[#AFAFAF] bg-white px-4 py-2.5 text-sm text-black outline-none transition-colors hover:border-[#081EEA] focus:border-black"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-black">Link Pendaftaran</label>
        <InputField
          type="text"
          size="md"
          status={linkError ? "error" : "default"}
          value={linkPendaftaran}
          onChange={(e) => {
            setLinkPendaftaran(e.target.value);
            setLinkError(null);
          }}
          placeholder="https://..."
        />
        {linkError ? <p className="text-sm text-[#E70A0A]">{linkError}</p> : null}
      </div>

      {submitError ? <p className="text-sm text-[#E70A0A]">{submitError}</p> : null}

      <div className="flex gap-3 pt-2">
        <Button
          type="button"
          variant="secondary"
          size="md"
          className="flex-1"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Batal
        </Button>
        <Button type="submit" variant="primary" size="md" className="flex-1" disabled={isSubmitting}>
          {isSubmitting ? "Menyimpan..." : initialItem ? "Simpan Perubahan" : "Tambah Info"}
        </Button>
      </div>
    </form>
  );
}
