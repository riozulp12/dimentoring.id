import type { ReactNode } from "react";

/**
 * Bilah aksi yang menempel di bawah halaman form Studio Soal (halaman bacaan
 * + soal dan halaman soal) — revisi UX-3 butir 8 & 10.
 *
 *   [keterangan kecil (status simpan, jumlah soal)]          [ikon hapus]
 *   [ Simpan ]  [ Kirim untuk dicek ]
 *
 * Di HP tombol-tombol berbagi satu baris sama lebar (grid kolom otomatis),
 * tidak turun baris. Mulai sm tombol selebar isinya, rata kanan. Keterangan
 * berada di kotak ber-padding yang tepi kirinya sejajar tombol & isi halaman
 * (butir 9 — dulu teks polos yang menempel ke tepi bilah).
 */
// max-sm: menimpa padding tombol hanya di HP (varian selalu menang atas kelas dasar Button).
export const KELAS_TOMBOL_BILAH = "w-full min-w-0 max-sm:px-3 sm:w-auto";

export default function BilahAksi({
  keterangan,
  hapus,
  children,
}: {
  /** Teks kecil di kiri atas (status simpan, jumlah yang dikirim). */
  keterangan?: ReactNode;
  /** Tombol ikon hapus draf, di kanan atas. */
  hapus?: ReactNode;
  /** Tombol aksi (Button dengan className KELAS_TOMBOL_BILAH). */
  children?: ReactNode;
}) {
  const adaTombol = Boolean(children) && (!Array.isArray(children) || children.some(Boolean));
  return (
    <div className="sticky bottom-0 z-10 -mx-4 flex flex-col gap-1.5 border-t border-line bg-white/95 px-4 py-2.5 backdrop-blur sm:-mx-6 sm:px-6 lg:mx-0 lg:rounded-[16px] lg:border">
      {keterangan || hapus ? (
        <div className="flex min-h-10 items-center gap-2">
          <div className="min-w-0 flex-1" aria-live="polite">
            {keterangan ? (
              <p className="w-fit max-w-full rounded-[12px] bg-surface-muted px-3 py-1.5 text-xs text-muted">{keterangan}</p>
            ) : null}
          </div>
          {hapus}
        </div>
      ) : null}
      {adaTombol ? <div className="grid auto-cols-fr grid-flow-col gap-2 sm:flex sm:justify-end">{children}</div> : null}
    </div>
  );
}
