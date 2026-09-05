"use client";

import type { MouseEvent } from "react";
import { useRouter } from "next/navigation";

/**
 * Tombol "Lihat Siswa" di card Kelas Saya (Mentor) — PRD 7.5 poin 3. Card
 * pembungkusnya (components/mentor/KelasSayaCard.tsx) adalah <Link> ke
 * halaman detail kelas — tombol ini WAJIB stopPropagation + preventDefault
 * dan navigasi manual lewat router (BUKAN <Link> bersarang, invalid HTML)
 * supaya klik tombol ke Siswa Saya, bukan ikut ke-trigger navigasi Link
 * detail kelas. Pola sama seperti components/program/KelasDaftarButton.tsx.
 */
export default function LihatSiswaButton({ kelasId }: { kelasId: string }) {
  const router = useRouter();

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    router.push(`/siswa-binaan?kelasId=${kelasId}`);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      onMouseDown={(event) => event.stopPropagation()}
      className="mt-1 inline-flex w-full items-center justify-center rounded-[18px] bg-[#081EEA] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
    >
      Lihat Siswa
    </button>
  );
}
