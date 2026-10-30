"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";

type Router = ReturnType<typeof useRouter>;

/**
 * Pindah halaman / muat ulang data sesudah aksi (Studio Soal UX-4), dengan
 * tombol tetap tampak sibuk sampai halaman berikutnya muncul. router.push dan
 * router.refresh dijalankan di dalam transition, jadi `jenisPindah` terisi
 * selama Next masih memuat — lalu kosong lagi dengan sendirinya (juga bila
 * gagal), tanpa state yang tertinggal.
 *
 *   const { router, jenisPindah, pindah } = useNavigasiSibuk<Sibuk>();
 *   pindah("versi", (r) => r.push(url));
 *   const tampil = jenisPindah ?? sibuk; // label & disabled tombol
 */
export function useNavigasiSibuk<T extends string>() {
  const router = useRouter();
  const [sedang, mulai] = useTransition();
  const [jenis, setJenis] = useState<T | null>(null);
  const pindah = useCallback(
    (j: T, aksi: (r: Router) => void) => {
      setJenis(j);
      mulai(() => aksi(router));
    },
    [router],
  );
  return { router, jenisPindah: sedang ? jenis : null, pindah };
}
