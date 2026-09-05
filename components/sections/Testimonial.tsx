"use client";

import type { CSSProperties } from "react";
import Mascot, { type MascotVariant } from "@/components/ui/Mascot";
import { useMarqueeClone } from "@/lib/hooks/useMarqueeClone";

interface TestimonialItem {
  quote: string;
  name: string;
  role: string;
  mascot: MascotVariant;
}

// Mascot per kartu FIXED (bukan Math.random di render body) — komponen ini
// "use client" (butuh useMarqueeClone), jadi body-nya jalan dua kali
// (SSR lalu hydrate di browser); Math.random di sana bikin mismatch
// mascot antara HTML dari server vs client pertama kali render.
const TESTIMONIALS: TestimonialItem[] = [
  {
    quote:
      "“Awalnya aku asal pilih jurusan buat SNBP, eh pas isi Assessment di Dimentoring ternyata peluangnya kecil banget. Untung ketahuan dari awal, jadi sempat ganti strategi dan alhamdulillah keterima di pilihan yang lebih realistis.”",
    name: "~ R***",
    role: "Teknik Industri ITB",
    mascot: "Listen",
  },
  {
    quote:
      "“Yang bikin beda dari bimbel lain, mentornya masih standby bantuin aku pas udah masuk kuliah juga, bukan cuma sampai SNBT doang. Berasa nggak sendirian ngejalanin semester awal.”",
    name: "~ A***",
    role: "Kedokteran Unair",
    mascot: "Happy With Univ",
  },
  {
    quote:
      "“Berkat rekomendasi kelas dari hasil Assessment, aku jadi tahu subtes mana yang paling perlu digenjot. Nggak buang waktu belajar random lagi kayak sebelumnya.”",
    name: "~ D***",
    role: "Ilmu Komputer UGM",
    mascot: "Teaching",
  },
  {
    quote:
      "“Tryout gratisnya ngebantu banget buat latihan sebelum SNBT beneran, jadi udah kebayang formatnya kayak gimana pas hari-H. Grogi jauh berkurang.”",
    name: "~ F***",
    role: "Farmasi Unpad",
    mascot: "Happy Graduate",
  },
];

const MARQUEE_STYLE = {
  "--marquee-duration": "34s",
  "--marquee-distance": "-33.3334%",
} as CSSProperties;

export default function Testimonial() {
  // 3 salinan total di DOM (1 asli + 2 klon client-side) supaya
  // translateX(-33.3334%) di CSS loop mulus — lihat useMarqueeClone.
  const trackRef = useMarqueeClone<HTMLDivElement>(3);

  return (
    <section
      id="testimonial"
      className="flex w-full scroll-mt-24 flex-col items-center gap-8 px-5 py-10 sm:px-8 sm:py-12 md:px-12 lg:gap-12 lg:px-20 lg:py-16 min-[1440px]:scroll-mt-32"
    >
      <div className="flex flex-col items-center gap-3 text-center sm:gap-5">
        <h2 className="text-lg leading-[1.5] font-semibold tracking-[-0.36px] text-black sm:text-xl">
          Kisah Sukses <span className="text-[#081EEA]">Dimentorian</span>
        </h2>
        <p className="text-base leading-[1.5] tracking-[-0.36px] text-[#7E7C7C]">
          Mereka aja bisa, kalian pasti lebih bisa
        </p>
      </div>

      <div className="w-full overflow-hidden">
        <div
          ref={trackRef}
          className="animate-marquee flex w-max items-stretch gap-6 sm:gap-10 lg:gap-[67px]"
          style={MARQUEE_STYLE}
        >
          {TESTIMONIALS.map((item) => (
            <div
              key={item.name}
              className="relative min-h-[220px] w-[280px] shrink-0 overflow-hidden rounded-[20px] border border-[#E3E3E3] bg-white sm:min-h-[240px] sm:w-[420px] lg:h-[254px] lg:w-[622px]"
            >
              <div className="flex h-full flex-col justify-center gap-2.5 px-5 py-4 sm:px-6 sm:py-3">
                <p className="pr-16 text-base leading-[1.5] tracking-[-0.36px] text-black sm:pr-24 lg:pr-0">
                  {item.quote}
                </p>
                <div className="flex flex-col gap-2 sm:gap-2.5">
                  <p className="text-lg leading-[1.5] font-medium tracking-[-0.36px] text-black">
                    {item.name}
                  </p>
                  <p className="text-base leading-[1.5] tracking-[-0.36px] text-black">
                    {item.role}
                  </p>
                </div>
              </div>
              <Mascot
                variant={item.mascot}
                alt=""
                className="pointer-events-none absolute right-3 -bottom-3 h-[100px] w-auto select-none sm:right-4 sm:-bottom-4 sm:h-[140px] lg:right-5 lg:-bottom-6 lg:h-[180px]"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
