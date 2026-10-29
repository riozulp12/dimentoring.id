"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { tujuanTautanDalam } from "@/lib/shared/studio-soal/peringatanKeluar";

/**
 * Peringatan "perubahan belum tersimpan" (revisi UX-3 butir 5), dipakai
 * halaman bacaan + soal dan halaman soal.
 *
 * 1. Menutup tab / refresh / mengetik alamat lain: listener `beforeunload`
 *    dipasang SEKALI dan membaca keadaan terbaru lewat ref (tidak ada celah
 *    saat efek dipasang ulang). Memanggil preventDefault() DAN mengisi
 *    returnValue — Chrome baru cukup preventDefault, Safari & browser lama
 *    butuh returnValue. Teks dialog ditentukan browser, tidak bisa diubah.
 * 2. Tautan di dalam aplikasi (mis. "← Studio Soal", menu samping): klik
 *    pada <a> sesama asal dicegat di fase capture `document`, SEBELUM
 *    handler <Link> Next berjalan, lalu muncul Modal "Keluar tanpa
 *    menyimpan?". Bila mentor memilih keluar, pindah lewat router.push.
 *
 * Batasan: tombol Kembali/Maju browser (popstate) tidak bisa dicegat tanpa
 * merombak routing — untuk itu hanya ada (1) bila halaman benar-benar
 * dimuat ulang. Perpindahan lewat kode (router.push sesudah aksi berhasil,
 * mis. versi baru / hapus draf) memang disengaja dan tidak dicegat.
 */
export default function PenjagaKeluar({ adaPerubahan }: { adaPerubahan: boolean }) {
  const router = useRouter();
  const kotorRef = useRef(adaPerubahan);
  const [tujuan, setTujuan] = useState<string | null>(null);
  const idJudul = useId();

  useEffect(() => {
    kotorRef.current = adaPerubahan;
  }, [adaPerubahan]);

  useEffect(() => {
    function sebelumTutup(e: BeforeUnloadEvent) {
      if (!kotorRef.current) return;
      e.preventDefault();
      // Wajib untuk Safari & browser lama (nilai string apa pun memicu dialog).
      e.returnValue = "";
    }
    function klik(e: MouseEvent) {
      if (!kotorRef.current) return;
      const href = tujuanTautanDalam(e, window.location.href);
      if (!href) return;
      e.preventDefault();
      e.stopPropagation();
      setTujuan(href);
    }
    window.addEventListener("beforeunload", sebelumTutup);
    document.addEventListener("click", klik, true);
    return () => {
      window.removeEventListener("beforeunload", sebelumTutup);
      document.removeEventListener("click", klik, true);
    };
  }, []);

  function keluar() {
    const href = tujuan;
    setTujuan(null);
    if (!href) return;
    kotorRef.current = false;
    router.push(href);
  }

  return (
    <Modal open={tujuan !== null} onClose={() => setTujuan(null)} labelledBy={idJudul}>
      <div className="flex flex-col gap-4">
        <h2 id={idJudul} className="pr-8 text-lg font-medium text-black">
          Keluar tanpa menyimpan?
        </h2>
        <p className="text-sm text-black">Ada perubahan yang belum disimpan. Kalau keluar sekarang, perubahan itu hilang.</p>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={keluar}>
            Keluar tanpa menyimpan
          </Button>
          <Button size="sm" onClick={() => setTujuan(null)}>
            Tetap di sini
          </Button>
        </div>
      </div>
    </Modal>
  );
}
