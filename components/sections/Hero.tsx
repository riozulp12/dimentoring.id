"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";

/**
 * PRD Bagian 4.3 #1: Hero sempat punya 2 CTA setara bobot (bingungkan user
 * mana yang diklik duluan). Direvisi jadi 1 CTA dominan ke /assessment
 * (fitur paling langsung bisa dirasakan tanpa perlu daftar dulu), CTA kedua
 * desainnya tetap (variant="secondary", size="md") tapi diarahkan ke
 * /program (dibuat setelah revisi ini).
 */

const AVATARS = [
  "/images/hero-avatar-1.png",
  "/images/hero-avatar-2.png",
  "/images/hero-avatar-3.png",
  "/images/hero-avatar-4.png",
  "/images/hero-avatar-5.png",
];

export default function Hero() {
  const router = useRouter();

  return (
    <section className="w-full bg-gradient-to-b from-[#E7EAFF] to-[#F7F8FF] px-5 py-10 sm:px-8 sm:py-14 md:px-12 lg:px-20 lg:py-[72px]">
      <div className="flex w-full flex-col items-center gap-10 sm:gap-12 lg:flex-row lg:items-center lg:justify-between lg:gap-16">
        <div className="flex min-w-0 flex-col items-center gap-10 text-center sm:gap-14 lg:min-w-0 lg:flex-1 lg:items-start lg:gap-20 lg:text-left">
          <div className="flex flex-col items-center gap-4 sm:gap-5 lg:items-start">
            <span className="inline-flex w-fit items-center rounded-[20px] border-[0.8px] border-[#CAC9C9] bg-[#F9F9F9] px-6 py-2 text-sm leading-[1.5] tracking-[-0.28px] text-[#081EEA] sm:px-8 sm:py-2.5 sm:text-lg sm:tracking-[-0.36px]">
              #BertumbuhBersama
            </span>
            <h1 className="max-w-[934px] text-2xl leading-[1.5] font-bold tracking-[-0.48px] text-black sm:text-3xl">
              Setiap Siswa Punya{" "}
              <span className="text-[#081EEA]">Perjalanan</span>
              <br />
              <span className="text-[#081EEA]">Belajar</span> yang Berbeda
            </h1>
            <p className="line-clamp-3 w-full max-w-[540px] text-left text-base leading-[1.5] tracking-[-0.36px] text-black sm:text-center lg:text-left">
              Mulai dari awal menyusun strategi, mempersiapkan menghadapi SNBT
              dan Ujian Mandiri sampai dengan masuk ke perkuliahan,
              Dimentoring hadir sebagai mentor dalam setiap langkahmu
            </p>

            <div className="flex w-full flex-col gap-4 sm:w-auto sm:flex-row sm:gap-6 lg:gap-8">
              <Button
                variant="primary"
                size="lg"
                className="w-full sm:w-auto"
                onClick={() => router.push("/assessment")}
              >
                Cek Peluang Masuk PTN mu
              </Button>
              <Button
                variant="secondary"
                size="md"
                className="w-full sm:w-auto"
                onClick={() => router.push("/program")}
              >
                Lihat Program
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-5 lg:justify-start">
            <div className="flex items-center">
              {AVATARS.map((src, index) => (
                <Image
                  key={src}
                  src={src}
                  width={56}
                  height={56}
                  alt=""
                  className={[
                    "h-10 w-10 rounded-full object-cover sm:h-12 sm:w-12 lg:h-14 lg:w-14",
                    index > 0 ? "-ml-4 sm:-ml-5 lg:-ml-6" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                />
              ))}
            </div>
            <div className="flex flex-col items-center gap-2 lg:items-start">
              <p className="text-lg font-medium leading-[1.5] tracking-[-0.36px] text-black">
                30+ Siswa
              </p>
              <p className="w-full max-w-[382px] text-center text-base leading-[1.5] tracking-[-0.36px] text-black lg:text-left">
                Lebih dari 30 siswa telah belajar dengan kami dan mendapatkan
                PTN impiannya
              </p>
            </div>
          </div>
        </div>

        <Image
          src="/images/hero-illustration.png"
          width={716}
          height={790}
          alt="Ilustrasi siswa belajar dan dibimbing mentor Dimentoring menuju PTN impian"
          className="h-auto w-full min-w-0 max-w-[230px] sm:max-w-[480px] md:max-w-[620px] lg:max-w-none lg:flex-1"
          priority
        />
      </div>
    </section>
  );
}
