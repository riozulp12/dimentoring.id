"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import KodePromoForm from "./KodePromoForm";
import {
  PROMO_STATUS_BADGE_CLASS,
  PROMO_STATUS_LABEL,
  formatBerlakuUntuk,
  formatKuota,
  formatNilaiDiskon,
  formatPeriode,
} from "@/lib/shared/kodePromoLabels";
import type { CampaignOption, KelasOption, KodePromoListItem } from "@/lib/admin/getKodePromoData";

/**
 * List + Tambah/Edit (Modal + KodePromoForm, klik baris langsung buka form
 * edit) + Hapus (dengan konfirmasi) — PRD Bagian 13 (kode_promo). Beda dari
 * KelolaKelasClient.tsx: tidak ada detail modal terpisah, klik baris LANGSUNG
 * ke form edit sesuai spec fitur ini.
 */

export default function KodePromoClient({
  initialKodePromoList,
  campaignOptions,
  kelasOptions,
}: {
  initialKodePromoList: KodePromoListItem[];
  campaignOptions: CampaignOption[];
  kelasOptions: KelasOption[];
}) {
  const [kodePromoList, setKodePromoList] = useState(initialKodePromoList);
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<KodePromoListItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<KodePromoListItem | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  function openAddForm() {
    setEditingItem(null);
    setFormOpen(true);
  }

  function openEditForm(item: KodePromoListItem) {
    setEditingItem(item);
    setFormOpen(true);
  }

  function handleFormSuccess(item: KodePromoListItem) {
    setKodePromoList((prev) => {
      const exists = prev.some((k) => k.id === item.id);
      if (exists) return prev.map((k) => (k.id === item.id ? item : k));
      return [item, ...prev];
    });
    setFormOpen(false);
    setEditingItem(null);
  }

  function openDeleteConfirm(item: KodePromoListItem) {
    setDeleteTarget(item);
    setDeleteError(null);
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const response = await fetch(`/api/kode-promo/${deleteTarget.id}`, { method: "DELETE" });
      const json = await response.json();
      if (!response.ok || !json.success) {
        setDeleteError(json.error ?? "Gagal menghapus kode promo. Coba lagi nanti.");
        setIsDeleting(false);
        return;
      }
      setKodePromoList((prev) => prev.filter((k) => k.id !== deleteTarget.id));
      setDeleteTarget(null);
      setIsDeleting(false);
    } catch {
      setDeleteError("Gagal terhubung ke server. Periksa koneksi internet kamu.");
      setIsDeleting(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-end">
        <Button type="button" variant="primary" size="md" onClick={openAddForm}>
          + Buat Kode Promo
        </Button>
      </div>

      {kodePromoList.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-12 text-center">
          <p className="text-base text-[#7E7C7C]">
            Belum ada kode promo. Klik &quot;Buat Kode Promo&quot; untuk membuat yang pertama.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white">
          <table className="w-full min-w-[1200px] text-left text-sm">
            <thead>
              <tr className="border-b border-[#E3E3E3] text-[#7E7C7C]">
                <th className="px-4 py-3 font-medium">Kode</th>
                <th className="px-4 py-3 font-medium">Diskon</th>
                <th className="px-4 py-3 font-medium">Periode Berlaku</th>
                <th className="px-4 py-3 font-medium">Kuota</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Berlaku untuk</th>
                <th className="px-4 py-3 font-medium">Sekolah</th>
                <th className="px-4 py-3 font-medium">Campaign Terkait</th>
                <th className="px-4 py-3 font-medium">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {kodePromoList.map((item) => (
                <tr
                  key={item.id}
                  onClick={() => openEditForm(item)}
                  className="cursor-pointer border-b border-[#E3E3E3] transition-colors last:border-0 hover:bg-gray-50"
                >
                  <td className="px-4 py-3 font-medium text-black">{item.kode}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-[#7E7C7C]">
                    {formatNilaiDiskon(item.tipeDiskon, item.nilaiDiskon)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-[#7E7C7C]">
                    {formatPeriode(item.tanggalMulai, item.tanggalSelesai)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-[#7E7C7C]">
                    {formatKuota(item.kuotaPemakaian, item.jumlahTerpakai)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        PROMO_STATUS_BADGE_CLASS[item.status] ?? "bg-gray-100 text-[#7E7C7C]"
                      }`}
                    >
                      {PROMO_STATUS_LABEL[item.status] ?? item.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-[#7E7C7C]">
                    {formatBerlakuUntuk(item.berlakuSemuaKelas, item.kelasNama)}
                  </td>
                  <td className="px-4 py-3 text-[#7E7C7C]">{item.labelSekolah ?? "-"}</td>
                  <td className="px-4 py-3 text-[#7E7C7C]">{item.campaignTerkaitNama ?? "-"}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        openDeleteConfirm(item);
                      }}
                      className="rounded-lg border border-[#FFEBEB] px-3 py-1.5 text-sm font-medium text-[#E70A0A] transition-colors hover:bg-[#FFEBEB]"
                    >
                      Hapus
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={formOpen} onClose={() => setFormOpen(false)}>
        <KodePromoForm
          campaignOptions={campaignOptions}
          kelasOptions={kelasOptions}
          initialItem={editingItem ?? undefined}
          onSuccess={handleFormSuccess}
          onCancel={() => setFormOpen(false)}
        />
      </Modal>

      <Modal open={deleteTarget !== null} onClose={() => setDeleteTarget(null)}>
        {deleteTarget ? (
          <div className="flex flex-col gap-4">
            <p className="text-lg font-semibold text-black">Yakin hapus kode promo &quot;{deleteTarget.kode}&quot;?</p>
            <p className="text-sm text-[#7E7C7C]">Tindakan ini tidak bisa dibatalkan.</p>
            {deleteError ? <p className="text-sm text-[#E70A0A]">{deleteError}</p> : null}
            <div className="flex gap-3">
              <Button
                type="button"
                variant="secondary"
                size="md"
                className="flex-1"
                onClick={() => setDeleteTarget(null)}
              >
                Batal
              </Button>
              <Button
                type="button"
                variant="primary"
                size="md"
                className="flex-1"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
              >
                {isDeleting ? "Menghapus..." : "Hapus"}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
