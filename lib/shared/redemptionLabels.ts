/**
 * Label & warna badge untuk enum redemption_status (reward_redemptions.status)
 * — dipakai halaman Admin "Permintaan Penukaran" DAN "Riwayat Penukaran"
 * Siswa/Mentor. DB enum cuma punya 'gagal' (bukan 'ditolak') untuk kasus
 * ditolak Admin — label di sini yang menerjemahkannya jadi "Ditolak".
 * File tanpa "server-only" supaya aman diimport dari Client Component.
 */

export const REDEMPTION_STATUS_LABEL: Record<string, string> = {
  diproses: "Diproses",
  selesai: "Selesai",
  gagal: "Ditolak",
};

export const REDEMPTION_STATUS_BADGE_CLASS: Record<string, string> = {
  diproses: "bg-amber-50 text-amber-700",
  selesai: "bg-[#F0FDF4] text-[#0CBA00]",
  gagal: "bg-[#FFEBEB] text-[#E70A0A]",
};
