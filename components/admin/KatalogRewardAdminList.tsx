"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import KatalogRewardAdminForm from "./KatalogRewardAdminForm";
import type { RewardCatalogAdminItem } from "@/lib/admin/getKatalogRewardData";

/**
 * Sub-tab "Katalog" (di dalam tab "Katalog Reward" Admin) — CRUD penuh
 * reward_catalog, PRD Bagian 13, BR-13. Pola sama dengan KontenInfoAdminList.tsx.
 */
export default function KatalogRewardAdminList({ initialItems }: { initialItems: RewardCatalogAdminItem[] }) {
  const [items, setItems] = useState(initialItems);
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<RewardCatalogAdminItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RewardCatalogAdminItem | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  function openAddForm() {
    setEditingItem(null);
    setFormOpen(true);
  }

  function openEditForm(item: RewardCatalogAdminItem) {
    setEditingItem(item);
    setFormOpen(true);
  }

  function handleFormSuccess(item: RewardCatalogAdminItem) {
    setItems((prev) => {
      const exists = prev.some((i) => i.id === item.id);
      if (exists) return prev.map((i) => (i.id === item.id ? item : i));
      return [item, ...prev];
    });
    setFormOpen(false);
    setEditingItem(null);
  }

  function openDeleteConfirm(item: RewardCatalogAdminItem) {
    setDeleteTarget(item);
    setDeleteError(null);
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const response = await fetch(`/api/kelola-konten/reward-catalog/${deleteTarget.id}`, { method: "DELETE" });
      const json = await response.json();
      if (!response.ok || !json.success) {
        setDeleteError(json.error ?? "Gagal menghapus reward. Coba lagi nanti.");
        setIsDeleting(false);
        return;
      }
      setItems((prev) => prev.filter((i) => i.id !== deleteTarget.id));
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
          + Tambah Reward
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-12 text-center">
          <p className="text-base text-[#7E7C7C]">Belum ada reward di katalog. Klik &quot;Tambah Reward&quot; untuk mulai.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="border-b border-[#E3E3E3] text-[#7E7C7C]">
                <th className="px-4 py-3 font-medium">Nama Reward</th>
                <th className="px-4 py-3 font-medium">Biaya Poin</th>
                <th className="px-4 py-3 font-medium">Sisa Stok/Anggaran</th>
                <th className="px-4 py-3 font-medium">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-[#E3E3E3] last:border-0">
                  <td className="px-4 py-3 text-black">{item.namaReward}</td>
                  <td className="px-4 py-3 text-black">{item.biayaPoin} Poin</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        item.stokAtauAnggaranTersisa > 0 ? "bg-[#F0FDF4] text-[#0CBA00]" : "bg-[#FFEBEB] text-[#E70A0A]"
                      }`}
                    >
                      {item.stokAtauAnggaranTersisa}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openEditForm(item)}
                        className="rounded-lg border border-[#E3E3E3] px-3 py-1.5 text-sm font-medium text-[#7E7C7C] transition-colors hover:bg-gray-50"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => openDeleteConfirm(item)}
                        className="rounded-lg border border-[#FFEBEB] px-3 py-1.5 text-sm font-medium text-[#E70A0A] transition-colors hover:bg-[#FFEBEB]"
                      >
                        Hapus
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={formOpen} onClose={() => setFormOpen(false)}>
        <KatalogRewardAdminForm
          initialItem={editingItem ?? undefined}
          onSuccess={handleFormSuccess}
          onCancel={() => setFormOpen(false)}
        />
      </Modal>

      <Modal open={deleteTarget !== null} onClose={() => setDeleteTarget(null)}>
        {deleteTarget ? (
          <div className="flex flex-col gap-4">
            <p className="text-lg font-semibold text-black">Yakin hapus reward &quot;{deleteTarget.namaReward}&quot;?</p>
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
