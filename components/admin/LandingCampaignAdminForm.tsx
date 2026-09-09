"use client";

import { useState, type FormEvent } from "react";
import InputField from "@/components/ui/InputField";
import Button from "@/components/ui/Button";
import Toggle from "@/components/ui/Toggle";
import type { LandingCampaignAdminItem } from "@/lib/admin/getKelolaKontenData";

/**
 * Form Tambah/Edit Banner Campaign — SATU komponen dipakai kedua mode
 * (initialItem ada = edit, tidak ada = tambah), pola sama dengan
 * KontenInfoAdminForm.tsx. PRD Bagian 13 (landing_campaign — BARU).
 */

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export default function LandingCampaignAdminForm({
  initialItem,
  onSuccess,
  onCancel,
}: {
  initialItem?: LandingCampaignAdminItem;
  onSuccess: (item: LandingCampaignAdminItem) => void;
  onCancel: () => void;
}) {
  const [judul, setJudul] = useState(initialItem?.judul ?? "");
  const [linkTujuan, setLinkTujuan] = useState(initialItem?.linkTujuan ?? "");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [tanggalMulai, setTanggalMulai] = useState(initialItem?.tanggalMulai ?? "");
  const [tanggalSelesai, setTanggalSelesai] = useState(initialItem?.tanggalSelesai ?? "");
  const [statusAktif, setStatusAktif] = useState(initialItem ? initialItem.status === "aktif" : true);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);
    setLinkError(null);

    const trimmedLink = linkTujuan.trim();
    if (!isValidUrl(trimmedLink)) {
      setLinkError("Isi dengan link yang valid (harus diawali http:// atau https://).");
      return;
    }
    if (tanggalMulai && tanggalSelesai && tanggalSelesai < tanggalMulai) {
      setSubmitError("Tanggal Selesai tidak boleh sebelum Tanggal Mulai.");
      return;
    }

    setIsSubmitting(true);
    const status = statusAktif ? "aktif" : "nonaktif";
    const payload = {
      judul: judul.trim(),
      linkTujuan: trimmedLink,
      tanggalMulai: tanggalMulai || undefined,
      tanggalSelesai: tanggalSelesai || undefined,
      status,
    };

    try {
      const url = initialItem ? `/api/kelola-konten/campaign/${initialItem.id}` : "/api/kelola-konten/campaign";
      const method = initialItem ? "PATCH" : "POST";
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        setSubmitError(json.error ?? "Gagal menyimpan campaign. Coba lagi nanti.");
        setIsSubmitting(false);
        return;
      }

      onSuccess({
        id: initialItem?.id ?? (json.id as string),
        judul: judul.trim(),
        linkTujuan: trimmedLink,
        tanggalMulai: tanggalMulai || null,
        tanggalSelesai: tanggalSelesai || null,
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
      <h2 className="text-lg font-semibold text-black">{initialItem ? "Edit Campaign" : "Buat Campaign"}</h2>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-black">Judul</label>
        <InputField
          type="text"
          size="md"
          required
          value={judul}
          onChange={(e) => setJudul(e.target.value)}
          placeholder="Mis. Diskon 20% untuk semua kelas TKA!"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-black">Link Tujuan</label>
        <InputField
          type="text"
          size="md"
          status={linkError ? "error" : "default"}
          value={linkTujuan}
          onChange={(e) => {
            setLinkTujuan(e.target.value);
            setLinkError(null);
          }}
          placeholder="https://..."
        />
        {linkError ? <p className="text-sm text-[#E70A0A]">{linkError}</p> : null}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-black">Tanggal Mulai (opsional)</label>
          <input
            type="date"
            value={tanggalMulai}
            onChange={(e) => setTanggalMulai(e.target.value)}
            className="w-full rounded-[16px] border border-[#AFAFAF] bg-white px-4 py-2.5 text-sm text-black outline-none transition-colors hover:border-[#081EEA] focus:border-black"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-black">Tanggal Selesai (opsional)</label>
          <input
            type="date"
            value={tanggalSelesai}
            onChange={(e) => setTanggalSelesai(e.target.value)}
            className="w-full rounded-[16px] border border-[#AFAFAF] bg-white px-4 py-2.5 text-sm text-black outline-none transition-colors hover:border-[#081EEA] focus:border-black"
          />
        </div>
      </div>
      <p className="-mt-2 text-xs text-[#7E7C7C]">
        Kosongkan Tanggal Mulai untuk aktif segera, kosongkan Tanggal Selesai untuk tanpa batas akhir otomatis.
      </p>

      <div className="flex items-center justify-between gap-3 rounded-[16px] border border-[#E3E3E3] p-3.5">
        <label className="text-sm font-medium text-black">Status</label>
        <div className="flex items-center gap-2">
          <span className="text-sm text-[#7E7C7C]">{statusAktif ? "Aktif" : "Nonaktif"}</span>
          <Toggle checked={statusAktif} onChange={() => setStatusAktif((prev) => !prev)} label="Status Campaign" />
        </div>
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
          {isSubmitting ? "Menyimpan..." : initialItem ? "Simpan Perubahan" : "Buat Campaign"}
        </Button>
      </div>
    </form>
  );
}
