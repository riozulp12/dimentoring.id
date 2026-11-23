import Link from "next/link";
import { PESAN_PENDAFTARAN_DITUTUP } from "@/lib/shared/checkoutGuard";

/** Pengganti form di /checkout/[kelasId] saat Admin menutup pendaftaran kelas (kelas.pendaftaran_ditutup). Komponen server. */
export default function PendaftaranDitutupNotice({ namaKelas }: { namaKelas: string }) {
  return (
    <div className="mx-auto flex w-full max-w-[700px] flex-col gap-4 p-4 sm:p-6 lg:p-10">
      <div className="flex flex-col gap-2 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-6 sm:px-8">
        <p className="text-sm text-[#7E7C7C]">{namaKelas}</p>
        <h1 className="text-xl font-semibold tracking-[-0.02em] text-black sm:text-2xl">{PESAN_PENDAFTARAN_DITUTUP}</h1>
        <Link href="/program" className="mt-2 w-fit text-sm font-medium text-[#081EEA] hover:underline">
          Kembali ke daftar program
        </Link>
      </div>
    </div>
  );
}
