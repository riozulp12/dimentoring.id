"use client";

import { useMemo, useState } from "react";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import InputField from "@/components/ui/InputField";
import KontenInfoAdminForm from "./KontenInfoAdminForm";
import { formatDeadline } from "@/lib/shared/formatDeadline";
import {
  KONTEN_INFO_STATUS_BADGE_CLASS,
  KONTEN_INFO_STATUS_LABEL,
  KONTEN_INFO_TIPE_BADGE_CLASS,
  KONTEN_INFO_TIPE_LABEL,
} from "@/lib/shared/kontenInfoLabels";
import type { KontenInfoAdminItem } from "@/lib/admin/getKelolaKontenData";

/**
 * Tab "Info Beasiswa & Event" (Admin) — CRUD penuh konten_info, PRD Bagian
 * 13. Search/filter murni client-side (pola sama dengan KelolaKelasClient.tsx
 * & BeasiswaEventListClient.tsx), tambah/edit lewat Modal + form yang sama,
 * hapus dengan konfirmasi dulu.
 */

type TipeFilter = "semua" | "beasiswa" | "internship" | "webinar" | "workshop" | "event";
type StatusFilter = "semua" | "aktif" | "ditutup";

// Tab tipe REUSE KONTEN_INFO_TIPE_LABEL (satu-satunya sumber daftar tipe)
// supaya tab admin ini otomatis ikut nambah kalau tipe baru ditambahkan lagi.
const TIPE_TABS: { key: TipeFilter; label: string }[] = [
  { key: "semua", label: "Semua" },
  ...Object.entries(KONTEN_INFO_TIPE_LABEL).map(([key, label]) => ({ key: key as TipeFilter, label })),
];

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: "semua", label: "Semua" },
  { key: "aktif", label: "Aktif" },
  { key: "ditutup", label: "Ditutup" },
];

export default function KontenInfoAdminList({ initialItems }: { initialItems: KontenInfoAdminItem[] }) {
  const [items, setItems] = useState(initialItems);
  const [search, setSearch] = useState("");
  const [tipeFilter, setTipeFilter] = useState<TipeFilter>("semua");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("semua");
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<KontenInfoAdminItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<KontenInfoAdminItem | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (q && !item.judul.toLowerCase().includes(q)) return false;
      if (tipeFilter !== "semua" && item.tipe !== tipeFilter) return false;
      if (statusFilter !== "semua" && item.status !== statusFilter) return false;
      return true;
    });
  }, [items, search, tipeFilter, statusFilter]);

  function openAddForm() {
    setEditingItem(null);
    setFormOpen(true);
  }

  function openEditForm(item: KontenInfoAdminItem) {
    setEditingItem(item);
    setFormOpen(true);
  }

  function handleFormSuccess(item: KontenInfoAdminItem) {
    setItems((prev) => {
      const exists = prev.some((i) => i.id === item.id);
      if (exists) return prev.map((i) => (i.id === item.id ? item : i));
      return [item, ...prev];
    });
    setFormOpen(false);
    setEditingItem(null);
  }

  function openDeleteConfirm(item: KontenInfoAdminItem) {
    setDeleteTarget(item);
    setDeleteError(null);
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const response = await fetch(`/api/kelola-konten/info/${deleteTarget.id}`, { method: "DELETE" });
      const json = await response.json();
      if (!response.ok || !json.success) {
        setDeleteError(json.error ?? "Gagal menghapus info. Coba lagi nanti.");
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-md flex-1">
          <InputField
            type="text"
            size="md"
            placeholder="Cari judul..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button type="button" variant="primary" size="md" onClick={openAddForm}>
          + Tambah Info
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2 border-b border-[#E3E3E3] sm:border-b-0">
          {TIPE_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTipeFilter(t.key)}
              className={`px-3 py-2 text-sm font-medium transition-colors ${
                tipeFilter === t.key
                  ? "border-b-2 border-[#081EEA] text-[#081EEA]"
                  : "text-[#7E7C7C] hover:text-black"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {STATUS_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setStatusFilter(t.key)}
              className={`rounded-full border px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors ${
                statusFilter === t.key
                  ? "border-[#081EEA] bg-[#F9FAFF] text-[#081EEA]"
                  : "border-[#E3E3E3] text-[#7E7C7C] hover:border-[#081EEA] hover:text-[#081EEA]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-12 text-center">
          <p className="text-base text-[#7E7C7C]">
            {items.length === 0
              ? 'Belum ada info Beasiswa/Internship/Event. Klik "Tambah Info" untuk mulai.'
              : "Tidak ada info yang cocok dengan pencarian/filter."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-[#E3E3E3] text-[#7E7C7C]">
                <th className="px-4 py-3 font-medium">Judul</th>
                <th className="px-4 py-3 font-medium">Tipe</th>
                <th className="px-4 py-3 font-medium">Deadline</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id} className="border-b border-[#E3E3E3] last:border-0">
                  <td className="px-4 py-3 text-black">{item.judul}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        KONTEN_INFO_TIPE_BADGE_CLASS[item.tipe] ?? "bg-gray-100 text-[#7E7C7C]"
                      }`}
                    >
                      {KONTEN_INFO_TIPE_LABEL[item.tipe] ?? item.tipe}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-[#7E7C7C]">{formatDeadline(item.deadline)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        KONTEN_INFO_STATUS_BADGE_CLASS[item.status] ?? "bg-gray-100 text-[#7E7C7C]"
                      }`}
                    >
                      {KONTEN_INFO_STATUS_LABEL[item.status] ?? item.status}
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
        <KontenInfoAdminForm
          initialItem={editingItem ?? undefined}
          onSuccess={handleFormSuccess}
          onCancel={() => setFormOpen(false)}
        />
      </Modal>

      <Modal open={deleteTarget !== null} onClose={() => setDeleteTarget(null)}>
        {deleteTarget ? (
          <div className="flex flex-col gap-4">
            <p className="text-lg font-semibold text-black">Yakin hapus info &quot;{deleteTarget.judul}&quot;?</p>
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
