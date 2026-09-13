"use client";

import Image from "next/image";
import type { CSSProperties } from "react";
import type { LandingMentorItem } from "@/lib/landing/getLandingMentors";
import { useMarqueeClone } from "@/lib/hooks/useMarqueeClone";

interface MentorProps {
  mentors: LandingMentorItem[];
}

// Background SERAGAM untuk semua card (BUKAN rotasi warna per-index seperti
// KelasCardVisual) — foto PNG (background sudah dihapus) mentor menonjol di
// atasnya, terinspirasi Habitutor (lihat PRD Bagian 4.1). Warna SAMA PERSIS
// dengan preview di Admin (components/admin/MentorLandingFotoSection.tsx)
// supaya konsisten dari upload sampai tampil di landing page.
const CARD_BG_CLASS = "bg-[#F3F5FF]";

const MARQUEE_STYLE = {
  "--marquee-duration": "28s",
  "--marquee-distance": "-25%",
} as CSSProperties;

function MentorCard({ mentor }: { mentor: LandingMentorItem }) {
  const asalLine = [mentor.jurusan, mentor.asalPtn].filter(Boolean).join(" ");

  return (
    <div className="flex w-[220px] shrink-0 flex-col items-center gap-3 sm:w-[260px]">
      <div className={`relative h-[260px] w-full overflow-hidden rounded-[20px] ${CARD_BG_CLASS} sm:h-[300px]`}>
        <Image
          src={mentor.fotoLandingUrl}
          alt={mentor.nama}
          fill
          className="object-contain object-bottom drop-shadow-[0_8px_16px_rgba(0,0,0,0.15)]"
          sizes="(max-width: 640px) 220px, 260px"
        />
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
  // 4 salinan total di DOM (1 asli + 3 klon client-side) supaya
  // translateX(-25%) di CSS loop mulus — lihat useMarqueeClone. Dipanggil
  // sebelum early return manapun (aturan Hooks — harus unconditional).
  const trackRef = useMarqueeClone<HTMLDivElement>(4);

  // Section disembunyikan TOTAL kalau belum ada satupun mentor yang
  // di-tampilkan Admin (tampil_di_landing=true) — bukan threshold minimum
  // seperti sebelumnya (PRD Bagian 4.3 #6, direvisi September 2026).
  if (mentors.length === 0) return null;

  return (
    <section
      id="mentor"
      className="flex w-full scroll-mt-24 flex-col items-center gap-8 px-5 py-10 sm:px-8 sm:py-12 md:px-12 lg:gap-12 lg:px-[120px] lg:py-16 min-[1440px]:scroll-mt-32"
    >
      <div className="flex w-[900px] max-w-full flex-col items-center gap-3 text-center sm:gap-5">
        <h2 className="text-lg leading-[1.5] font-semibold tracking-[-0.36px] text-black sm:text-xl sm:whitespace-nowrap">
          Kenalan dengan Mentor Hebat{" "}
          <span className="text-[#081EEA]">Dimentoring</span>
        </h2>
        <p className="text-base leading-[1.5] tracking-[-0.36px] text-black sm:whitespace-nowrap">
          Mereka siap mendampingi perjalanan belajarmu dengan sepenuh hati dan
          profesionalitas
        </p>
      </div>

      <div className="w-full overflow-hidden">
        <div
          ref={trackRef}
          className="animate-marquee flex w-max items-center gap-6 sm:gap-8 lg:gap-10"
          style={MARQUEE_STYLE}
        >
          {mentors.map((mentor) => (
            <MentorCard key={mentor.id} mentor={mentor} />
          ))}
        </div>
      </div>
    </section>
  );
}
