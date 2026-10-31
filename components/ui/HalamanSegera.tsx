import Link from "next/link";
import type { Metadata } from "next";
import Mascot from "@/components/ui/Mascot";
import LencanaSegera from "@/components/ui/LencanaSegera";
import { buttonClassName } from "@/components/ui/buttonClassName";
import { DAFTAR_FITUR_SEGERA, pesanFiturSegera, type FiturSegeraId } from "@/lib/shared/fiturSegera";

/** Dipakai di `generateMetadata` halaman yang bisa digembok: halaman alert tidak boleh diindeks. */
export function metadataFiturSegera(id: FiturSegeraId): Metadata {
  return {
    title: `${DAFTAR_FITUR_SEGERA[id].judul} segera hadir`,
    robots: { index: false, follow: false },
  };
}

/**
 * Halaman alert untuk fitur siswa yang belum dibuka. Server component.
 * Pemakaian di page.tsx:
 *   if (!fiturTerbuka("id")) return <HalamanSegera id="id" />;
 * dan `export const generateMetadata = () => metadataFiturSegera("id")`
 * (kalau fitur sudah dibuka, metadata ini tak berbahaya: tetap noindex).
 */
export default function HalamanSegera({ id }: { id: FiturSegeraId }) {
  const fitur = DAFTAR_FITUR_SEGERA[id];

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center gap-5 px-5 py-10 text-center">
      <Mascot variant="Happy" className="h-36 w-auto sm:h-44" alt="" priority />
      <LencanaSegera />
      <h1 className="text-2xl font-bold tracking-[-0.02em] text-black sm:text-3xl">
        {fitur.judul} segera hadir
      </h1>
      <p className="text-base leading-[1.5] text-muted">{pesanFiturSegera(id)}</p>
      <Link href="/dashboard/siswa" className={buttonClassName({ variant: "primary", size: "md" })}>
        Kembali ke Dashboard
      </Link>
    </main>
  );
}
