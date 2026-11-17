import KontenInfoCard from "@/components/beasiswa-event/KontenInfoCard";
import type { KontenInfoListItem } from "@/lib/dashboard/getInfoBeasiswaEvent";

/** "Program lainnya" di bawah card detail event — kartu event yang sama dengan daftar /beasiswa-event. Satu kolom
 * di HP, dua di tablet, maksimal tiga di desktop. Tanpa item = tidak ada yang dirender (tanpa judul kosong). */
export default function ProgramLainnyaSection({ items }: { items: KontenInfoListItem[] }) {
  if (items.length === 0) return null;
  return (
    <section className="mt-8 flex flex-col gap-4 sm:mt-10 sm:gap-5" aria-labelledby="program-lainnya">
      <h2 id="program-lainnya" className="text-lg leading-[1.5] font-semibold tracking-[-0.36px] text-black sm:text-xl">
        Program lainnya
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
        {items.map((item) => (
          <KontenInfoCard key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}
