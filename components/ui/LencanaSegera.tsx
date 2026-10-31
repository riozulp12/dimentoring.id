/**
 * Lencana kecil "Segera hadir" untuk menu/kartu yang menuju fitur yang belum
 * dibuka (lib/shared/fiturSegera.ts). Pakai token warna yang sudah ada.
 */
export default function LencanaSegera({ className }: { className?: string }) {
  return (
    <span
      className={[
        "inline-flex w-fit shrink-0 items-center rounded-full bg-primary-soft px-2 py-0.5 text-xs font-medium whitespace-nowrap text-primary",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      Segera hadir
    </span>
  );
}
