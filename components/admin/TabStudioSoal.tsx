import Link from "next/link";
import { TAB_STUDIO_SOAL, type RuteStudioSoal } from "@/components/dashboard/sidebarMenuConfig";

/** Tab bersama halaman Admin Studio Soal; tiap tab tetap rute sendiri. */
export default function TabStudioSoal({ aktif }: { aktif: RuteStudioSoal }) {
  return (
    <nav aria-label="Studio Soal" className="flex max-w-full gap-1 overflow-x-auto border-b border-line">
      {TAB_STUDIO_SOAL.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.href === aktif ? "page" : undefined}
          className={[
            "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm",
            t.href === aktif ? "border-primary font-semibold text-primary" : "border-transparent text-muted hover:text-black",
          ].join(" ")}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
