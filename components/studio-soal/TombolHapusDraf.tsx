"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { panggilApi } from "@/components/studio-soal/klien";
import type { ObjekStudio } from "@/lib/shared/studio-soal/formSoal";

/**
 * Tombol "Hapus draf" + jendela konfirmasi (Studio Soal UX-1). Dipakai di
 * halaman daftar dan halaman edit, untuk soal maupun bacaan.
 *
 * Bila `alasan` terisi (tidak bisa dihapus), klik tombol membuka jendela yang
 * menjelaskan alasannya — tombol tidak disembunyikan supaya mentor tahu
 * kenapa. Database tetap memeriksa ulang; pesan penolakan server ditampilkan
 * apa adanya.
 */
export default function TombolHapusDraf({
  objek,
  id,
  alasan,
  sesudahHapus,
  versi = 1,
  className,
}: {
  objek: ObjekStudio;
  id: string;
  /** null = boleh dihapus. */
  alasan: string | null;
  /** Ke mana setelah berhasil; kosong = muat ulang halaman ini. */
  sesudahHapus?: string;
  /** Versi > 1 = draf versi baru dari yang sudah terbit. */
  versi?: number;
  className?: string;
}) {
  const router = useRouter();
  const [buka, setBuka] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  const [gagal, setGagal] = useState<string | null>(null);
  const nama = objek === "soal" ? "soal" : "bacaan";

  function tutup() {
    if (sibuk) return;
    setBuka(false);
    setGagal(null);
  }

  async function hapus() {
    if (sibuk) return;
    setSibuk(true);
    setGagal(null);
    const r = await panggilApi(`/api/studio-soal/${objek}/${id}`, "DELETE");
    setSibuk(false);
    if (!r.ok) {
      setGagal(String(r.json.error ?? "Draf belum terhapus. Coba lagi."));
      return;
    }
    setBuka(false);
    if (sesudahHapus) router.push(sesudahHapus);
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setBuka(true)}
        className={["text-sm font-medium text-danger hover:underline", className].filter(Boolean).join(" ")}
      >
        Hapus draf
      </button>
      <Modal open={buka} onClose={tutup}>
        <div className="flex flex-col gap-4">
          {alasan ? (
            <>
              <h2 className="pr-8 text-lg font-medium text-black">Draf ini tidak bisa dihapus</h2>
              <p className="text-sm text-black">{alasan}</p>
              <div className="flex justify-end">
                <Button variant="secondary" size="sm" onClick={tutup}>
                  Mengerti
                </Button>
              </div>
            </>
          ) : (
            <>
              <h2 className="pr-8 text-lg font-medium text-black">Hapus {nama} ini?</h2>
              <p className="text-sm text-black">
                Tidak bisa dibatalkan.
                {versi > 1 ? ` Ini versi baru — ${nama} versi sebelumnya yang sudah terbit tetap dipakai.` : ""}
              </p>
              {gagal ? (
                <p role="alert" className="rounded-[12px] bg-danger-soft px-3 py-2 text-sm text-danger">
                  {gagal}
                </p>
              ) : null}
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="secondary" size="sm" onClick={tutup} disabled={sibuk}>
                  Batal
                </Button>
                <Button size="sm" onClick={hapus} disabled={sibuk}>
                  {sibuk ? "Menghapus…" : "Ya, hapus"}
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </>
  );
}
