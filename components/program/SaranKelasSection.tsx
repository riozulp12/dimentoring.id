import KelasCardFrame from "@/components/program/KelasCardFrame";
import KelasCardMeta from "@/components/program/KelasCardMeta";
import type { KelasCardPreview } from "@/lib/dashboard/getProgramData";
import type { SessionRole } from "@/lib/auth/session";

/** "Kelas lain di program ini" di detail kelas publik — kartu kelas yang sama dengan /program (KelasCardFrame +
 * KelasCardMeta), tiap kartu link ke detail kelasnya. Satu kolom di HP, dua di tablet, maksimal tiga di desktop.
 * Tanpa item = tidak ada yang dirender (tanpa judul kosong). Server component; tidak menyentuh pembayaran. */
export default function SaranKelasSection({
  items,
  sessionRole,
}: {
  items: KelasCardPreview[];
  sessionRole: SessionRole | null;
}) {
  if (items.length === 0) return null;
  return (
    <section className="mt-4 flex flex-col gap-4 sm:mt-6 sm:gap-5" aria-labelledby="kelas-lain-program">
      <h2 id="kelas-lain-program" className="text-lg leading-[1.5] font-semibold tracking-[-0.36px] text-black sm:text-xl">
        Kelas lain di program ini
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
        {items.map((item, idx) => (
          <KelasCardFrame
            key={item.id}
            href={`/program/kelas/${item.id}`}
            namaKelas={item.nama}
            index={idx}
            diskonAktif={item.diskonAktif}
            kapasitasInfo={item.kapasitasInfo}
            programKategori={item.programKategori}
            tingkatKelas={item.tingkatKelas}
            subtesNama={item.subtesNama}
          >
            <KelasCardMeta item={item} sessionRole={sessionRole} />
          </KelasCardFrame>
        ))}
      </div>
    </section>
  );
}
