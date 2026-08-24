import Link from "next/link";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { getNavbarProps } from "@/lib/dashboard/getNavbarProps";
import { getProgramPreviewSections, type KelasCardPreview, type ProgramSection } from "@/lib/dashboard/getProgramData";
import { PROGRAM_KATEGORI_ORDER } from "@/lib/shared/kelasLabels";
import Navbar from "@/components/ui/Navbar";
import Footer from "@/components/sections/Footer";
import Mascot, { type MascotVariant } from "@/components/ui/Mascot";

/**
 * Halaman Program (PRD Bagian 4.3 poin 5, 7.5.4) — public route, reuse
 * Navbar landing page (sama pola dengan app/beasiswa-event/page.tsx).
 * 5 section kategori, 3 template desain berputar (index posisi TETAP di
 * PROGRAM_KATEGORI_ORDER, bukan index di array hasil filter — supaya
 * kategori kosong yang disembunyikan tidak menggeser rotasi template
 * kategori lain).
 */

const KATEGORI_MASCOT: Record<ProgramSection["kategori"], MascotVariant> = {
  konsultasi: "Guidance",
  tka: "Teaching",
  snbt: "Happy",
  ujian_mandiri: "Plenger",
  pendampingan_mahasiswa: "Happy Graduate",
};

function formatRupiah(value: number): string {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}

function CardMeta({ item }: { item: KelasCardPreview }) {
  return (
    <>
      <span className="inline-flex w-fit items-center rounded-full bg-[#F9FAFF] px-2.5 py-0.5 text-xs font-medium text-[#081EEA]">
        {item.tipeKelasLabel}
      </span>
      <p className="text-base leading-[1.5] font-semibold tracking-[-0.36px] text-black">{item.nama}</p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[#7E7C7C]">
        <span className="font-medium text-black">{formatRupiah(item.harga)}</span>
        {item.mentorNama ? <span>Mentor: {item.mentorNama}</span> : null}
      </div>
    </>
  );
}

/** Template A (Konsultasi, Ujian Mandiri) — grid standar, bg putih, icon kategori di kiri card. */
function TemplateA({ section }: { section: ProgramSection }) {
  return (
    <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {section.items.map((item) => (
        <Link
          key={item.id}
          href={`/program/kelas/${item.id}`}
          className="flex items-start gap-3 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white p-4 shadow-[1px_2px_4px_0px_rgba(0,0,0,0.1)] transition-shadow hover:shadow-[1px_2px_8px_0px_rgba(0,0,0,0.15)]"
        >
          <Mascot variant={KATEGORI_MASCOT[section.kategori]} className="h-14 w-auto shrink-0" />
          <div className="flex min-w-0 flex-col gap-1.5">
            <CardMeta item={item} />
          </div>
        </Link>
      ))}
    </div>
  );
}

/** Template B (TKA, Pendampingan Mahasiswa) — bg soft tint brand, card border aksen, layout horizontal. */
function TemplateB({ section }: { section: ProgramSection }) {
  return (
    <div className="flex w-full flex-col gap-4">
      {section.items.map((item) => (
        <Link
          key={item.id}
          href={`/program/kelas/${item.id}`}
          className="flex flex-col items-start gap-3 rounded-[20px] border-[1.5px] border-[#081EEA]/30 bg-white p-4 shadow-[1px_2px_4px_0px_rgba(0,0,0,0.1)] transition-colors hover:border-[#081EEA] sm:flex-row sm:items-center sm:justify-between sm:gap-6"
        >
          <div className="flex min-w-0 flex-col gap-1.5">
            <CardMeta item={item} />
          </div>
          <Mascot variant={KATEGORI_MASCOT[section.kategori]} className="h-16 w-auto shrink-0 self-end sm:self-center" />
        </Link>
      ))}
    </div>
  );
}

/** Template C (SNBT) — carousel horizontal scroll. */
function TemplateC({ section }: { section: ProgramSection }) {
  return (
    <div className="-mx-5 flex w-[calc(100%+40px)] gap-4 overflow-x-auto px-5 pb-2 sm:-mx-8 sm:w-[calc(100%+64px)] sm:px-8 md:-mx-12 md:w-[calc(100%+96px)] md:px-12 lg:mx-0 lg:w-full lg:px-0">
      {section.items.map((item) => (
        <Link
          key={item.id}
          href={`/program/kelas/${item.id}`}
          className="flex w-64 shrink-0 flex-col gap-3 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white p-4 shadow-[1px_2px_4px_0px_rgba(0,0,0,0.1)] sm:w-72"
        >
          <Mascot variant={KATEGORI_MASCOT[section.kategori]} className="h-14 w-auto self-end" />
          <div className="flex min-w-0 flex-col gap-1.5">
            <CardMeta item={item} />
          </div>
        </Link>
      ))}
    </div>
  );
}

const TEMPLATES = [TemplateA, TemplateB, TemplateC];

export default async function ProgramPage() {
  const cookieStore = await cookies();
  const session = verifySessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  const navbarProps = await getNavbarProps(session);

  const sections = await getProgramPreviewSections();

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
            {sections.map((section) => {
              const Template = TEMPLATES[PROGRAM_KATEGORI_ORDER.indexOf(section.kategori) % 3];
              return (
                <section key={section.kategori} className="flex flex-col gap-5 sm:gap-6">
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
                  <Template section={section} />
                </section>
              );
            })}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
