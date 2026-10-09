import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ROLE_DASHBOARD_PATH, SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { getPendaftarKelas } from "@/lib/admin/getPendaftarKelas";
import PageTitle from "@/components/dashboard/PageTitle";
import PendaftarKelasClient from "@/components/admin/PendaftarKelasClient";

/** "Pendaftar" per kelas (Admin, Kelola Kelas) — PRD 7.5.8. */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PendaftarKelasPage({ params }: { params: Promise<{ kelasId: string }> }) {
  const cookieStore = await cookies();
  const session = verifySessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return null;
  if (session.role !== "admin") {
    redirect(ROLE_DASHBOARD_PATH[session.role]);
  }

  const { kelasId } = await params;
  if (!UUID_RE.test(kelasId)) notFound();

  const data = await getPendaftarKelas(kelasId);
  if (!data) notFound();

  return (
    <>
      <PageTitle value={`Pendaftar — ${data.kelas.nama}`} />
      <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-6 p-4 sm:gap-8 sm:p-6 lg:p-10">
        <div className="flex flex-col gap-1">
          <Link href="/kelola-kelas" className="w-fit text-sm text-[#081EEA] hover:underline">
            &larr; Kembali ke Kelola Kelas
          </Link>
          <h1 className="text-xl font-semibold tracking-[-0.02em] text-black sm:text-2xl">{data.kelas.nama}</h1>
          <p className="text-sm text-[#7E7C7C]">
            {data.kelas.jadwalPilihanAktif
              ? "Siswa memilih jadwal (maks. 2) sebagai preferensi. Tetapkan jadwal akhir per siswa dari slot kelas saat ini."
              : "Kelas ini tidak memakai pilihan jadwal oleh siswa — semua siswa mengikuti seluruh slot jadwal kelas."}
          </p>
        </div>
        <PendaftarKelasClient
          kelasId={data.kelas.id}
          jadwalPilihanAktif={data.kelas.jadwalPilihanAktif}
          slots={data.kelas.slots}
          initialPendaftar={data.pendaftar}
        />
      </div>
    </>
  );
}
