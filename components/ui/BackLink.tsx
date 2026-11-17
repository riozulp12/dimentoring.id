import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Tombol kembali bergaya tautan ("← TKA", "← Beasiswa") di atas halaman detail publik. SATU komponen untuk detail
 * kelas (/program/kelas/[id]) dan detail event (/beasiswa-event/[id]) supaya gaya, posisi, dan perilakunya sama.
 */
export default function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="mb-6 inline-block w-fit text-sm font-medium text-[#081EEA] hover:underline sm:mb-8">
      &larr; {children}
    </Link>
  );
}
