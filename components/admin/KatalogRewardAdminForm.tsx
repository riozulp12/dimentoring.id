"use client";

import { useState, type FormEvent } from "react";
import InputField from "@/components/ui/InputField";
import Button from "@/components/ui/Button";
import type { RewardCatalogAdminItem } from "@/lib/admin/getKatalogRewardData";

/**
 * Form Tambah/Edit Katalog Reward — SATU komponen dipakai kedua mode
 * (initialItem ada = edit, tidak ada = tambah), pola sama dengan
 * KontenInfoAdminForm.tsx/KodePromoForm.tsx. PRD Bagian 13 (reward_catalog),
 * BR-13 (Stok/Anggaran wajib diisi sebagai cap, tidak boleh tanpa batas).
 */

export default function KatalogRewardAdminForm({
  initialItem,
  onSuccess,
  onCancel,
}: {
  initialItem?: RewardCatalogAdminItem;
  onSuccess: (item: RewardCatalogAdminItem) => void;
  onCancel: () => void;
}) {
  const [namaReward, setNamaReward] = useState(initialItem?.namaReward ?? "");
  const [biayaPoin, setBiayaPoin] = useState(initialItem ? String(initialItem.biayaPoin) : "");
  const [stok, setStok] = useState(initialItem ? String(initialItem.stokAtauAnggaranTersisa) : "");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);
    setIsSubmitting(true);

    const payload = {
      namaReward: namaReward.trim(),
      biayaPoin: Number(biayaPoin),
      stokAtauAnggaranTersisa: Number(stok),
    };

    try {
      const url = initialItem ? `/api/kelola-konten/reward-catalog/${initialItem.id}` : "/api/kelola-konten/reward-catalog";
      const method = initialItem ? "PATCH" : "POST";
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        setSubmitError(json.error ?? "Gagal menyimpan reward. Coba lagi nanti.");
        setIsSubmitting(false);
        return;
      }

      onSuccess({
        id: initialItem?.id ?? (json.id as string),
        namaReward: payload.namaReward,
        biayaPoin: payload.biayaPoin,
        stokAtauAnggaranTersisa: payload.stokAtauAnggaranTersisa,
      });
      setIsSubmitting(false);
    } catch {
      setSubmitError("Gagal terhubung ke server. Periksa koneksi internet kamu.");
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-black">{initialItem ? "Edit Reward" : "Tambah Reward"}</h2>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-black">Nama Reward</label>
        <InputField
          type="text"
          size="md"
          required
          value={namaReward}
          onChange={(e) => setNamaReward(e.target.value)}
          placeholder="mis. Saldo Rp 25.000"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-black">Biaya Poin</label>
          <input
            type="number"
            min={1}
            required
            value={biayaPoin}
            onChange={(e) => setBiayaPoin(e.target.value)}
            className="w-full rounded-[16px] border border-[#AFAFAF] bg-white px-4 py-2.5 text-sm text-black outline-none transition-colors focus:border-black"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-black">Stok/Anggaran Tersisa</label>
          <input
            type="number"
            min={0}
            required
            value={stok}
            onChange={(e) => setStok(e.target.value)}
            className="w-full rounded-[16px] border border-[#AFAFAF] bg-white px-4 py-2.5 text-sm text-black outline-none transition-colors focus:border-black"
          />
        </div>
      </div>
      <p className="text-xs text-[#7E7C7C]">
        BR-13: kolom ini wajib diisi sebagai batas atas (cap) — reward tidak bisa ditukar tanpa batas.
      </p>

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
          {isSubmitting ? "Menyimpan..." : initialItem ? "Simpan Perubahan" : "Tambah Reward"}
        </Button>
      </div>
    </form>
  );
}
