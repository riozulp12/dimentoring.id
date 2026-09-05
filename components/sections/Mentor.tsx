import Image from "next/image";
import type { CSSProperties } from "react";
import Avatar from "@/components/ui/Avatar";
import type { LandingMentorItem } from "@/lib/landing/getLandingMentors";

interface MentorProps {
  mentors: LandingMentorItem[];
}

const MIN_MENTORS_TO_SHOW = 3;

// Bentuk organik "mengambang" di belakang foto — border-radius asimetris
// (bukan lingkaran sempurna) supaya terasa dinamis. Warna REUSE 4 warna
// brand yang sudah dipakai di landing page (biru utama Mentor/Program/dst,
// + 3 warna aksen dari Prediction.tsx keketatan/peluang) — dirotasi per
// card berdasarkan urutan mentor, bukan warna baru.
const ORGANIC_SHAPE_COLORS = ["#081EEA", "#0CBA00", "#006ABD", "#E70A0A"];
const ORGANIC_SHAPE_RADIUS = "50% 50% 48% 52% / 55% 52% 48% 45%";

const MARQUEE_STYLE = {
  "--marquee-duration": "28s",
  "--marquee-distance": "-25%",
} as CSSProperties;

function MentorCard({ mentor, color }: { mentor: LandingMentorItem; color: string }) {
  const asalLine = [mentor.jurusan, mentor.asalPtn].filter(Boolean).join(" ");

  return (
    <div className="flex w-[220px] shrink-0 flex-col items-center gap-4 sm:w-[260px]">
      <div className="relative h-[132px] w-[132px] shrink-0 sm:h-[160px] sm:w-[160px]">
        <div
          className="absolute inset-0 z-0"
          style={{ background: color, borderRadius: ORGANIC_SHAPE_RADIUS }}
          aria-hidden="true"
        />
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <div className="rounded-full border-4 border-white shadow-[0_2px_10px_0px_rgba(0,0,0,0.15)]">
            <Avatar avatarUrl={mentor.avatarUrl} nama={mentor.nama} size="xl" />
          </div>
        </div>
        <div className="absolute right-1 bottom-1 z-20 flex h-6 w-6 items-center justify-center rounded-full bg-[#081EEA] ring-2 ring-white sm:h-7 sm:w-7">
          <Image
            src="/icons/logo-icon-secondary.svg"
            width={27}
            height={40}
            alt=""
            className="h-3 w-auto sm:h-3.5"
          />
        </div>
      </div>

      <div className="flex w-full flex-col items-center gap-1.5 text-center">
        <p className="w-full text-lg leading-[1.5] font-semibold tracking-[-0.36px] text-black">
          {mentor.nama}
        </p>
        {asalLine && (
          <p className="w-full text-sm leading-[1.5] tracking-[-0.36px] text-[#7E7C7C]">
            {asalLine}
          </p>
        )}
        {mentor.subtesUtama && (
          <span className="inline-flex items-center rounded-full bg-[#F9FAFF] px-2.5 py-0.5 text-xs font-medium text-[#081EEA]">
            {mentor.subtesUtama}
          </span>
        )}
      </div>
    </div>
  );
}

export default function Mentor({ mentors }: MentorProps) {
  if (mentors.length < MIN_MENTORS_TO_SHOW) return null;

  const loopMentors = [...mentors, ...mentors, ...mentors, ...mentors];

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
            <MentorCard
              key={`${mentor.id}-${index}`}
              mentor={mentor}
              color={ORGANIC_SHAPE_COLORS[index % mentors.length % ORGANIC_SHAPE_COLORS.length]}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
