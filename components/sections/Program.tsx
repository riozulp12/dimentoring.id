import Mascot, { type MascotVariant } from "@/components/ui/Mascot";

interface ProgramItem {
  title: string;
  description: string;
  mascot: MascotVariant;
}

const PROGRAMS: ProgramItem[] = [
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
    <section className="flex w-full items-center justify-between gap-16 bg-[#081EEA] px-[120px] py-16">
      <div className="flex w-[585px] max-w-full flex-col gap-5">
        <h2 className="text-[40px] leading-[1.5] font-semibold tracking-[-0.8px] text-white">
          Program & Kelas Dimentoring
        </h2>
        <p className="text-2xl leading-[1.5] tracking-[-0.48px] text-white">
          Program buat mendukungmu belajar meraih tujuanmu
        </p>
      </div>

      <div className="flex w-[800px] max-w-full flex-col gap-8">
        {PROGRAMS.map((item) => (
          <div
            key={item.title}
            className="relative flex flex-col gap-2.5 rounded-[32px] border-[0.8px] border-[#E3E3E3] bg-white px-8 py-4 shadow-[1px_2px_4px_0px_rgba(0,0,0,0.1)]"
          >
            <p className="text-[32px] leading-[1.5] font-medium tracking-[-0.64px] text-[#081EEA]">
              {item.title}
            </p>
            <p className="text-2xl leading-[1.5] tracking-[-0.48px] text-black">
              {item.description}
            </p>
            <Mascot
              variant={item.mascot}
              className="pointer-events-none absolute right-[-15px] bottom-0 h-[100px] w-auto select-none"
            />
          </div>
        ))}
      </div>
    </section>
  );
}
