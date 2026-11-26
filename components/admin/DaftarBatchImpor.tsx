"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { KARTU, pesanKelas } from "@/components/studio-soal/gaya";
import { panggilApi } from "@/components/studio-soal/klien";
import { teksDilewati, type BatchRingkas, type SoalDilewati } from "@/lib/shared/studio-soal/bankSoal";
import { formatTanggalSoal } from "@/lib/shared/studio-soal/tanggalSoal";

/** Daftar batch impor di Bank Soal (Admin) + terbit & hapus draf satu batch. */
export default function DaftarBatchImpor({ batch }: { batch: BatchRingkas[] }) {
  const router = useRouter();
  const idJudul = useId();
  const [dipilih, setDipilih] = useState<BatchRingkas | null>(null);
  const [akanTerbit, setAkanTerbit] = useState<BatchRingkas | null>(null);
  const idJudulTerbit = useId();
  const [dilewati, setDilewati] = useState<SoalDilewati[]>([]);
  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState<{ jenis: "ok" | "gagal"; teks: string } | null>(null);

  async function hapus() {
    if (!dipilih || sibuk) return;
    setSibuk(true);
    setDilewati([]);
    const r = await panggilApi(`/api/admin/studio-soal/bank/batch/${dipilih.id}`, "DELETE");
    setSibuk(false);
    setDipilih(null);
    setPesan(
      r.ok
        ? { jenis: "ok", teks: String(r.json.pesan ?? "Draf dihapus.") }
        : { jenis: "gagal", teks: String(r.json.error ?? "Draf belum terhapus. Coba lagi.") },
    );
    if (r.ok) router.refresh();
  }

  async function terbitkan() {
    if (!akanTerbit || sibuk) return;
    setSibuk(true);
    setDilewati([]);
    const r = await panggilApi("/api/admin/studio-soal/impor/terbitkan", "POST", { batchId: akanTerbit.id });
    setSibuk(false);
    setAkanTerbit(null);
    const lewat = Array.isArray(r.json.dilewati) ? (r.json.dilewati as SoalDilewati[]) : [];
    setDilewati(lewat);
    setPesan(
      r.ok
        ? {
            jenis: lewat.length > 0 ? "gagal" : "ok",
            teks: `${Number(r.json.diterbitkan ?? 0)} soal diterbitkan${lewat.length > 0 ? `, ${lewat.length} dilewati` : ""}.`,
          }
        : { jenis: "gagal", teks: String(r.json.error ?? "Soal belum terbit. Coba lagi.") },
    );
    // Sebagian bisa saja sudah terbit walau permintaan gagal di tengah jalan.
    router.refresh();
  }

  const tahan = dipilih ? dipilih.terbit + dipilih.arsip + dipilih.lainnya : 0;

  return (
    <section className={KARTU}>
      <h2 className="text-lg font-medium text-black">Batch impor</h2>
      {pesan ? (
        <p role={pesan.jenis === "gagal" ? "alert" : "status"} className={pesanKelas(pesan.jenis)}>
          {pesan.teks}
        </p>
      ) : null}
      {dilewati.length > 0 ? (
        <ul className="flex flex-col gap-1 rounded-[12px] bg-danger-soft p-3 text-sm text-danger">
          {dilewati.map((d) => (
            <li key={d.id}>
              <Link href={`/bank-soal/${d.id}`} className="font-medium underline">
                Soal {d.id.slice(0, 8)}…
              </Link>
              : {teksDilewati(d)}
            </li>
          ))}
        </ul>
      ) : null}
      {batch.length === 0 ? (
        <p className="text-sm text-muted">Belum ada unggahan.</p>
      ) : (
        <div className="max-w-full overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-line text-muted">
                {["Berkas", "Diunggah", "Draf", "Terbit", "Arsip", "Aksi"].map((j) => (
                  <th key={j} scope="col" className="py-2 pr-3 font-medium">
                    {j}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {batch.map((b) => (
                <tr key={b.id} className="border-b border-chip last:border-b-0">
                  <td className="py-2 pr-3 break-all">{b.namaBerkas || "(tanpa nama)"}</td>
                  <td className="py-2 pr-3 whitespace-nowrap">{formatTanggalSoal(b.dibuatPada)}</td>
                  <td className="py-2 pr-3">{b.draf}</td>
                  <td className="py-2 pr-3">{b.terbit}</td>
                  <td className="py-2 pr-3">{b.arsip}</td>
                  <td className="py-2 pr-3">
                    <Link href={`/bank-soal?batch=${b.id}`} className="mr-3 whitespace-nowrap text-primary hover:underline">
                      Lihat soal batch ini
                    </Link>
                    {b.drafBaru > 0 ? (
                      <Button size="sm" className="mr-2" onClick={() => setAkanTerbit(b)} disabled={sibuk}>
                        Terbitkan semua draf batch ini
                      </Button>
                    ) : null}
                    {b.draf + b.bacaanAkanDihapus > 0 ? (
                      <Button variant="secondary" size="sm" onClick={() => setDipilih(b)} disabled={sibuk}>
                        Hapus draf
                      </Button>
                    ) : (
                      <span className="text-muted">Tidak ada draf</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={akanTerbit !== null} onClose={() => (sibuk ? undefined : setAkanTerbit(null))} labelledBy={idJudulTerbit}>
        <div className="flex flex-col gap-4">
          <h2 id={idJudulTerbit} className="pr-8 text-lg font-medium text-black">
            Terbitkan {akanTerbit?.drafBaru ?? 0} soal?
          </h2>
          <p className="text-sm text-black">
            {akanTerbit?.drafBaru ?? 0} soal draf dari <strong>{akanTerbit?.namaBerkas}</strong> akan diterbitkan beserta bacaannya.
            Soal terkunci setelah terbit: perubahan berikutnya membuat versi baru. Soal yang belum lengkap tidak diterbitkan dan
            dilaporkan.
            {akanTerbit && akanTerbit.draf > akanTerbit.drafBaru
              ? ` ${akanTerbit.draf - akanTerbit.drafBaru} draf versi baru tidak ikut: terbitkan dari halaman soalnya.`
              : ""}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setAkanTerbit(null)} disabled={sibuk}>
              Batal
            </Button>
            <Button size="sm" onClick={terbitkan} disabled={sibuk}>
              {sibuk ? "Menerbitkan…" : "Ya, terbitkan"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={dipilih !== null} onClose={() => (sibuk ? undefined : setDipilih(null))} labelledBy={idJudul}>
        <div className="flex flex-col gap-4">
          <h2 id={idJudul} className="pr-8 text-lg font-medium text-black">
            Hapus draf batch ini?
          </h2>
          <p className="text-sm text-black">
            {dipilih?.draf ?? 0} soal draf dan {dipilih?.bacaanAkanDihapus ?? 0} bacaan dari <strong>{dipilih?.namaBerkas}</strong> akan
            dihapus permanen, termasuk draf versi baru yang belum diterbitkan. Tindakan ini tidak bisa dibatalkan.
            {tahan > 0 ? ` ${tahan} soal yang bukan draf dipertahankan.` : ""}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setDipilih(null)} disabled={sibuk}>
              Batal
            </Button>
            <Button size="sm" onClick={hapus} disabled={sibuk}>
              {sibuk ? "Menghapus…" : "Ya, hapus draf"}
            </Button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
