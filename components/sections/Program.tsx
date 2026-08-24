import Mascot, { type MascotVariant } from "@/components/ui/Mascot";

export interface ProgramItem {
  title: string;
  description: string;
  mascot: MascotVariant;
}

/** Teaser 4 program di landing page — dropdown "Program" Navbar sekarang
 * pakai PROGRAM_KATEGORI_ORDER (lib/shared/kelasLabels.ts) & link ke halaman
 * /program sungguhan (PRD 7.5.4), bukan lagi reuse array ini. */
export const PROGRAMS: ProgramItem[] = [
  {
    title: "TKA",
    description: "Kelas Mapel Wajib & Pilihan",
    mascot: "Teaching",
  },
  {
    title: "SNBT",
    description: "Kelas Intensif TPS & Literasi",
    mascot: "Happy",
  },
  {
    title: "Ujian Mandiri",
    description: "Kelas Persiapan Jalur Mandiri PTN",
    mascot: "Plenger",
  },
  {
    title: "Mahasiswa",
    description: "Pemberian Informasi Beasiswa, Internship dan Event Lainnya",
    mascot: "Happy Graduate",
  },
];

export default function Program() {
  return (
    <section
      id="program"
      className="flex w-full scroll-mt-24 flex-col items-center gap-10 bg-[#081EEA] px-5 py-10 sm:px-8 sm:py-12 md:px-12 lg:flex-row lg:items-center lg:justify-between lg:gap-16 lg:px-[120px] lg:py-16 min-[1440px]:scroll-mt-32"
    >
      <div className="flex w-[585px] max-w-full flex-col items-center gap-3 text-center sm:gap-5 lg:items-start lg:text-left">
        <h4 className="text-lg leading-[1.5] font-semibold tracking-[-0.36px] text-white sm:text-xl">
          Program & Kelas Dimentoring
        </h4>
        <p className="text-base leading-[1.5] tracking-[-0.36px] text-white">
          Program buat mendukungmu belajar meraih tujuanmu
        </p>
      </div>

      <div className="flex w-[800px] max-w-full flex-col gap-4 sm:gap-6 lg:gap-8">
        {PROGRAMS.map((item) => (
          <div
            key={item.title}
            className="relative flex flex-col gap-2.5 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-3 shadow-[1px_2px_4px_0px_rgba(0,0,0,0.1)] sm:rounded-[24px] sm:px-6 sm:py-4 lg:rounded-[32px] lg:px-8"
          >
            <p className="max-w-[75%] text-lg leading-[1.5] font-semibold tracking-[-0.36px] text-[#081EEA]">
              {item.title}
            </p>
            <p className="max-w-[75%] text-base leading-[1.5] tracking-[-0.36px] text-black">
              {item.description}
            </p>
            <Mascot
              variant={item.mascot}
              className="pointer-events-none absolute right-[-8px] bottom-0 h-14 w-auto select-none sm:h-20 lg:right-[-15px] lg:h-[100px]"
            />
          </div>
        ))}
      </div>
    </section>
  );
}
