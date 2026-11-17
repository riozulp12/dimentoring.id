import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { getNavbarProps } from "@/lib/dashboard/getNavbarProps";
import { getKelasByKategori } from "@/lib/dashboard/getProgramData";
import { getKontenInfoList } from "@/lib/dashboard/getInfoBeasiswaEvent";
import {
  PROGRAM_KATEGORI_LABEL,
  PROGRAM_KATEGORI_TAGLINE,
  PROGRAM_KATEGORI_TAMPILAN,
  programKategoriFromSlug,
} from "@/lib/shared/kelasLabels";
import Navbar from "@/components/ui/Navbar";
import Footer from "@/components/sections/Footer";
import KategoriFilterBar from "@/components/program/KategoriFilterBar";
import KategoriKelasGrid from "@/components/program/KategoriKelasGrid";
import BeasiswaEventListClient from "@/components/beasiswa-event/BeasiswaEventListClient";

/** Grid penuh 1 kategori program (PRD 7.5.4) — public route.
 * - Program kelas SMA (konsultasi/tka/snbt/ujian-mandiri): filter Tipe Kelas &
 *   Tingkat Kelas lewat query string (lihat KategoriFilterBar).
 * - Program mahasiswa (pendampingan-mahasiswa, "Beasiswa & Event"):
 *   tanpa filter Tipe/Tingkat; menampilkan konten_info (beasiswa/internship/
 *   event/…) dengan komponen & data yang SAMA dengan /beasiswa-event
 *   (getKontenInfoList + BeasiswaEventListClient), lalu bagian Kelas hanya kalau
 *   ada kelas di kategori ini.
 * Grid + card kelas REUSE KategoriKelasGrid (KelasCardFrame/KelasCardMeta). */

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
  const tampilanMahasiswa = PROGRAM_KATEGORI_TAMPILAN[kategori] === "mahasiswa";

  const cookieStore = await cookies();
  const session = verifySessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);

  // Independen satu sama lain — Promise.all supaya tidak menunggu bergantian.
  // Program mahasiswa tidak memakai filter Tipe/Tingkat (query string diabaikan).
  const [navbarProps, items, kontenInfo] = await Promise.all([
    getNavbarProps(session),
    getKelasByKategori(kategori, tampilanMahasiswa ? {} : { tipeKelas: tipe, tingkatKelas: tingkat }),
    tampilanMahasiswa ? getKontenInfoList() : Promise.resolve([]),
  ]);

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
          <p className="max-w-[720px] text-base text-[#7E7C7C]">{PROGRAM_KATEGORI_TAGLINE[kategori]}</p>
        </div>

        {tampilanMahasiswa ? (
          <div className="flex flex-col gap-10 sm:gap-12">
            <section className="flex flex-col gap-4 sm:gap-5" aria-labelledby="info-mahasiswa">
              <h2 id="info-mahasiswa" className="text-xl font-bold tracking-[-0.02em] text-black sm:text-2xl">
                Beasiswa, Internship &amp; Event
              </h2>
              <BeasiswaEventListClient items={kontenInfo} />
            </section>

            {items.length > 0 ? (
              <section className="flex flex-col gap-4 sm:gap-5" aria-labelledby="kelas-mahasiswa">
                <h2 id="kelas-mahasiswa" className="text-xl font-bold tracking-[-0.02em] text-black sm:text-2xl">
                  Kelas
                </h2>
                <KategoriKelasGrid items={items} sessionRole={session?.role ?? null} />
              </section>
            ) : null}
          </div>
        ) : (
          <>
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
              <KategoriKelasGrid items={items} sessionRole={session?.role ?? null} />
            )}
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}
