"use client";

import { useId, useState, type FormEvent } from "react";
import InputField from "@/components/ui/InputField";
import Button from "@/components/ui/Button";
import { JALUR_OPTIONS, JENJANG_OPTIONS, RUMPUN_OPTIONS } from "@/lib/shared/ptnJurusanLabels";
import { calculateKeketatan } from "@/lib/assessment/calculatePeluang";
import type { PtnJurusanItem, ProvinsiOption } from "@/lib/admin/getKelolaAssessmentData";

/**
 * Form Tambah/Edit data PTN (ptn_jurusan) — SATU komponen dipakai kedua mode
 * (initialItem ada = edit, tidak ada = tambah), PRD Bagian 7.4.2/BR-28. Nama
 * Universitas pakai text input + <datalist> (bukan dropdown custom) supaya
 * admin bisa pilih dari yang sudah ada ATAU ketik baru sekaligus — cara
 * tercepat untuk kebutuhan ini tanpa komponen combobox baru.
 */

const CURRENT_YEAR = new Date().getFullYear();

export default function PtnJurusanForm({
  universitasOptions,
  provinsiOptions,
  initialItem,
  onSuccess,
  onCancel,
}: {
  universitasOptions: string[];
  provinsiOptions: ProvinsiOption[];
  initialItem?: PtnJurusanItem;
  onSuccess: (item: PtnJurusanItem) => void;
  onCancel: () => void;
}) {
  const datalistId = useId();

  const [namaUniversitas, setNamaUniversitas] = useState(initialItem?.namaUniversitas ?? "");
  const [namaJurusan, setNamaJurusan] = useState(initialItem?.namaJurusan ?? "");
  const [jenjang, setJenjang] = useState(initialItem?.jenjang ?? "");
  const [provinsiId, setProvinsiId] = useState(initialItem?.provinsiId ?? "");
  const [kuota, setKuota] = useState(initialItem ? String(initialItem.kuotaTahunBerjalan) : "");
  const [peminat, setPeminat] = useState(initialItem ? String(initialItem.jumlahPeminatTahunLalu) : "");
  const [jalur, setJalur] = useState(initialItem?.jalur ?? "");
  const [rumpun, setRumpun] = useState(initialItem?.rumpun ?? "");
  const [tahunData, setTahunData] = useState(initialItem ? String(initialItem.tahunData) : String(CURRENT_YEAR));
  const [sumberData, setSumberData] = useState(initialItem?.sumberData ?? "input_manual_admin");
  const [rataRata, setRataRata] = useState(
    initialItem?.rataRataNilaiDiterima !== undefined && initialItem?.rataRataNilaiDiterima !== null
      ? String(initialItem.rataRataNilaiDiterima)
      : "",
  );
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const previewKeketatan =
    kuota && peminat && Number(peminat) > 0 ? calculateKeketatan(Number(kuota), Number(peminat)) : null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);
    setIsSubmitting(true);

    const payload = {
      namaUniversitas,
      namaJurusan,
      jenjang,
      provinsiId,
      kuotaTahunBerjalan: Number(kuota),
      jumlahPeminatTahunLalu: Number(peminat),
      jalur,
      rumpun,
      tahunData: Number(tahunData),
      sumberData,
      rataRataNilaiDiterima: rataRata.trim() ? Number(rataRata) : undefined,
    };

    try {
      const url = initialItem ? `/api/kelola-assessment/${initialItem.id}` : "/api/kelola-assessment";
      const method = initialItem ? "PATCH" : "POST";
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        setSubmitError(json.error ?? "Gagal menyimpan data PTN. Coba lagi nanti.");
        setIsSubmitting(false);
        return;
      }

      const provinsiNama = provinsiOptions.find((p) => p.id === provinsiId)?.nama ?? "-";
      const keketatan = calculateKeketatan(Number(kuota), Number(peminat));

      onSuccess({
        id: initialItem?.id ?? (json.id as string),
        namaUniversitas,
        namaJurusan,
        jenjang,
        provinsiId,
        provinsiNama,
        kuotaTahunBerjalan: Number(kuota),
        jumlahPeminatTahunLalu: Number(peminat),
        keketatanScore: keketatan.score,
        keketatanLabel: keketatan.label,
        jalur,
        rumpun,
        tahunData: Number(tahunData),
        sumberData,
        rataRataNilaiDiterima: rataRata.trim() ? Number(rataRata) : null,
      });
      setIsSubmitting(false);
    } catch {
      setSubmitError("Gagal terhubung ke server. Periksa koneksi internet kamu.");
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-black">{initialItem ? "Edit Data PTN" : "Tambah Data PTN"}</h2>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-black">Nama Universitas</label>
        <input
          list={datalistId}
          required
          value={namaUniversitas}
          onChange={(e) => setNamaUniversitas(e.target.value)}
          placeholder="Mis. Universitas Indonesia"
          className="w-full rounded-[16px] border border-[#AFAFAF] bg-white px-4 py-2.5 text-sm text-black outline-none transition-colors hover:border-[#081EEA] focus:border-black"
        />
        <datalist id={datalistId}>
          {universitasOptions.map((nama) => (
            <option key={nama} value={nama} />
          ))}
        </datalist>
        <p className="text-xs text-[#7E7C7C]">Pilih dari saran yang sudah ada, atau ketik nama baru.</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-black">Nama Jurusan</label>
        <InputField
          type="text"
          size="md"
          required
          value={namaJurusan}
          onChange={(e) => setNamaJurusan(e.target.value)}
          placeholder="Mis. Teknologi Informasi"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-black">Jenjang</label>
          <InputField
            type="dropdown"
            size="md"
            placeholder="Pilih jenjang"
            required
            value={jenjang}
            onChange={(e) => setJenjang(e.target.value)}
            options={JENJANG_OPTIONS}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-black">Provinsi</label>
          <InputField
            type="dropdown"
            size="md"
            placeholder="Pilih provinsi"
            required
            value={provinsiId}
            onChange={(e) => setProvinsiId(e.target.value)}
            options={provinsiOptions.map((p) => ({ label: p.nama, value: p.id }))}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-black">Kuota Tahun Berjalan</label>
          <InputField
            type="text"
            size="md"
            inputMode="numeric"
            required
            value={kuota}
            onChange={(e) => setKuota(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder="Mis. 40"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-black">Jumlah Peminat Tahun Lalu</label>
          <InputField
            type="text"
            size="md"
            inputMode="numeric"
            required
            value={peminat}
            onChange={(e) => setPeminat(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder="Mis. 800"
          />
        </div>
      </div>

      {previewKeketatan ? (
        <p className="text-sm text-[#7E7C7C]">
          Keketatan (dihitung otomatis): <span className="font-medium text-black">{previewKeketatan.score}%</span> (
          {previewKeketatan.label})
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-black">Jalur</label>
          <InputField
            type="dropdown"
            size="md"
            placeholder="Pilih jalur"
            required
            value={jalur}
            onChange={(e) => setJalur(e.target.value)}
            options={JALUR_OPTIONS}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-black">Rumpun</label>
          <InputField
            type="dropdown"
            size="md"
            placeholder="Pilih rumpun"
            required
            value={rumpun}
            onChange={(e) => setRumpun(e.target.value)}
            options={RUMPUN_OPTIONS}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-black">Tahun Data</label>
          <InputField
            type="text"
            size="md"
            inputMode="numeric"
            required
            value={tahunData}
            onChange={(e) => setTahunData(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder={String(CURRENT_YEAR)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-black">Sumber Data</label>
          <InputField
            type="text"
            size="md"
            required
            value={sumberData}
            onChange={(e) => setSumberData(e.target.value)}
            placeholder="input_manual_admin"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-black">Rata-rata Nilai Diterima (opsional)</label>
        <InputField
          type="text"
          size="md"
          inputMode="decimal"
          value={rataRata}
          onChange={(e) => setRataRata(e.target.value.replace(/[^0-9.]/g, ""))}
          placeholder="Mis. 88.5"
        />
      </div>

      {submitError ? <p className="text-sm text-[#E70A0A]">{submitError}</p> : null}

      <div className="flex gap-3 pt-2">
        <Button type="button" variant="secondary" size="md" className="flex-1" onClick={onCancel} disabled={isSubmitting}>
          Batal
        </Button>
        <Button type="submit" variant="primary" size="md" className="flex-1" disabled={isSubmitting}>
          {isSubmitting ? "Menyimpan..." : initialItem ? "Simpan Perubahan" : "Tambah Data PTN"}
        </Button>
      </div>
    </form>
  );
}
