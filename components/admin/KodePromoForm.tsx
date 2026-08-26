"use client";

import { useState, type FormEvent } from "react";
import InputField from "@/components/ui/InputField";
import Button from "@/components/ui/Button";
import Toggle from "@/components/ui/Toggle";
import { PROMO_STATUS_LABEL, PROMO_TIPE_DISKON_LABEL } from "@/lib/shared/kodePromoLabels";
import type { CampaignOption, KelasOption, KodePromoListItem } from "@/lib/admin/getKodePromoData";

/**
 * Form Tambah/Edit Kode Promo — SATU komponen dipakai kedua mode
 * (initialItem ada = edit, tidak ada = tambah), pola sama dengan
 * KelolaKelasForm.tsx/KontenInfoAdminForm.tsx. PRD Bagian 13 (kode_promo).
 * Kode selalu ditampilkan/dikirim UPPERCASE — validasi unik final dilakukan
 * di server (lib/admin/validateKodePromoInput.ts) supaya konsisten dengan
 * data terbaru, tapi disiplin uppercase-di-client di sini biar Admin langsung
 * lihat bentuk final kodenya sebelum submit.
 */

const TIPE_DISKON_OPTIONS = [
  { label: PROMO_TIPE_DISKON_LABEL.persen, value: "persen" },
  { label: PROMO_TIPE_DISKON_LABEL.nominal, value: "nominal" },
];

const STATUS_OPTIONS = [
  { label: PROMO_STATUS_LABEL.aktif, value: "aktif" },
  { label: PROMO_STATUS_LABEL.nonaktif, value: "nonaktif" },
];

