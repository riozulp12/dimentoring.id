import Link from "next/link";
import Button from "@/components/ui/Button";

/**
 * Section ajakan Try Out — PRD Bagian 4.3. CTA mengarah ke /tryout (route
 * internal, lihat app/tryout/page.tsx) BUKAN langsung ke domain partner
 * manapun — kerjasama agensoal belum final, jadi copy publik sengaja tidak
 * menyebut nama partner. Kalau nanti keputusan integrasi final, yang perlu
 * diubah cuma app/tryout/page.tsx, bukan link di sini.
 */
export default function TryoutCTA() {
  return (
    <section className="flex w-full flex-col items-center gap-6 bg-[#F9FAFF] px-5 py-10 text-center sm:gap-8 sm:px-8 sm:py-12 md:px-12 lg:px-[120px] lg:py-16">
      <div className="flex w-[643px] max-w-full flex-col items-center gap-3 sm:gap-5">
        <h4 className="text-lg leading-[1.5] font-semibold tracking-[-0.36px] text-black sm:text-xl">
          Uji Kesiapanmu Lewat <span className="text-[#081EEA]">Try Out</span>
        </h4>
        <p className="text-base leading-[1.5] tracking-[-0.36px] text-[#7E7C7C]">
          Latihan soal dan simulasi ujian sungguhan biar kamu makin percaya diri menghadapi hari-H
        </p>
      </div>

      <Link href="/tryout">
        <Button variant="primary" size="lg">
          Mulai Try Out
        </Button>
      </Link>
    </section>
  );
}
