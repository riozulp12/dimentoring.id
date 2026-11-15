import KelasCardFrame from "@/components/program/KelasCardFrame";
import KelasCardMeta from "@/components/program/KelasCardMeta";
import type { KelasCardPreview } from "@/lib/dashboard/getProgramData";
import type { SessionRole } from "@/lib/auth/session";

/** Grid kartu kelas 1 kategori program (PRD 7.5.4) — dipakai SEMUA halaman
 * /program/[kategori] supaya ukuran & isi kartu selalu konsisten. Server
 * component; tidak menyentuh checkout atau pembayaran. */
export default function KategoriKelasGrid({
  items,
  sessionRole,
}: {
  items: KelasCardPreview[];
  sessionRole: SessionRole | null;
}) {
  return (
    <div className="grid w-full grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
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
          compact
        >
          <KelasCardMeta item={item} sessionRole={sessionRole} compact />
        </KelasCardFrame>
      ))}
    </div>
  );
}
