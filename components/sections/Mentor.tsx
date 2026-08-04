import Image from "next/image";
import type { ReactNode } from "react";

interface MentorItem {
  name: string;
  role: string;
  portrait: ReactNode;
}

function CoverPortrait({
  src,
  alt,
  height,
}: {
  src: string;
  alt: string;
  height: number;
}) {
  return (
    <div
      className="relative z-10 mt-8 w-[236px] overflow-hidden"
      style={{ height }}
    >
      <Image
        src={src}
        alt={alt}
        fill
        className="object-cover object-bottom"
      />
    </div>
  );
}

function RotatedCoverPortrait({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="relative z-10 mt-8 flex h-[332px] w-[236px] items-center justify-center overflow-hidden">
      <div className="relative h-[236px] w-[332px] rotate-90">
        <Image
          src={src}
          alt={alt}
          fill
          className="object-cover object-bottom"
        />
      </div>
    </div>
  );
}

const MENTORS: MentorItem[] = [
  {
    name: "Kak Anggun",
    role: "Filsafat Univesitas Gajah Mada",
    portrait: (
      <CoverPortrait
        src="/mentors/mentor-anggun.png"
        alt="Kak Anggun"
        height={342}
      />
    ),
  },
  {
    name: "Kak Virdza",
    role: "FEB Universitas Gajah Mada",
    portrait: (
      <RotatedCoverPortrait src="/mentors/mentor-virdza.png" alt="Kak Virdza" />
    ),
  },
  {
    name: "Kak Gia",
    role: "FMIPA Univesitas Gajah Mada",
    portrait: (
      <CoverPortrait src="/mentors/mentor-gia.png" alt="Kak Gia" height={342} />
    ),
  },
];

export default function Mentor() {
  return (
    <section className="flex w-full flex-col items-center gap-12 px-[120px] py-16">
      <div className="flex w-[643px] max-w-full flex-col items-center gap-5 text-center">
        <h2 className="text-[40px] leading-[1.5] font-semibold tracking-[-0.8px] text-black">
          Kenalan dengan Mentor Hebat{" "}
          <span className="text-[#081EEA]">Dimentoring</span>
        </h2>
        <p className="text-2xl leading-[1.5] tracking-[-0.48px] text-black">
          Mereka siap mendampingi perjalanan belajarmu dengan sepenuh hati dan
          profesionalitas
        </p>
      </div>

      <div className="flex w-full items-center gap-10 overflow-x-auto">
        {MENTORS.map((mentor) => (
          <div
            key={mentor.name}
            className="flex w-[560px] shrink-0 flex-col items-center"
          >
            <div className="relative z-10 flex w-[236px] flex-col items-center">
              <Image
                src="/icons/mentor-badge-shape.svg"
                width={179}
                height={264}
                alt=""
                className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 select-none"
              />
              {mentor.portrait}
            </div>
            <div className="relative z-0 -mt-8 flex w-full flex-col items-center gap-[19px] rounded-[20px] bg-[#081EEA] px-6 py-5 drop-shadow-[4px_4px_0px_black]">
              <div className="flex w-full max-w-[382px] flex-col items-center gap-4 text-center text-white">
                <p className="w-full text-[32px] leading-[1.5] font-semibold tracking-[-0.64px]">
                  {mentor.name}
                </p>
                <p className="w-full text-2xl leading-[1.5] font-normal tracking-[-0.48px]">
                  {mentor.role}
                </p>
              </div>
              <div className="flex w-full items-center gap-5">
                <span className="h-0 flex-1 border-t border-dashed border-[#F9F9F9]" />
                <span className="h-[18px] w-[18px] shrink-0 rounded-full bg-[#F9F9F9]" />
                <span className="h-0 flex-1 border-t border-dashed border-[#F9F9F9]" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
