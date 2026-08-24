import Link from "next/link";
import Button from "@/components/ui/Button";
import Mascot from "@/components/ui/Mascot";

export default function Statement() {
  return (
    <section className="flex w-full flex-col px-5 py-10 sm:px-8 sm:py-12 md:px-12 lg:px-20 lg:py-16">
      <div className="relative flex w-full flex-col items-center gap-6 overflow-hidden rounded-[32px] border-[0.8px] border-[#E3E3E3] bg-white px-6 py-8 text-center shadow-[1px_2px_8px_0px_rgba(0,0,0,0.1)] sm:gap-8 sm:rounded-[48px] sm:px-10 sm:py-10 lg:flex-row lg:items-center lg:gap-0 lg:rounded-[64px] lg:p-0 lg:text-left">
        <Mascot
          variant="Plenger"
          className="pointer-events-none h-[140px] w-auto select-none sm:h-[200px] lg:absolute lg:top-8 lg:left-6 lg:h-[260px] min-[1440px]:top-11 min-[1440px]:left-8 min-[1440px]:h-[380px]"
        />
        <div className="flex flex-col items-center gap-3 sm:gap-4 lg:items-start lg:gap-[14px] lg:py-8 lg:pr-10 lg:pl-[320px] min-[1440px]:gap-[18px] min-[1440px]:py-10 min-[1440px]:pr-16 min-[1440px]:pl-[476px]">
          <h4 className="text-lg leading-[1.5] font-semibold tracking-[-0.36px] text-black sm:text-xl">
            Tidak Semua{" "}
            <span className="text-[#081EEA]">Perjalanan Belajarmu</span> Sama
            dengan Temanmu
            <br className="hidden lg:block" /> Kamu{" "}
            <span className="text-[#081EEA]">Punya Versimu</span> Sendiri
          </h4>
          <p className="text-base leading-[1.5] tracking-[-0.36px] text-black">
            Temukan versi belajarmu dan gapai cita - citamu bersama kami, kami
            akan bimbing kamu sampai berhasil
          </p>

          {/* PRD Bagian 4.3 #10: closing section sebelumnya cuma tagline tanpa
              CTA konversi — ditambahkan judul + 1 CTA ke /daftar dalam kartu
              yang sama (posisi paling bawah halaman, beda dari Hero yang
              lebih baik ke /assessment dulu). */}
          <h4 className="mt-2 text-lg leading-[1.5] font-semibold tracking-[-0.36px] text-black sm:mt-3 sm:text-xl">
            Siap Mulai Perjalanan ke <span className="text-[#081EEA]">PTN Impianmu</span>?
          </h4>
          <Link href="/daftar">
            <Button variant="primary" size="xl">
              Daftar Sekarang
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}
