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

// Rasio area foto — SATU sumber untuk semua breakpoint. Lebar kartu 220px
// (mobile) / 260px (sm ke atas), jadi area foto tampil 220×254 / 260×300 px.
// Ukuran ideal file foto (3× tampilan desktop): 780 × 900 px (rasio 13:15),
// PNG background transparan. ±8% bagian bawah foto tertutup kartu nama —
// jangan taruh tangan/tulisan di sana. File dengan rasio lain tetap tampil
// (object-cover) tapi sisi kiri-kanan atau atasnya terpotong.
const FOTO_RASIO = "13 / 15";

const MARQUEE_STYLE = {
  "--marquee-duration": "28s",
  "--marquee-distance": "-25%",
} as CSSProperties;

function MentorCard({ mentor }: { mentor: LandingMentorItem }) {
  const asalLine = [mentor.jurusan, mentor.asalPtn].filter(Boolean).join(" ");

  return (
    <div className="flex h-full w-[220px] shrink-0 flex-col sm:w-[260px]">
      {/* Blok foto — border-radius HANYA di sisi ATAS (rounded-t-[20px]);
          bagian bawah dibiarkan rata supaya menyatu dengan card info yang
          naik menutupinya. Ukurannya dari lebar kartu × FOTO_RASIO, jadi
          sama untuk semua mentor apa pun ukuran file fotonya.
          object-cover + object-bottom (bawah-tengah): foto selalu memenuhi
          area dan badan mentor menempel ke tepi bawah, tepat di titik
          overlap card info. Foto dengan rasio FOTO_RASIO tidak terpotong;
          rasio lain terpotong di sisi/atas, bukan di bawah. */}
      <div
        className={`relative w-full shrink-0 overflow-hidden rounded-t-[20px] ${CARD_BG_CLASS}`}
        style={{ aspectRatio: FOTO_RASIO }}
      >
        <Image
          src={mentor.fotoLandingUrl}
          alt={mentor.nama}
          fill
          className="object-cover object-bottom drop-shadow-[0_8px_16px_rgba(0,0,0,0.15)]"
          sizes="(max-width: 640px) 220px, 260px"
        />
      </div>

      {/* Card info — naik menutupi 20px (mobile) / 24px (sm+) bagian bawah
          foto lewat negative margin. Tingginya TETAP (h-[128px]/h-[136px]:
          nama 1 baris + jurusan/PTN 2 baris + badge + padding) supaya semua
          kartu sama tinggi dan badge sejajar, baik jurusan/PTN-nya satu
          maupun dua baris. `relative` + z-10 wajib: tanpa itu blok foto di
          atas yang digambar belakangan akan menimpa card ini. */}
      <div className="relative z-10 -mt-5 flex h-[128px] w-full shrink-0 flex-col items-center gap-1.5 overflow-hidden rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-4 py-3 text-center shadow-[1px_2px_8px_0px_rgba(0,0,0,0.1)] sm:-mt-6 sm:h-[136px] sm:px-5 sm:py-4">
        <p
          className="w-full shrink-0 truncate text-lg leading-[1.5] font-semibold tracking-[-0.36px] text-black"
          title={mentor.nama}
        >
          {mentor.nama}
        </p>
        {asalLine && (
          // min-h = 2 baris × 21px (text-sm × leading 1.5): tempat dua baris
          // selalu dipesan, lebih dari dua baris dipotong dengan "…".
          <p
            className="line-clamp-2 min-h-[42px] w-full shrink-0 text-sm leading-[1.5] tracking-[-0.36px] text-[#7E7C7C]"
            title={asalLine}
          >
            {asalLine}
          </p>
        )}
        {/* Selalu satu badge (subtes utama). mt-auto menempelkannya ke bawah
            card; whitespace-nowrap + truncate supaya nama subtes panjang
            tidak membungkus dan menambah tinggi. */}
        {mentor.subtesUtama && (
          <span
            className="mt-auto inline-block max-w-full shrink-0 truncate rounded-full bg-[#F9FAFF] px-2.5 py-0.5 text-xs font-medium text-[#081EEA]"
            title={mentor.subtesUtama}
          >
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
          // items-stretch: semua kartu setinggi kartu tertinggi (dan karena
          // tinggi foto + card info tetap, memang semuanya sama tinggi).
          className="animate-marquee flex w-max items-stretch gap-6 sm:gap-8 lg:gap-10"
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
