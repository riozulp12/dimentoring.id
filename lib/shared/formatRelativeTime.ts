/**
 * Format waktu relatif Indonesia ("5 menit lalu", "2 hari lalu") — dipakai
 * dropdown notifikasi (components/dashboard/AccountMenu.tsx). Tanpa
 * "server-only" supaya aman diimport dari Client Component juga.
 */
export function formatRelativeTime(iso: string): string {
  const diffSec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);

  if (diffSec < 60) return "Baru saja";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} menit lalu`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} jam lalu`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 30) return `${diffDay} hari lalu`;
  const diffMonth = Math.floor(diffDay / 30);
  if (diffMonth < 12) return `${diffMonth} bulan lalu`;
  const diffYear = Math.floor(diffMonth / 12);
  return `${diffYear} tahun lalu`;
}
