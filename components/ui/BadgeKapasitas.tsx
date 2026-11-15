import { teksBadgeKapasitas, type KapasitasKelas } from "@/lib/shared/kapasitasKelas";

/**
 * Badge kapasitas kelas: "Hampir habis · sisa N" (sisa <= BATAS_HAMPIR_HABIS) atau "Penuh". Teks dan
 * angkanya SEMUA dari lib/shared/kapasitasKelas.ts (tidak ada angka karangan). Kelas tanpa batas,
 * atau sisa masih banyak, tidak menampilkan apa pun (null).
 */
export default function BadgeKapasitas({ info, className }: { info: KapasitasKelas | null | undefined; className?: string }) {
  const teks = info ? teksBadgeKapasitas(info) : null;
  if (!info || !teks) return null;
  return (
    <span
      className={[
        "inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-medium",
        info.penuh ? "bg-[#6B7280] text-white" : "bg-[#FACC15] text-[#422006]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {teks}
    </span>
  );
}
