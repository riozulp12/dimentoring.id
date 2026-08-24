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
    <div className="relative z-10 mt-8 h-[232px] w-[160px] overflow-hidden sm:h-[290px] sm:w-[200px] lg:h-[290px] lg:w-[200px]">
      <Image src={src} alt={alt} fill className="object-cover object-top" />
    </div>
  );
}

function RotatedCoverPortrait({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="relative z-10 mt-8 flex h-[232px] w-[160px] items-center justify-center overflow-hidden sm:h-[290px] sm:w-[200px] lg:h-[290px] lg:w-[200px]">
      <div className="relative h-[160px] w-[232px] shrink-0 rotate-90 sm:h-[200px] sm:w-[290px] lg:h-[200px] lg:w-[290px]">
        <Image src={src} alt={alt} fill className="object-cover object-center" />
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
    <section
      id="mentor"
      className="flex w-full scroll-mt-24 flex-col items-center gap-8 px-5 py-10 sm:px-8 sm:py-12 md:px-12 lg:gap-12 lg:px-[120px] lg:py-16 min-[1440px]:scroll-mt-32"
    >
      <div className="flex w-[900px] max-w-full flex-col items-center gap-3 text-center sm:gap-5">
        <h4 className="text-lg leading-[1.5] font-semibold tracking-[-0.36px] text-black sm:text-xl sm:whitespace-nowrap">
          Kenalan dengan Mentor Hebat{" "}
          <span className="text-[#081EEA]">Dimentoring</span>
        </h4>
        <p className="text-base leading-[1.5] tracking-[-0.36px] text-black sm:whitespace-nowrap">
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
              <div className="relative z-0 flex w-[160px] flex-col items-center sm:w-[200px] lg:w-[200px]">
                <Image
                  src="/icons/mentor-badge-shape.svg"
                  width={179}
                  height={264}
                  alt=""
                  className="pointer-events-none absolute top-0 left-1/2 h-auto w-[125px] -translate-x-1/2 select-none sm:w-[156px] lg:w-[156px]"
                />
                {mentor.portrait}
              </div>
              <div className="relative z-10 -mt-6 flex w-full flex-col items-center gap-3 rounded-[20px] bg-[#081EEA] px-4 py-4 drop-shadow-[4px_4px_0px_black] sm:-mt-8 sm:gap-4 sm:px-5 lg:-mt-10 lg:gap-[19px] lg:px-6 lg:py-5">
                <div className="flex w-full max-w-[382px] flex-col items-center gap-2 text-center text-white sm:gap-3 lg:gap-4">
                  <p className="w-full text-lg leading-[1.5] font-semibold tracking-[-0.36px]">
                    {mentor.name}
                  </p>
                  <p className="w-full text-base leading-[1.5] font-normal tracking-[-0.36px]">
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
      </div>
    </section>
  );
}
