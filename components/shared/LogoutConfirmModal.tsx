"use client";

import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";

/**
 * Konfirmasi "Keluar dari Akun" — SATU implementasi dipakai dropdown menu
 * akun (components/dashboard/AccountMenu.tsx), item "Keluar" Sidebar
 * (components/dashboard/sidebar.tsx), DAN Section 5 halaman Pengaturan,
 * supaya logic logout persis sama di semua tempat (bukan disalin ulang).
 * Navigasi ke app/api/auth/logout/route.ts (GET) — cukup hapus session
 * cookie & redirect, tidak butuh state management tambahan. Layout
 * title+paragraf kiri rata + dua tombol sejajar mengikuti pola modal
 * konfirmasi hapus Kelas di components/admin/KelolaKelasClient.tsx.
 */
export default function LogoutConfirmModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="text-lg font-semibold text-black">Yakin Mau Keluar?</p>
        <p className="text-sm text-[#7E7C7C]">
          Kamu bisa masuk lagi kapan saja pakai email dan password yang sama. Progres belajar dan semua datamu
          tetap aman tersimpan kok.
        </p>
        <div className="flex gap-3">
          <Button type="button" variant="secondary" size="md" className="flex-1" onClick={onClose}>
            Batal
          </Button>
          <Button
            type="button"
            variant="primary"
            size="md"
            className="flex-1"
            onClick={() => {
              window.location.href = "/api/auth/logout";
            }}
          >
            Ya, Keluar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
