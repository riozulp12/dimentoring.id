"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import KelolaKelasForm from "./KelolaKelasForm";
import { TINGKAT_KELAS_LABEL, TIPE_KELAS_LABEL, PROGRAM_KATEGORI_LABEL } from "@/lib/shared/kelasLabels";
import type { ProgramKategori } from "@/lib/shared/kelasLabels";
import type { KelasListItem, MentorOption, SubtesOption } from "@/lib/admin/getKelolaKelasData";

/**
 * List + Detail (read-only, dengan tombol Edit/Hapus sejajar) + Tambah/Edit
 * (Modal + KelolaKelasForm) + Hapus (dengan cek enrollments aktif) — PRD
 * Bagian 7.5 & 7.5.3 (Admin, Kelola Kelas). Klik baris buka DETAIL dulu
 * (bukan langsung form edit) — form edit baru terbuka lewat tombol "Edit"
 * di dalam detail itu.
 */

function formatRupiah(value: number): string {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}

export default function KelolaKelasClient({
  initialKelasList,
  subtesOptions,
  mentorOptions,
}: {
  initialKelasList: KelasListItem[];
  subtesOptions: SubtesOption[];
  mentorOptions: MentorOption[];
}) {
  const [kelasList, setKelasList] = useState(initialKelasList);
  const [formOpen, setFormOpen] = useState(false);
  const [editingKelas, setEditingKelas] = useState<KelasListItem | null>(null);
  const [detailKelas, setDetailKelas] = useState<KelasListItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<KelasListItem | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  function openAddForm() {
    setEditingKelas(null);
    setFormOpen(true);
  }

  function openEditForm(kelas: KelasListItem) {
    setDetailKelas(null);
    setEditingKelas(kelas);
    setFormOpen(true);
  }

  function handleFormSuccess(kelas: KelasListItem) {
    setKelasList((prev) => {
      const exists = prev.some((k) => k.id === kelas.id);
      if (exists) return prev.map((k) => (k.id === kelas.id ? kelas : k));
      return [kelas, ...prev];
    });
    setFormOpen(false);
    setEditingKelas(null);
  }

  function openDeleteConfirm(kelas: KelasListItem) {
    setDetailKelas(null);
    setDeleteTarget(kelas);
    setDeleteError(null);
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const response = await fetch(`/api/kelola-kelas/${deleteTarget.id}`, { method: "DELETE" });
      const json = await response.json();
      if (!response.ok || !json.success) {
        setDeleteError(json.error ?? "Gagal menghapus kelas. Coba lagi nanti.");
        setIsDeleting(false);
        return;
      }
      setKelasList((prev) => prev.filter((k) => k.id !== deleteTarget.id));
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
          + Tambah Kelas
        </Button>
      </div>

      {kelasList.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-12 text-center">
          <p className="text-base text-[#7E7C7C]">Belum ada kelas. Klik &quot;Tambah Kelas&quot; untuk mulai.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr className="border-b border-[#E3E3E3] text-[#7E7C7C]">
                <th className="px-4 py-3 font-medium">Nama Kelas</th>
                <th className="px-4 py-3 font-medium">Kategori</th>
                <th className="px-4 py-3 font-medium">Tingkat</th>
                <th className="px-4 py-3 font-medium">Tipe</th>
                <th className="px-4 py-3 font-medium">Subtes</th>
                <th className="px-4 py-3 font-medium">Mentor</th>
                <th className="px-4 py-3 font-medium">Siswa</th>
                <th className="px-4 py-3 font-medium">Harga</th>
              </tr>
            </thead>
            <tbody>
              {kelasList.map((kelas) => (
                <tr
                  key={kelas.id}
                  onClick={() => setDetailKelas(kelas)}
                  className="cursor-pointer border-b border-[#E3E3E3] transition-colors last:border-0 hover:bg-gray-50"
                >
                  <td className="px-4 py-3 text-black">{kelas.nama}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-[#7E7C7C]">
                    {PROGRAM_KATEGORI_LABEL[kelas.programKategori as ProgramKategori] ?? kelas.programKategori}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-[#7E7C7C]">
                    {TINGKAT_KELAS_LABEL[kelas.tingkatKelas] ?? kelas.tingkatKelas}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-[#7E7C7C]">
                    {TIPE_KELAS_LABEL[kelas.tipeKelas] ?? kelas.tipeKelas}
                  </td>
                  <td className="px-4 py-3 text-[#7E7C7C]">{kelas.subtesNama}</td>
                  <td className="px-4 py-3 text-[#7E7C7C]">{kelas.mentorNama ?? "Belum ada mentor"}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-[#7E7C7C]">
                    {kelas.jumlahSiswa}/{kelas.kapasitas}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-[#7E7C7C]">{formatRupiah(kelas.harga)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={detailKelas !== null} onClose={() => setDetailKelas(null)}>
        {detailKelas ? (
          <div className="flex flex-col gap-4">
            <h2 className="text-lg font-semibold text-black">{detailKelas.nama}</h2>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-[#7E7C7C]">Kategori Program</p>
                <p className="text-black">
                  {PROGRAM_KATEGORI_LABEL[detailKelas.programKategori as ProgramKategori] ?? detailKelas.programKategori}
                </p>
              </div>
              <div>
                <p className="text-[#7E7C7C]">Tingkat Kelas</p>
                <p className="text-black">{TINGKAT_KELAS_LABEL[detailKelas.tingkatKelas] ?? detailKelas.tingkatKelas}</p>
              </div>
              <div>
                <p className="text-[#7E7C7C]">Tipe Kelas</p>
                <p className="text-black">{TIPE_KELAS_LABEL[detailKelas.tipeKelas] ?? detailKelas.tipeKelas}</p>
              </div>
              <div>
                <p className="text-[#7E7C7C]">Subtes</p>
                <p className="text-black">{detailKelas.subtesNama}</p>
              </div>
              <div>
                <p className="text-[#7E7C7C]">Mentor</p>
                <p className="text-black">{detailKelas.mentorNama ?? "Belum ada mentor"}</p>
              </div>
              <div>
                <p className="text-[#7E7C7C]">Siswa Terdaftar</p>
                <p className="text-black">
                  {detailKelas.jumlahSiswa}/{detailKelas.kapasitas}
                </p>
              </div>
              <div>
                <p className="text-[#7E7C7C]">Harga</p>
                <p className="text-black">{formatRupiah(detailKelas.harga)}</p>
              </div>
              <div className="col-span-2">
                <p className="text-[#7E7C7C]">Jadwal</p>
                {detailKelas.jadwalEntries.length === 0 ? (
                  <p className="text-black">Jadwal belum diatur</p>
                ) : (
                  <div className="flex flex-col gap-0.5">
                    {detailKelas.jadwalEntries.map((entry, index) => (
                      <p key={index} className="text-black">
                        {entry.hari}, {entry.jamMulai} WIB
                      </p>
                    ))}
                  </div>
                )}
              </div>
              <div className="col-span-2">
                <p className="text-[#7E7C7C]">Link Meet</p>
                {detailKelas.linkMeet ? (
                  <a
                    href={detailKelas.linkMeet}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="break-all text-[#081EEA] underline"
                  >
                    {detailKelas.linkMeet}
                  </a>
                ) : (
                  <p className="text-black">Belum diatur</p>
                )}
              </div>
              <div className="col-span-2">
                <p className="text-[#7E7C7C]">Deskripsi</p>
                <p className="whitespace-pre-wrap text-black">{detailKelas.deskripsi ?? "Belum ada deskripsi."}</p>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="button" variant="secondary" size="md" className="flex-1" onClick={() => openDeleteConfirm(detailKelas)}>
                Hapus
              </Button>
              <Button type="button" variant="primary" size="md" className="flex-1" onClick={() => openEditForm(detailKelas)}>
                Edit
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal open={formOpen} onClose={() => setFormOpen(false)}>
        <KelolaKelasForm
          subtesOptions={subtesOptions}
          mentorOptions={mentorOptions}
          initialKelas={editingKelas ?? undefined}
          onSuccess={handleFormSuccess}
          onCancel={() => setFormOpen(false)}
        />
      </Modal>

      <Modal open={deleteTarget !== null} onClose={() => setDeleteTarget(null)}>
        {deleteTarget ? (
          <div className="flex flex-col gap-4">
            <p className="text-lg font-semibold text-black">Yakin hapus kelas &quot;{deleteTarget.nama}&quot;?</p>
            <p className="text-sm text-[#7E7C7C]">Siswa yang sudah terdaftar akan kehilangan akses.</p>
            {deleteTarget.jumlahSiswa > 0 ? (
              <p className="rounded-[16px] bg-[#FFEBEB] px-4 py-3 text-sm text-[#E70A0A]">
                Kelas ini masih punya {deleteTarget.jumlahSiswa} siswa terdaftar (lunas). Kelas tidak bisa dihapus
                sebelum siswa dipindahkan atau dibatalkan dari kelas ini.
              </p>
            ) : null}
            {deleteError ? <p className="text-sm text-[#E70A0A]">{deleteError}</p> : null}
            <div className="flex gap-3">
              <Button type="button" variant="secondary" size="md" className="flex-1" onClick={() => setDeleteTarget(null)}>
                Batal
              </Button>
              <Button
                type="button"
                variant="primary"
                size="md"
                className="flex-1"
                disabled={deleteTarget.jumlahSiswa > 0 || isDeleting}
                onClick={handleConfirmDelete}
              >
                {isDeleting ? "Menghapus..." : "Hapus Kelas"}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
