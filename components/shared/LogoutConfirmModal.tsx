"use client";

import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";

/**
 * Konfirmasi "Keluar dari Akun" — SATU implementasi dipakai dropdown menu
 * akun (components/dashboard/AccountMenu.tsx) DAN Section 5 halaman
 * Pengaturan, supaya logic logout persis sama di kedua tempat (bukan
 * disalin ulang). Navigasi ke app/api/auth/logout/route.ts (GET) — cukup
 * hapus session cookie & redirect, tidak butuh state management tambahan.
 */
export default function LogoutConfirmModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose}>
      <div className="flex flex-col items-center gap-5 text-center">
        <p className="text-lg font-semibold text-black">Apakah kamu yakin ingin keluar?</p>
        <div className="flex w-full gap-3">
          <Button type="button" variant="secondary" size="md" className="flex-1" onClick={onClose}>
            Tidak
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
            Iya, Yakin
          </Button>
        </div>
      </div>
    </Modal>
  );
}
