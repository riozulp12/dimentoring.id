/**
 * Label, warna badge, dan formatter tampilan untuk payments.status/metode —
 * PRD Bagian 8 (BR-19, BR-20) & Bagian 13 (payments). File tanpa "server-only"
 * supaya aman diimport dari Client Component (RiwayatTransaksiClient).
 */

export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  menunggu: "Menunggu",
  berhasil: "Berhasil",
  gagal: "Gagal",
  refunded: "Refunded",
};

export const PAYMENT_STATUS_BADGE_CLASS: Record<string, string> = {
  menunggu: "bg-amber-100 text-amber-700",
  berhasil: "bg-[#F0FDF4] text-[#0CBA00]",
  gagal: "bg-[#FFEBEB] text-[#E70A0A]",
  refunded: "bg-gray-100 text-[#7E7C7C]",
};

export function formatRupiah(value: number): string {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}

/** "bank_transfer" -> "Bank Transfer". NULL (belum ada metode final) -> "-". */
export function formatMetode(metode: string | null): string {
  if (!metode) return "-";
  return metode
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
