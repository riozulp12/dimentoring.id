import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Baris/kartu dashboard yang BISA DIKLIK bila punya tujuan (`href` dari lib/shared/dashboardLinks.ts),
 * dan tampil biasa (BUKAN link) bila `href` kosong. Memakai next/link — bukan onClick + router.push —
 * sehingga bisa dibuka di tab baru (klik tengah / Ctrl+klik), dapat fokus keyboard (Tab lalu Enter), dan
 * terbaca pembaca layar. Seluruh baris jadi area klik.
 */

const KELAS_LINK =
  "block cursor-pointer rounded-xl transition-colors hover:bg-[#F3F4FF] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#081EEA]";

export default function BarisKlik({
  href,
  children,
  className = "",
}: {
  href: string | null | undefined;
  children: ReactNode;
  className?: string;
}) {
  if (!href) return <div className={className}>{children}</div>;
  return (
    <Link href={href} className={`${KELAS_LINK} ${className}`}>
      {children}
    </Link>
  );
}
