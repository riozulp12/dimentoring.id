import { parseLinkPendaftaran } from "@/lib/shared/kelasDaftarTarget";

/**
 * Pengaman checkout internal (/checkout/[kelasId] + POST /api/payment/create).
 * FAIL-CLOSED: checkout internal HANYA terbuka kalau env
 * NEXT_PUBLIC_CHECKOUT_INTERNAL_READY bernilai persis "true". Env tidak ada,
 * kosong, salah ketik, "True", "1", dst -> tertutup.
 *
 * Dicek di SERVER (halaman checkout & API), bukan cuma di tombol "Daftar
 * Sekarang" — URL /checkout bisa diketik langsung / API bisa dipanggil curl.
 */

/** Fungsi murni supaya bisa dites tanpa env. */
export function parseCheckoutInternalReady(value: string | undefined): boolean {
  return value === "true";
}

export function isCheckoutInternalReady(): boolean {
  // Ditulis literal `process.env.NEXT_PUBLIC_...` supaya ikut di-inline Next.js
  // juga di bundle client (KelasDaftarButton).
  return parseCheckoutInternalReady(process.env.NEXT_PUBLIC_CHECKOUT_INTERNAL_READY);
}

export type CheckoutBlockReason = "belum_siap" | "link_eksternal";

/**
 * null = checkout internal boleh. Kelas yang punya link pendaftaran (kolom
 * kelas.link_lynkid, valid http/https — aturan SAMA dengan
 * lib/shared/kelasDaftarTarget.ts) didaftarkan lewat link itu, bukan checkout
 * internal, jadi ditolak juga walau flag siap.
 */
export function getCheckoutBlockReason(params: {
  isReady: boolean;
  linkPendaftaran: string | null;
}): CheckoutBlockReason | null {
  if (!params.isReady) return "belum_siap";
  if (parseLinkPendaftaran(params.linkPendaftaran)) return "link_eksternal";
  return null;
}

export const CHECKOUT_BLOCK_MESSAGE: Record<CheckoutBlockReason, string> = {
  belum_siap: "Pendaftaran kelas ini segera dibuka. Coba lagi nanti.",
  link_eksternal: "Pendaftaran kelas ini lewat link pendaftaran di halaman kelas.",
};
