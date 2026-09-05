"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Mascot from "@/components/ui/Mascot";
import MaskotLoading from "@/components/ui/MaskotLoading";

/**
 * Halaman "Menunggu Konfirmasi" — PRD Bagian 13 (payments.status). Polling
 * setInterval + fetch (bukan Supabase Realtime — project ini belum pakai
 * Realtime di mana pun, dan anon key sengaja tidak dipakai buat query tabel
 * data langsung dari client, lihat lib/supabase/client.ts) tiap
 * POLL_INTERVAL_MS ke app/api/payment/status/[orderId]/route.ts, berhenti
 * otomatis setelah TIMEOUT_MS kalau status tidak kunjung berubah.
 *
 * onSuccess Snap.js untuk metode VA/e-wallet async CUMA berarti "transaksi
 * dibuat", BUKAN "uang sudah masuk" — makanya halaman checkout tidak pernah
 * langsung anggap sukses, semua diarahkan kemari dan status final ditentukan
 * di sini dari payments.status (yang cuma diubah webhook, PRD Bagian 8 BR-19).
 */

const POLL_INTERVAL_MS = 4000;
const TIMEOUT_MS = 10 * 60 * 1000; // 10 menit

// payment_type dari Snap.js yang biasanya settle instan (dalam hitungan detik) —
// selebihnya (VA, cstore, dst.) butuh aksi manual lanjutan dari siswa.
const INSTANT_METHODS = new Set(["gopay", "qris", "shopeepay"]);

type PaymentStatus = "menunggu" | "berhasil" | "gagal" | "refunded";

export default function PaymentStatusPoller({
  orderId,
  initialStatus,
  kelasId,
  kelasNama,
  metode,
}: {
  orderId: string;
  initialStatus: PaymentStatus;
  kelasId: string;
  kelasNama: string | null;
  metode: string | null;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<PaymentStatus>(initialStatus);
  const [timedOut, setTimedOut] = useState(false);
  const startedAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (status !== "menunggu") return;
    startedAtRef.current = Date.now();

    const intervalId = setInterval(async () => {
      if (Date.now() - (startedAtRef.current ?? Date.now()) > TIMEOUT_MS) {
        setTimedOut(true);
        clearInterval(intervalId);
        return;
      }

      try {
        const response = await fetch(`/api/payment/status/${orderId}`);
        const json = await response.json();
        if (!response.ok || !json.success) return; // gagal sesaat, coba lagi tick berikutnya

        if (json.status === "berhasil") {
          clearInterval(intervalId);
          router.push(`/kelas/${kelasId}?berhasil=1`);
          return;
        }
        if (json.status !== "menunggu") {
          clearInterval(intervalId);
          setStatus(json.status as PaymentStatus);
        }
      } catch {
        // gagal terhubung sesaat — diamkan, coba lagi tick berikutnya
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [status, orderId, kelasId, router]);

  const namaKelas = kelasNama ?? "kelas ini";

  if (status === "gagal") {
    return (
      <div className="flex flex-col items-center gap-4 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-10 text-center">
        <Mascot variant="Sad" alt="Pembayaran gagal" className="h-32 w-auto" />
        <p className="text-lg font-medium text-black">Pembayaran gagal diproses</p>
        <p className="text-sm text-[#7E7C7C]">Transaksi untuk {namaKelas} tidak berhasil. Kamu bisa coba lagi.</p>
        <Link
          href={`/checkout/${kelasId}`}
          className="inline-flex items-center justify-center rounded-[18px] bg-[#081EEA] px-5 py-2 text-sm font-medium text-white transition hover:opacity-90 sm:text-base"
        >
          Coba Bayar Lagi
        </Link>
      </div>
    );
  }

  const isInstant = metode !== null && INSTANT_METHODS.has(metode);

  return (
    <div className="flex flex-col items-center gap-4 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-10 text-center">
      <MaskotLoading size="lg" variant="Listen" />
      <p className="text-lg font-medium text-black">Pembayaran kamu sedang diproses...</p>
      <p className="text-sm text-[#7E7C7C]">
        {isInstant
          ? `Mohon tunggu sebentar — status akan otomatis berubah begitu pembayaran untuk ${namaKelas} kami terima.`
          : `Selesaikan transfer sesuai nomor VA yang muncul tadi. Status akan otomatis update begitu pembayaran untuk ${namaKelas} kami terima — halaman ini tidak perlu di-refresh.`}
      </p>
      {timedOut ? (
        <p className="text-sm text-[#7E7C7C]">
          Butuh waktu lebih lama dari biasanya? Kalau kamu sudah membayar, hubungi CS kami untuk bantuan lebih lanjut.
        </p>
      ) : null}
    </div>
  );
}
