"use client";

import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

const tanpaLangganan = () => () => {};
/** true hanya di browser (sesudah hidrasi); false saat render server. */
function useDiBrowser(): boolean {
  return useSyncExternalStore(
    tanpaLangganan,
    () => true,
    () => false,
  );
}

/**
 * Jendela modal bersama.
 *
 * Aksesibilitas: hanya lapisan latar gelap yang aria-hidden (hiasan + area
 * klik untuk menutup). Isi jendela berada di elemen saudara dengan
 * role="dialog" aria-modal="true", jadi tetap terbaca pembaca layar. Beri nama
 * lewat `labelledBy` (id judul) atau `label` (opsional).
 *
 * Fokus: saat dibuka, fokus dipindah ke jendela (kecuali isi jendela sudah
 * memegang fokus, mis. autoFocus); saat ditutup, fokus kembali ke elemen yang
 * tadi aktif (tombol pemicu) bila masih ada. Sengaja TANPA focus trap ketat —
 * elemen di luar jendela (mis. keyboard rumus MathLive di document.body)
 * harus tetap bisa diketuk.
 *
 * Portal (UX-4): isi modal dirender ke document.body lewat createPortal.
 * Elemen position:fixed di dalam leluhur ber-backdrop-filter/transform/filter
 * menempel ke leluhur itu, bukan ke layar — dulu modal hapus di BilahAksi
 * (sticky + backdrop-blur) hanya menutupi bilah aksi. Dengan portal, modal
 * selalu menutupi seluruh layar. Event React tetap merambat lewat pohon
 * komponen seperti biasa. Saat render server / sebelum hidrasi tidak ada apa
 * pun yang dirender (modal selalu dibuka oleh aksi pengguna).
 *
 * Lapisan: z-[60] — di atas navbar/sidebar (z-50) dan bilah aksi (z-10),
 * di bawah keyboard layar MathLive (z-index bawaan 105) supaya keyboard rumus
 * tetap bisa diketuk saat editor rumus terbuka.
 */
export default function Modal({
  open,
  onClose,
  children,
  labelledBy,
  label,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** id elemen judul di dalam jendela (aria-labelledby). */
  labelledBy?: string;
  /** Nama jendela bila tidak ada judul yang terlihat (aria-label). */
  label?: string;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const diBrowser = useDiBrowser();

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !diBrowser) return;
    const sebelumnya = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    if (dialog && !dialog.contains(document.activeElement)) dialog.focus({ preventScroll: true });
    return () => {
      if (sebelumnya?.isConnected) sebelumnya.focus({ preventScroll: true });
    };
  }, [open, diBrowser]);

  if (!open || !diBrowser) return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-label={labelledBy ? undefined : label}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className="modal-content-scrollable relative max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-[24px] bg-white p-6 shadow-[0_8px_32px_rgba(0,0,0,0.2)] outline-none sm:p-8"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Tutup"
          className="absolute right-4 top-4 flex size-8 items-center justify-center rounded-lg text-[#7E7C7C] hover:bg-gray-100"
        >
          <svg viewBox="0 0 24 24" fill="none" className="size-5" xmlns="http://www.w3.org/2000/svg">
            <path d="M6 6L18 18M18 6L6 18" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          </svg>
        </button>
        {children}
      </div>
    </div>,
    document.body,
  );
}
