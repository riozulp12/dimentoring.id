import Link from "next/link";
import Mascot, { type MascotVariant } from "@/components/ui/Mascot";
import {
  PROGRAM_KATEGORI_LABEL,
  PROGRAM_KATEGORI_ORDER,
  PROGRAM_KATEGORI_SLUG,
  type ProgramKategori,
} from "@/lib/shared/kelasLabels";

export interface ProgramItem {
  title: string;
  description: string;
  mascot: MascotVariant;
  href: string;
}

// Deskripsi + mascot per kategori — judul & urutan REUSE PROGRAM_KATEGORI_ORDER/
// LABEL/SLUG yang sama dengan dropdown "Program" Navbar (components/ui/Navbar.tsx)
// supaya kedua tempat selalu konsisten (kalau nanti nambah kategori baru, cukup
// diubah di lib/shared/kelasLabels.ts, dua tempat ini otomatis ikut).
const PROGRAM_META: Record<ProgramKategori, { description: string; mascot: MascotVariant }> = {
  konsultasi: {
    description: "Konsultasi 1-on-1 Rencana Studi & Pilihan PTN",
    mascot: "Guidance",
  },
  tka: {
    description: "Kelas Mapel Wajib & Pilihan",
    mascot: "Teaching",
  },
  snbt: {
    description: "Kelas Intensif TPS & Literasi",
    mascot: "Happy",
  },
  ujian_mandiri: {
    description: "Kelas Persiapan Jalur Mandiri PTN",
    mascot: "Plenger",
  },
  pendampingan_mahasiswa: {
    description: "Pendampingan Beasiswa, Internship, dan Event Lainnya",
    mascot: "Happy Graduate",
  },
};

export const PROGRAMS: ProgramItem[] = PROGRAM_KATEGORI_ORDER.map((kategori) => ({
  title: PROGRAM_KATEGORI_LABEL[kategori],
  description: PROGRAM_META[kategori].description,
  mascot: PROGRAM_META[kategori].mascot,
  href: `/program/${PROGRAM_KATEGORI_SLUG[kategori]}`,
}));

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
          <Link
            key={item.title}
            href={item.href}
            className="relative flex flex-col gap-2.5 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-3 shadow-[1px_2px_4px_0px_rgba(0,0,0,0.1)] transition-transform duration-150 hover:-translate-y-1 hover:shadow-[2px_4px_8px_0px_rgba(0,0,0,0.15)] sm:rounded-[24px] sm:px-6 sm:py-4 lg:rounded-[32px] lg:px-8"
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
          </Link>
        ))}
      </div>
    </section>
  );
}
