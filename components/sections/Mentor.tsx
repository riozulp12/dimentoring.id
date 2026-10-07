"use client";

import Image from "next/image";
import type { CSSProperties } from "react";
import type { LandingMentorItem } from "@/lib/landing/getLandingMentors";
import { useMarqueeClone } from "@/lib/hooks/useMarqueeClone";

interface MentorProps {
  mentors: LandingMentorItem[];
}

// Background SERAGAM untuk semua card (BUKAN rotasi warna per-index seperti
// KelasCardVisual) — foto PNG (background sudah dihapus manual oleh Admin
// sebelum upload, bukan hasil background-removal otomatis) menonjol di
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
    <div className="flex w-[220px] shrink-0 flex-col sm:w-[260px]">
      {/* Blok foto — border-radius HANYA di sisi ATAS (rounded-t-[20px]);
          bagian bawah dibiarkan rata supaya menyatu dengan card info yang
          naik menutupinya. Tinggi & lebar FIXED (aspect ratio tetap) +
          object-contain, jadi foto dengan resolusi/rasio berapa pun tidak
          mengubah tinggi blok ini — efek overlap di bawah tidak pernah
          bergeser. object-contain (bukan cover) dipertahankan karena foto
          mentor di sini adalah PNG yang background-nya sudah dihapus manual
          oleh Admin: cover akan memotong kepala/badan subjek pada foto yang
          rasionya beda, sementara contain selalu menampilkan figur utuh.
          object-bottom WAJIB disandingkan dengan object-contain: tanpa itu
          Next/Image men-center foto secara vertikal, jadi foto yang lebih
          pendek dari container (rasio beda) akan menyisakan ruang kosong DI
          BAWAH figur — persis di titik overlap card info — dan efek overlap
          jadi menimpa ruang kosong/background, bukan badan mentor.
          object-bottom memaksa figur selalu menempel ke tepi bawah container
          apa pun rasionya, jadi overlap konsisten mengenai badan mentor. */}
      <div className={`relative h-[260px] w-full overflow-hidden rounded-t-[20px] ${CARD_BG_CLASS} sm:h-[300px]`}>
        <Image
          src={mentor.fotoLandingUrl}
          alt={mentor.nama}
          fill
          className="object-contain object-bottom drop-shadow-[0_8px_16px_rgba(0,0,0,0.15)]"
          sizes="(max-width: 640px) 220px, 260px"
        />
      </div>

      {/* Card info — naik menutupi ±20px bagian bawah foto (negative margin,
          bukan absolute, supaya tinggi card tetap ikut kontennya). `relative`
          + z-10 wajib: tanpa itu blok foto di atas yang digambar belakangan
          akan menimpa card ini. */}
      <div className="relative z-10 -mt-5 flex w-full flex-col items-center gap-1.5 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-4 py-3 text-center shadow-[1px_2px_8px_0px_rgba(0,0,0,0.1)] sm:-mt-6 sm:px-5 sm:py-4">
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
          // items-start (bukan items-center): tinggi card info bisa beda antar
          // mentor (asal PTN/subtes tidak selalu ada), dan dengan overlap foto
          // ke card, yang WAJIB sejajar antar card adalah bagian ATAS foto.
          className="animate-marquee flex w-max items-start gap-6 sm:gap-8 lg:gap-10"
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
