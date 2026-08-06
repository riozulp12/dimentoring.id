import Image from "next/image";
import type { CSSProperties, ReactNode } from "react";

interface MentorItem {
  name: string;
  role: string;
  portrait: ReactNode;
}

function CoverPortrait({
  src,
  alt,
}: {
  src: string;
  alt: string;
}) {
  return (
    <div className="relative h-[230px] w-[200px] overflow-hidden rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white sm:h-[260px] sm:w-[220px]">
      <Image src={src} alt={alt} fill className="object-contain" />
    </div>
  );
}

function RotatedCoverPortrait({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="relative flex h-[230px] w-[200px] items-center justify-center overflow-hidden rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white sm:h-[260px] sm:w-[220px]">
      <div className="relative h-[200px] w-[230px] rotate-90 sm:h-[220px] sm:w-[260px]">
        <Image src={src} alt={alt} fill className="object-contain" />
      </div>
    </div>
  );
}

const MENTORS: MentorItem[] = [
  {
    name: "Kak Anggun",
    role: "Filsafat Univesitas Gajah Mada",
    portrait: <CoverPortrait src="/mentors/mentor-anggun.png" alt="Kak Anggun" />,
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
    portrait: <CoverPortrait src="/mentors/mentor-gia.png" alt="Kak Gia" />,
  },
];

const MARQUEE_STYLE = {
  "--marquee-duration": "28s",
  "--marquee-distance": "-25%",
} as CSSProperties;

export default function Mentor() {
  const loopMentors = [...MENTORS, ...MENTORS, ...MENTORS, ...MENTORS];

  return (
    <section className="flex w-full flex-col items-center gap-8 px-5 py-10 sm:px-8 sm:py-12 md:px-12 lg:gap-12 lg:px-[120px] lg:py-16">
      <div className="flex w-[900px] max-w-full flex-col items-center gap-3 text-center sm:gap-5">
        <h4 className="text-2xl leading-[1.5] font-semibold tracking-[-0.48px] text-black sm:text-[32px] sm:tracking-[-0.64px] sm:whitespace-nowrap lg:text-[40px] lg:tracking-[-0.8px]">
          Kenalan dengan Mentor Hebat{" "}
          <span className="text-[#081EEA]">Dimentoring</span>
        </h4>
        <p className="text-lg leading-[1.5] tracking-[-0.36px] text-black sm:whitespace-nowrap">
          Mereka siap mendampingi perjalanan belajarmu dengan sepenuh hati dan
          profesionalitas
        </p>
      </div>

      <div className="w-full overflow-hidden">
        <div
          className="animate-marquee flex w-max items-center gap-6 sm:gap-8 lg:gap-10"
          style={MARQUEE_STYLE}
        >
          {loopMentors.map((mentor, index) => (
            <div
              key={`${mentor.name}-${index}`}
              className="flex w-[260px] shrink-0 flex-col items-center sm:w-[320px] lg:w-[320px]"
            >
              <div className="relative z-10 flex w-full flex-col items-center gap-2 rounded-[20px] bg-[#081EEA] px-4 py-4 text-center drop-shadow-[4px_4px_0px_black] sm:gap-3 sm:px-5 sm:py-5">
                <p className="w-full text-lg leading-[1.5] font-semibold tracking-[-0.36px] text-white">
                  {mentor.name}
                </p>
                <p className="w-full text-lg leading-[1.5] font-normal tracking-[-0.36px] text-white">
                  {mentor.role}
                </p>
              </div>

              <div className="relative z-0 -mt-2">{mentor.portrait}</div>

              <div className="relative z-10 -mt-2 flex w-full items-center gap-5 rounded-[20px] bg-[#081EEA] px-4 py-3 drop-shadow-[4px_4px_0px_black]">
                <span className="h-0 flex-1 border-t border-dashed border-[#F9F9F9]" />
                <span className="h-[18px] w-[18px] shrink-0 rounded-full bg-[#F9F9F9]" />
                <span className="h-0 flex-1 border-t border-dashed border-[#F9F9F9]" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