export default function KodePromoForm({
  campaignOptions,
  kelasOptions,
  initialItem,
  onSuccess,
  onCancel,
}: {
  campaignOptions: CampaignOption[];
  kelasOptions: KelasOption[];
  initialItem?: KodePromoListItem;
  onSuccess: (item: KodePromoListItem) => void;
  onCancel: () => void;
}) {
  const [kode, setKode] = useState(initialItem?.kode ?? "");
  const [tipeDiskon, setTipeDiskon] = useState(initialItem?.tipeDiskon ?? "");
  const [nilaiDiskon, setNilaiDiskon] = useState(initialItem ? String(initialItem.nilaiDiskon) : "");
  const [tanggalMulai, setTanggalMulai] = useState(initialItem?.tanggalMulai ?? "");
  const [tanggalSelesai, setTanggalSelesai] = useState(initialItem?.tanggalSelesai ?? "");
  const [kuotaPemakaian, setKuotaPemakaian] = useState(
    initialItem?.kuotaPemakaian != null ? String(initialItem.kuotaPemakaian) : "",
  );
  const [campaignTerkaitId, setCampaignTerkaitId] = useState(initialItem?.campaignTerkaitId ?? "");
  const [status, setStatus] = useState(initialItem?.status ?? "aktif");
  const [labelSekolah, setLabelSekolah] = useState(initialItem?.labelSekolah ?? "");
  const [berlakuSemuaKelas, setBerlakuSemuaKelas] = useState(initialItem?.berlakuSemuaKelas ?? true);
  const [selectedKelasIds, setSelectedKelasIds] = useState<string[]>(initialItem?.kelasIds ?? []);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function toggleKelas(kelasId: string) {
    setSelectedKelasIds((prev) =>
      prev.includes(kelasId) ? prev.filter((id) => id !== kelasId) : [...prev, kelasId],
    );
  }

  const campaignSelectOptions = [
    { label: "Tidak terkait campaign iklan (opsional)", value: "" },
    ...campaignOptions.map((c) => ({ label: c.namaCampaign, value: c.id })),
  ];

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);

    if (!berlakuSemuaKelas && selectedKelasIds.length === 0) {
      setSubmitError('Pilih minimal 1 Kelas kalau toggle "Berlaku untuk Semua Kelas" dimatikan.');
      return;
    }

    setIsSubmitting(true);

    const payload = {
      kode: kode.trim().toUpperCase(),
      tipeDiskon,
      nilaiDiskon: Number(nilaiDiskon),
      tanggalMulai: tanggalMulai || null,
      tanggalSelesai: tanggalSelesai || null,
      kuotaPemakaian: kuotaPemakaian || null,
      campaignTerkaitId: campaignTerkaitId || null,
      status,
      labelSekolah: labelSekolah.trim() || null,
      berlakuSemuaKelas,
      kelasIds: berlakuSemuaKelas ? [] : selectedKelasIds,
    };

    try {
      const url = initialItem ? `/api/kode-promo/${initialItem.id}` : "/api/kode-promo";
      const method = initialItem ? "PATCH" : "POST";
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        setSubmitError(json.error ?? "Gagal menyimpan kode promo. Coba lagi nanti.");
        setIsSubmitting(false);
        return;
      }

      const campaignNama = campaignOptions.find((c) => c.id === campaignTerkaitId)?.namaCampaign ?? null;
      const kelasNama = payload.kelasIds
        .map((id) => kelasOptions.find((k) => k.id === id)?.nama)
        .filter((nama): nama is string => Boolean(nama));

      onSuccess({
        id: initialItem?.id ?? (json.id as string),
        kode: payload.kode,
        tipeDiskon,
        nilaiDiskon: Number(nilaiDiskon),
        tanggalMulai: payload.tanggalMulai,
        tanggalSelesai: payload.tanggalSelesai,
        kuotaPemakaian: payload.kuotaPemakaian ? Number(payload.kuotaPemakaian) : null,
        jumlahTerpakai: initialItem?.jumlahTerpakai ?? 0,
        status,
        campaignTerkaitId: payload.campaignTerkaitId,
        campaignTerkaitNama: campaignNama,
        labelSekolah: payload.labelSekolah,
        berlakuSemuaKelas: payload.berlakuSemuaKelas,
        kelasIds: payload.kelasIds,
        kelasNama,
      });
      setIsSubmitting(false);
    } catch {
      setSubmitError("Gagal terhubung ke server. Periksa koneksi internet kamu.");
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-black">{initialItem ? "Edit Kode Promo" : "Buat Kode Promo"}</h2>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-black">Kode</label>
        <InputField
          type="text"
          size="md"
          required
          value={kode}
          onChange={(e) => setKode(e.target.value.toUpperCase())}
          placeholder="Mis. MERDEKA17"
          className="uppercase"
        />
        <p className="text-xs text-[#7E7C7C]">Otomatis disimpan dalam huruf kapital dan wajib unik.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-black">Tipe Diskon</label>
          <InputField
            type="dropdown"
            size="md"
            placeholder="Pilih tipe"
            required
            value={tipeDiskon}
            onChange={(e) => setTipeDiskon(e.target.value)}
            options={TIPE_DISKON_OPTIONS}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-black">
            Nilai Diskon {tipeDiskon === "persen" ? "(%)" : tipeDiskon === "nominal" ? "(Rp)" : ""}
          </label>
          <InputField
            type="text"
            size="md"
            inputMode="decimal"
            required
            value={nilaiDiskon}
            onChange={(e) => setNilaiDiskon(e.target.value.replace(/[^0-9.]/g, ""))}
            placeholder={tipeDiskon === "persen" ? "Mis. 17 (maks. 100)" : "Mis. 50000"}
          />
        </div>
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
        Kosongkan keduanya kalau promo aktif tanpa batas waktu selama status masih Aktif.
      </p>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-black">Kuota Pemakaian (opsional)</label>
        <InputField
          type="text"
          size="md"
          inputMode="numeric"
          value={kuotaPemakaian}
          onChange={(e) => setKuotaPemakaian(e.target.value.replace(/[^0-9]/g, ""))}
          placeholder="Kosongkan kalau tidak terbatas"
        />
      </div>

      <div className="flex flex-col gap-2 rounded-[16px] border border-[#E3E3E3] p-3.5">
        <div className="flex items-center justify-between gap-3">
          <label className="text-sm font-medium text-black">Berlaku untuk Semua Kelas</label>
          <Toggle
            checked={berlakuSemuaKelas}
            onChange={() => setBerlakuSemuaKelas((prev) => !prev)}
            label="Berlaku untuk Semua Kelas"
          />
        </div>
        {berlakuSemuaKelas ? (
          <p className="text-xs text-[#7E7C7C]">Kode ini bisa dipakai untuk pembelian Kelas apa saja.</p>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-[#7E7C7C]">Pilih Kelas yang boleh pakai kode ini (wajib minimal 1):</p>
            {kelasOptions.length === 0 ? (
              <p className="text-xs text-[#E70A0A]">Belum ada data Kelas.</p>
            ) : (
              <div className="flex max-h-48 flex-col gap-1.5 overflow-y-auto rounded-[12px] border border-[#E3E3E3] p-2.5">
                {kelasOptions.map((kelas) => (
                  <label
                    key={kelas.id}
                    className="flex items-center gap-2 rounded-[8px] px-1.5 py-1 text-sm text-black hover:bg-gray-50"
                  >
                    <input
                      type="checkbox"
                      checked={selectedKelasIds.includes(kelas.id)}
                      onChange={() => toggleKelas(kelas.id)}
                      className="size-4 accent-[#081EEA]"
                    />
                    {kelas.nama}
                  </label>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-black">Label Sekolah (opsional)</label>
        <InputField
          type="text"
          size="md"
          value={labelSekolah}
          onChange={(e) => setLabelSekolah(e.target.value)}
          placeholder="Mis. SMAN 1 Purwokerto"
        />
        <p className="text-xs text-[#7E7C7C]">
          Ini CUMA catatan buat kamu sendiri (mis. &quot;SMAN 1 Purwokerto&quot;), TIDAK dicek otomatis ke data
          siswa — scoping ke sekolah tertentu dilakukan dengan cara kamu bagikan kode ini cuma ke siswa sekolah itu
          saat sosialisasi.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-black">Campaign Terkait (opsional)</label>
        <InputField
          type="dropdown"
          size="md"
          value={campaignTerkaitId}
          onChange={(e) => setCampaignTerkaitId(e.target.value)}
          options={campaignSelectOptions}
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
        <p className="text-xs text-[#7E7C7C]">Ubah ke Nonaktif kapan saja untuk hentikan promo lebih awal tanpa hapus datanya.</p>
      </div>

      {submitError ? <p className="text-sm text-[#E70A0A]">{submitError}</p> : null}

      <div className="flex gap-3 pt-2">
        <Button type="button" variant="secondary" size="md" className="flex-1" onClick={onCancel} disabled={isSubmitting}>
          Batal
        </Button>
        <Button type="submit" variant="primary" size="md" className="flex-1" disabled={isSubmitting}>
          {isSubmitting ? "Menyimpan..." : initialItem ? "Simpan Perubahan" : "Buat Kode Promo"}
        </Button>
      </div>
    </form>
  );
}
