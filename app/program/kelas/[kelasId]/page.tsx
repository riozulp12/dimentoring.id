import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { getNavbarProps } from "@/lib/dashboard/getNavbarProps";
import { getKelasDetailPublic } from "@/lib/dashboard/getProgramData";
import { PROGRAM_KATEGORI_SLUG } from "@/lib/shared/kelasLabels";
import Navbar from "@/components/ui/Navbar";
import Footer from "@/components/sections/Footer";
import Button from "@/components/ui/Button";

/** Detail publik 1 kelas (PRD 7.5.4) — tombol "Daftar Kelas Ini": belum
 * login -> /login; sudah login sebagai Siswa -> /checkout/[kelasId]; sudah
 * login sebagai role lain (Mentor/Admin) -> nonaktif (kelas cuma untuk Siswa). */

function formatRupiah(value: number): string {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-sm text-[#7E7C7C]">{label}</p>
      <p className="text-base text-black">{value}</p>
    </div>
  );
}

export default async function KelasDetailPublicPage({ params }: { params: Promise<{ kelasId: string }> }) {
  const { kelasId } = await params;
  const kelas = await getKelasDetailPublic(kelasId);
  if (!kelas) notFound();

  const cookieStore = await cookies();
  const session = verifySessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  const navbarProps = await getNavbarProps(session);

  return (
    <div className="flex w-full flex-col">
      <Navbar {...navbarProps} activeItem="program" />
      <main className="mx-auto w-full max-w-[900px] flex-1 px-5 py-10 sm:px-8 sm:py-12 md:px-12 lg:px-0 lg:py-16">
        <Link href={`/program/${PROGRAM_KATEGORI_SLUG[kelas.programKategori]}`} className="mb-6 inline-block w-fit text-sm font-medium text-[#081EEA] hover:underline sm:mb-8">
          &larr; {kelas.programKategoriLabel}
        </Link>

        <div className="flex flex-col gap-6 rounded-[24px] border-[0.8px] border-[#E3E3E3] bg-white p-5 shadow-[1px_2px_8px_0px_rgba(0,0,0,0.1)] sm:gap-8 sm:p-8">
          <div className="flex flex-col gap-2">
            <span className="inline-flex w-fit items-center rounded-full bg-[#F9FAFF] px-2.5 py-0.5 text-xs font-medium text-[#081EEA]">
              {kelas.programKategoriLabel}
            </span>
            <h1 className="text-2xl font-bold tracking-[-0.02em] text-black sm:text-3xl">{kelas.nama}</h1>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6">
            <InfoRow label="Tipe Kelas" value={kelas.tipeKelasLabel} />
            <InfoRow label="Tingkat" value={kelas.tingkatKelasLabel} />
            {kelas.subtesNama ? <InfoRow label="Subtes" value={kelas.subtesNama} /> : null}
            <InfoRow label="Harga" value={formatRupiah(kelas.harga)} />
            <InfoRow label="Jadwal" value={kelas.jadwalDisplay} />
            {kelas.mentorNama ? <InfoRow label="Mentor" value={kelas.mentorNama} /> : null}
          </div>

          {kelas.deskripsi ? (
            <div className="flex flex-col gap-1.5 border-t border-[#E3E3E3] pt-6">
              <p className="text-sm text-[#7E7C7C]">Deskripsi</p>
              <p className="whitespace-pre-wrap text-base text-black">{kelas.deskripsi}</p>
            </div>
          ) : null}

          <div className="flex flex-col gap-2 border-t border-[#E3E3E3] pt-6">
            {kelas.sisaSlot <= 0 ? (
              <>
                <Button type="button" variant="primary" size="lg" className="w-full sm:w-auto" disabled>
                  Daftar Kelas Ini
                </Button>
                <p className="text-sm text-[#7E7C7C]">Kelas ini sudah penuh, kuota sudah terisi semua.</p>
              </>
            ) : session?.role === "student" ? (
              <Link href={`/checkout/${kelas.id}`} className="w-full sm:w-auto">
                <Button type="button" variant="primary" size="lg" className="w-full sm:w-auto">
                  Daftar Kelas Ini
                </Button>
              </Link>
            ) : session ? (
              <>
                <Button type="button" variant="primary" size="lg" className="w-full sm:w-auto" disabled>
                  Daftar Kelas Ini
                </Button>
                <p className="text-sm text-[#7E7C7C]">Pendaftaran kelas hanya untuk akun Siswa.</p>
              </>
            ) : (
              <Link href="/login" className="w-full sm:w-auto">
                <Button type="button" variant="primary" size="lg" className="w-full sm:w-auto">
                  Daftar Kelas Ini
                </Button>
              </Link>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
