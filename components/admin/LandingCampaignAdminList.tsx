"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import LandingCampaignAdminForm from "./LandingCampaignAdminForm";
import { formatDeadline } from "@/lib/shared/formatDeadline";
import type { LandingCampaignAdminItem } from "@/lib/admin/getKelolaKontenData";

/**
 * Tab "Banner Campaign" (Admin) — CRUD penuh landing_campaign, PRD Bagian 13
 * (landing_campaign — BARU). Pola sama dengan KontenInfoAdminList.tsx:
 * tambah/edit lewat Modal + form yang sama, hapus dengan konfirmasi dulu.
 */

const STATUS_LABEL: Record<string, string> = { aktif: "Aktif", nonaktif: "Nonaktif" };
const STATUS_BADGE_CLASS: Record<string, string> = {
  aktif: "bg-[#E6F9EE] text-[#0F9D58]",
  nonaktif: "bg-gray-100 text-[#7E7C7C]",
};

function formatPeriode(mulai: string | null, selesai: string | null): string {
  if (!mulai && !selesai) return "Tanpa batas waktu";
  if (mulai && !selesai) return `Mulai ${formatDeadline(mulai)}`;
  if (!mulai && selesai) return `Sampai ${formatDeadline(selesai)}`;
  return `${formatDeadline(mulai)} – ${formatDeadline(selesai)}`;
}

export default function LandingCampaignAdminList({ initialItems }: { initialItems: LandingCampaignAdminItem[] }) {
  const [items, setItems] = useState(initialItems);
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<LandingCampaignAdminItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LandingCampaignAdminItem | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  function openAddForm() {
    setEditingItem(null);
    setFormOpen(true);
  }

  function openEditForm(item: LandingCampaignAdminItem) {
    setEditingItem(item);
    setFormOpen(true);
  }

  function handleFormSuccess(item: LandingCampaignAdminItem) {
    setItems((prev) => {
      const exists = prev.some((i) => i.id === item.id);
      if (exists) return prev.map((i) => (i.id === item.id ? item : i));
      return [item, ...prev];
    });
    setFormOpen(false);
    setEditingItem(null);
  }

  function openDeleteConfirm(item: LandingCampaignAdminItem) {
    setDeleteTarget(item);
    setDeleteError(null);
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const response = await fetch(`/api/kelola-konten/campaign/${deleteTarget.id}`, { method: "DELETE" });
      const json = await response.json();
      if (!response.ok || !json.success) {
        setDeleteError(json.error ?? "Gagal menghapus campaign. Coba lagi nanti.");
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
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-[#7E7C7C]">
          Cuma 1 campaign aktif (paling baru dibuat) yang tampil di landing page — popup dulu, baru banner.
        </p>
        <Button type="button" variant="primary" size="md" onClick={openAddForm}>
          + Buat Campaign
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-12 text-center">
          <p className="text-base text-[#7E7C7C]">Belum ada Banner Campaign. Klik &quot;Buat Campaign&quot; untuk mulai.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-[#E3E3E3] text-[#7E7C7C]">
                <th className="px-4 py-3 font-medium">Judul</th>
                <th className="px-4 py-3 font-medium">Link Tujuan</th>
                <th className="px-4 py-3 font-medium">Periode Tayang</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-[#E3E3E3] last:border-0">
                  <td className="px-4 py-3 text-black">{item.judul}</td>
                  <td className="max-w-[220px] px-4 py-3">
                    <a
                      href={item.linkTujuan}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block truncate text-[#081EEA] hover:underline"
                    >
                      {item.linkTujuan}
                    </a>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-[#7E7C7C]">
                    {formatPeriode(item.tanggalMulai, item.tanggalSelesai)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        STATUS_BADGE_CLASS[item.status] ?? "bg-gray-100 text-[#7E7C7C]"
                      }`}
                    >
                      {STATUS_LABEL[item.status] ?? item.status}
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
        <LandingCampaignAdminForm
          initialItem={editingItem ?? undefined}
          onSuccess={handleFormSuccess}
          onCancel={() => setFormOpen(false)}
        />
      </Modal>

      <Modal open={deleteTarget !== null} onClose={() => setDeleteTarget(null)}>
        {deleteTarget ? (
          <div className="flex flex-col gap-4">
            <p className="text-lg font-semibold text-black">Yakin hapus campaign &quot;{deleteTarget.judul}&quot;?</p>
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
