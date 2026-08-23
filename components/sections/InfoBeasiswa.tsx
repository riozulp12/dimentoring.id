import Link from "next/link";
import Button from "@/components/ui/Button";
import { getInfoBeasiswaEvent } from "@/lib/dashboard/getInfoBeasiswaEvent";
import { formatDeadline } from "@/lib/shared/formatDeadline";
import { KONTEN_INFO_TIPE_BADGE_CLASS, KONTEN_INFO_TIPE_LABEL } from "@/lib/shared/kontenInfoLabels";

/**
 * Section "Info Beasiswa & Internship" — diferensiasi utama Dimentoring:
 * pendampingan tidak berhenti setelah diterima PTN (PRD Bagian 4.3, konten
 * publik dari `konten_info`, reuse query yang sama dengan card "Info
 * Beasiswa & Event" di Dashboard Siswa/Mentor — lihat
 * lib/dashboard/getInfoBeasiswaEvent.ts).
 *
 * FALLBACK SENGAJA: kalau data aktif kurang dari 3, section ini disembunyikan
 * total (bukan tampil dengan card kosong/sedikit) — biar tidak terkesan
 * platform sepi konten begitu publik lihat landing page.
 */
export default async function InfoBeasiswa() {
  const items = await getInfoBeasiswaEvent(4);
  if (items.length < 3) return null;

  return (
    <section className="flex w-full flex-col items-center gap-8 px-5 py-10 sm:px-8 sm:py-12 md:px-12 lg:gap-12 lg:px-[120px] lg:py-16">
      <div className="flex w-[643px] max-w-full flex-col items-center gap-3 text-center sm:gap-5">
        <h4 className="text-lg leading-[1.5] font-semibold tracking-[-0.36px] text-black sm:text-xl">
          Perjalananmu Nggak Berhenti Setelah Diterima <span className="text-[#081EEA]">PTN</span>
        </h4>
        <p className="text-lg leading-[1.5] tracking-[-0.36px] text-[#7E7C7C]">
          Dimentoring tetap dampingi kamu lewat info beasiswa, internship, dan event sampai kuliah
        </p>
      </div>

      <div className="flex w-full items-center justify-end">
        <Link
          href="/beasiswa-event"
          className="text-sm font-medium text-[#081EEA] transition-opacity hover:opacity-80 sm:text-base"
        >
          Lihat Semua &rarr;
        </Link>
      </div>

      <div className="grid w-full grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex flex-col items-start gap-3 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white p-[18px] shadow-[1px_2px_4px_0px_rgba(0,0,0,0.1)] sm:gap-4"
          >
            <span
              className={`inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                KONTEN_INFO_TIPE_BADGE_CLASS[item.tipe] ?? "bg-gray-100 text-[#7E7C7C]"
              }`}
            >
              {KONTEN_INFO_TIPE_LABEL[item.tipe] ?? item.tipe}
            </span>
            <p className="line-clamp-2 text-lg leading-[1.5] font-semibold tracking-[-0.36px] text-black">
              {item.judul}
            </p>
            <p className="text-sm leading-[1.5] tracking-[-0.28px] text-[#E70A0A]">
              {formatDeadline(item.deadline)}
            </p>
          </div>
        ))}
      </div>

      <Link href="/daftar">
        <Button variant="primary" size="lg">
          Daftar untuk Lihat Info Lengkap & Lebih Banyak
        </Button>
      </Link>
    </section>
  );
}
