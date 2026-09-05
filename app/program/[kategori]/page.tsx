import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { getNavbarProps } from "@/lib/dashboard/getNavbarProps";
import { getKelasByKategori } from "@/lib/dashboard/getProgramData";
import { PROGRAM_KATEGORI_LABEL, programKategoriFromSlug } from "@/lib/shared/kelasLabels";
import Navbar from "@/components/ui/Navbar";
import Footer from "@/components/sections/Footer";
import KategoriFilterBar from "@/components/program/KategoriFilterBar";
import KelasCardFrame from "@/components/program/KelasCardFrame";
import KelasCardMeta from "@/components/program/KelasCardMeta";

/** Grid penuh 1 kategori program (PRD 7.5.4) — public route, filter Tipe
 * Kelas & Tingkat Kelas lewat query string (lihat KategoriFilterBar). Grid +
 * card content REUSE KelasCardFrame/KelasCardMeta yang sama dengan
 * app/program/page.tsx supaya ukuran & isi card selalu konsisten. */

export default async function ProgramKategoriPage({
  params,
  searchParams,
}: {
  params: Promise<{ kategori: string }>;
  searchParams: Promise<{ tipe?: string; tingkat?: string }>;
}) {
  const { kategori: slug } = await params;
  const kategori = programKategoriFromSlug(slug);
  if (!kategori) notFound();

  const { tipe, tingkat } = await searchParams;

  const cookieStore = await cookies();
  const session = verifySessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  const navbarProps = await getNavbarProps(session);

  const items = await getKelasByKategori(kategori, { tipeKelas: tipe, tingkatKelas: tingkat });

  return (
    <div className="flex w-full flex-col">
      <Navbar {...navbarProps} activeItem="program" />
      <main className="mx-auto w-full max-w-[1600px] flex-1 px-5 py-10 sm:px-8 sm:py-12 md:px-12 lg:px-20 lg:py-16">
        <div className="mb-6 flex flex-col gap-2 sm:mb-8">
          <Link href="/program" className="w-fit text-sm font-medium text-[#081EEA] hover:underline">
            &larr; Semua Program
          </Link>
          <h1 className="text-2xl font-bold tracking-[-0.02em] text-black sm:text-3xl">
            {PROGRAM_KATEGORI_LABEL[kategori]}
          </h1>
        </div>

        <div className="mb-8 flex justify-end sm:mb-10">
          <KategoriFilterBar slug={slug} />
        </div>

        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-16 text-center">
            <p className="text-base text-[#7E7C7C]">
              {tipe || tingkat
                ? "Belum ada kelas yang cocok dengan filter ini."
                : "Belum ada kelas di kategori ini."}
            </p>
          </div>
        ) : (
          <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {items.map((item, idx) => (
              <KelasCardFrame
                key={item.id}
                href={`/program/kelas/${item.id}`}
                namaKelas={item.nama}
                index={idx}
                diskonAktif={item.diskonAktif}
                sisaSlot={item.sisaSlot}
                kapasitas={item.kapasitas}
                programKategori={item.programKategori}
                tingkatKelas={item.tingkatKelas}
                subtesNama={item.subtesNama}
              >
                <KelasCardMeta item={item} sessionRole={session?.role ?? null} />
              </KelasCardFrame>
            ))}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
