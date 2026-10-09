/**
 * Validasi path redirect setelah login — pencegah open-redirect.
 *
 * Halaman Login menerima tujuan redirect dari query param (`returnTo` dari
 * alur "Daftar Sekarang" di detail kelas, `redirect` dari alur hasil
 * Assessment BR-5). Nilainya datang dari URL, jadi SELALU dianggap input tidak
 * dipercaya: hanya path internal absolut yang boleh lolos, supaya tidak bisa
 * dipakai mengarahkan user ke domain luar sehabis login.
 *
 * Yang DITOLAK (mengembalikan null):
 * - URL absolut ("https://evil.com", "javascript:...", "//evil.com")
 * - Path protocol-relative / backslash ("/\evil.com", "\evil.com") — sebagian
 *   browser menormalkan "\" jadi "/", jadi "/\evil.com" bisa diperlakukan
 *   sebagai "//evil.com".
 * - String kosong atau yang tidak diawali "/".
 */
export function safeInternalPath(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("/")) return null;
  if (trimmed.startsWith("//")) return null;
  if (trimmed.includes("\\")) return null;
  if (trimmed.includes("://")) return null;
  // Karakter kontrol (termasuk newline) tidak pernah valid di path internal
  // kita dan bisa dipakai menyelundupkan payload ke header/URL.
  if (/[\u0000-\u001F\u007F]/.test(trimmed)) return null;
  return trimmed;
}
