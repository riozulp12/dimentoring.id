import Link from "next/link";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, verifySessionToken, type SessionRole } from "@/lib/auth/session";
import { getNavbarProps } from "@/lib/dashboard/getNavbarProps";
import { getProgramPreviewSections, type ProgramSection } from "@/lib/dashboard/getProgramData";
import { PROGRAM_KATEGORI_TAGLINE } from "@/lib/shared/kelasLabels";
import Navbar from "@/components/ui/Navbar";
import Footer from "@/components/sections/Footer";
import KelasCardFrame from "@/components/program/KelasCardFrame";
import KelasCardMeta from "@/components/program/KelasCardMeta";

/**
 * Halaman Program (PRD Bagian 4.3 poin 5, 7.5.4) — public route, reuse
 * Navbar landing page (sama pola dengan app/beasiswa-event/page.tsx).
 * 5 section kategori, SEMUA pakai grid & card content yang sama persis
 * (ProgramSectionGrid + KelasCardMeta) supaya ukuran card selalu konsisten
 * walau section itu isinya cuma 1 kelas — jangan bikin template per
 * kategori yang beda struktur lagi, itu penyebab card TKA dulu melebar
 * penuh section (flex-col tanpa lebar tetap -> stretch 1 card raksasa).
 * Visual maskot per card datang dari KelasCardFrame/KelasCardVisual
 * (rotasi per-index dalam section).
 */

/** Satu-satunya struktur grid section program — dipakai SEMUA kategori supaya
 * ukuran card selalu konsisten (sama dengan app/program/[kategori]/page.tsx). */
function ProgramSectionGrid({ section, sessionRole }: { section: ProgramSection; sessionRole: SessionRole | null }) {
  return (
    <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {section.items.map((item, idx) => (
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
          <KelasCardMeta item={item} sessionRole={sessionRole} />
        </KelasCardFrame>
      ))}
    </div>
  );
}

export default async function ProgramPage() {
  const cookieStore = await cookies();
  const session = verifySessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);

  // navbarProps & sections independen satu sama lain — Promise.all supaya
  // tidak menunggu bergantian.
  const [navbarProps, sections] = await Promise.all([
    getNavbarProps(session),
    getProgramPreviewSections(),
  ]);

  return (
    <div className="flex w-full flex-col">
      <Navbar {...navbarProps} activeItem="program" />
      <main className="mx-auto w-full max-w-[1600px] flex-1 px-5 py-10 sm:px-8 sm:py-12 md:px-12 lg:px-20 lg:py-16">
        <div className="mb-8 flex flex-col gap-2 sm:mb-10">
          <h1 className="text-2xl font-bold tracking-[-0.02em] text-black sm:text-3xl">Program Dimentoring</h1>
          <p className="text-base text-[#7E7C7C]">
            Pilih program yang paling sesuai dengan kebutuhan belajarmu, dari konsultasi awal sampai pendampingan kuliah
          </p>
        </div>

        {sections.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-16 text-center">
            <p className="text-base text-[#7E7C7C]">Program kelas akan segera hadir. Pantau terus, ya!</p>
          </div>
        ) : (
          <div className="flex flex-col gap-12 sm:gap-16 lg:gap-20">
            {sections.map((section) => (
              <section key={section.kategori} className="flex flex-col gap-5 sm:gap-6">
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-4">
                    <h2 className="text-lg leading-[1.5] font-semibold tracking-[-0.36px] text-black sm:text-xl">
                      {section.kategoriLabel}
                    </h2>
                    <Link
                      href={`/program/${section.slug}`}
                      className="shrink-0 text-sm font-medium text-[#081EEA] transition-opacity hover:opacity-80 sm:text-base"
                    >
                      Lihat Semua &rarr;
                    </Link>
                  </div>
                  {/* Tanpa max-w — biar satu baris kalau lebar container cukup
                      (poin 13), wrap alami kalau memang tidak muat (mobile). */}
                  <p className="text-sm text-[#7E7C7C] sm:text-base">{PROGRAM_KATEGORI_TAGLINE[section.kategori]}</p>
                </div>
                <ProgramSectionGrid section={section} sessionRole={session?.role ?? null} />
              </section>
            ))}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
