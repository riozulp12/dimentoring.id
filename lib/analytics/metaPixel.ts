/**
 * Meta Pixel — helper murni (tanpa data pribadi).
 *
 * - ID Pixel dari env NEXT_PUBLIC_META_PIXEL_ID; kosong/bukan angka = Pixel mati.
 * - Halaman privat (dashboard, admin, mentor, checkout, auth, dsb) TIDAK dilacak:
 *   URL-nya bisa memuat ID user/transaksi, dan mayoritas user adalah siswa < 18 th.
 * - Event hanya membawa kategori umum (mis. tipe konten), tidak pernah
 *   email/nama/telepon/ID user.
 */

type Fbq = (...args: unknown[]) => void;

declare global {
  interface Window {
    fbq?: Fbq;
  }
}

/** Awal path (segmen pertama) yang tidak boleh dikirim ke Pixel. */
const PREFIX_PRIVAT = [
  // area login
  "dashboard", "pengaturan", "profil", "checkout", "payment-status", "referral",
  // mentor
  "honor", "kelas-saya", "review-konten", "siswa-binaan", "studio-soal",
  // admin
  "analytics", "approval-mentor", "kelola-assessment", "kelola-kelas", "kelola-konten",
  "kode-promo", "leads", "manajemen-siswa", "penugasan-studio-soal", "riwayat-transaksi",
  "sesi-review", "undang-admin",
  // auth & API
  "login", "daftar", "daftar-admin", "forgot-password", "lengkapi-profil", "reset-password",
  "verifikasi", "auth", "api", "r",
] as const;

/** ID Pixel valid (hanya digit) atau null kalau env kosong/tidak valid. */
export function parseMetaPixelId(raw: string | undefined): string | null {
  const id = (raw ?? "").trim();
  return /^\d{5,20}$/.test(id) ? id : null;
}

export function getMetaPixelId(): string | null {
  return parseMetaPixelId(process.env.NEXT_PUBLIC_META_PIXEL_ID);
}

export function isPathTrackable(pathname: string): boolean {
  const first = pathname.split("/").filter(Boolean)[0];
  if (!first) return true; // beranda
  return !(PREFIX_PRIVAT as readonly string[]).includes(first);
}

export function trackPageView(pathname: string): void {
  if (typeof window === "undefined" || !window.fbq) return;
  if (!isPathTrackable(pathname)) return;
  window.fbq("track", "PageView");
}

/** Lead dari klik daftar/klaim di halaman detail Beasiswa & Event. Hanya kategori umum. */
export function trackLead(params?: { kategori?: string }): void {
  if (typeof window === "undefined" || !window.fbq) return;
  if (params?.kategori) window.fbq("track", "Lead", { content_category: params.kategori });
  else window.fbq("track", "Lead");
}
