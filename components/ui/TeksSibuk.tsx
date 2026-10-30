import type { ReactNode } from "react";
import MaskotLoading from "./MaskotLoading";

/**
 * Isi tombol yang sedang bekerja (Studio Soal UX-4): maskot penguin kecil
 * (MaskotLoading, sama dengan tombol Checkout/Assessment) + teks status,
 * mis. "Menyimpan…". Saat tidak sibuk, tampilkan label biasa (children).
 *
 * Tombolnya tetap yang menonaktifkan diri (disabled) dan memberi aria-busy;
 * komponen ini hanya mengurus isi. Teks status ikut terbaca pembaca layar
 * karena tombol yang sedang fokus diumumkan ulang saat namanya berubah.
 */
export default function TeksSibuk({ sibuk, teks, children }: { sibuk: boolean; teks: string; children: ReactNode }) {
  if (!sibuk) return <>{children}</>;
  return (
    <span className="inline-flex items-center justify-center gap-1.5">
      <MaskotLoading size="xs" />
      {teks}
    </span>
  );
}
