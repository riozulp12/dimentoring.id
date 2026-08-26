"use client";

import Script from "next/script";
import { useRouter } from "next/navigation";
import { useState } from "react";
import InputField from "@/components/ui/InputField";
import Button from "@/components/ui/Button";

/**
 * Form Checkout — PRD Bagian 7.5/Bagian 13 (payments, kode_promo). Validasi
 * Kode Promo dan pembuatan transaksi SELALU lewat API server (bukan dihitung
 * di client) — komponen ini cuma menampilkan hasilnya.
 */

declare global {
  interface Window {
    snap?: {
      pay: (
        snapToken: string,
        callbacks: {
          onSuccess?: (result: unknown) => void;
          onPending?: (result: unknown) => void;
          onError?: (result: unknown) => void;
          onClose?: () => void;
        },
      ) => void;
    };
  }
}

function formatRupiah(value: number): string {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}

interface AppliedPromo {
  kode: string;
  diskon: number;
  total: number;
}

export default function CheckoutForm({
  kelasId,
  harga,
  snapClientKey,
  isProduction,
}: {
  kelasId: string;
  harga: number;
  snapClientKey: string;
  isProduction: boolean;
}) {
  const router = useRouter();
  const [kodePromoInput, setKodePromoInput] = useState("");
  const [appliedPromo, setAppliedPromo] = useState<AppliedPromo | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);

  const [payError, setPayError] = useState<string | null>(null);
  const [isPaying, setIsPaying] = useState(false);

  const total = appliedPromo ? appliedPromo.total : harga;

  async function handleTerapkan() {
    setApplyError(null);
    const kode = kodePromoInput.trim();
    if (!kode) {
      setApplyError("Masukkan kode promo dulu.");
      return;
    }

    setIsApplying(true);
    try {
      const response = await fetch("/api/payment/validate-promo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kelasId, kode }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        setApplyError(json.error ?? "Gagal memvalidasi kode promo.");
        setAppliedPromo(null);
        return;
      }
      setAppliedPromo({ kode: json.kode, diskon: json.diskon, total: json.total });
    } catch {
      setApplyError("Gagal memvalidasi kode promo. Coba lagi nanti.");
      setAppliedPromo(null);
    } finally {
      setIsApplying(false);
    }
  }

  function handleHapusPromo() {
    setAppliedPromo(null);
    setApplyError(null);
  }

  async function handleBayar() {
    setPayError(null);
    setIsPaying(true);

    try {
      const response = await fetch("/api/payment/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kelasId, kodePromo: appliedPromo?.kode }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        setPayError(json.error ?? "Gagal membuat transaksi pembayaran.");
        setIsPaying(false);
        return;
      }

      if (!window.snap) {
        setPayError("Modul pembayaran belum siap dimuat. Coba lagi sesaat lagi.");
        setIsPaying(false);
        return;
      }

      const orderId = json.orderId as string;

      // onSuccess Snap.js untuk metode async (VA/e-wallet) CUMA berarti transaksi
      // sudah dibuat, BUKAN uang sudah masuk — jadi onSuccess & onPending SAMA-SAMA
      // diarahkan ke halaman "Menunggu Konfirmasi", bukan langsung dianggap sukses.
      // Status final ditentukan di sana lewat polling ke payments.status (webhook).
      function redirectToStatus(result: unknown) {
        const metode = (result as { payment_type?: string } | null)?.payment_type;
        const query = metode ? `?metode=${encodeURIComponent(metode)}` : "";
        router.push(`/payment-status/${orderId}${query}`);
      }

      window.snap.pay(json.snapToken as string, {
        onSuccess: redirectToStatus,
        onPending: redirectToStatus,
        onError: () => {
          setPayError("Pembayaran gagal diproses. Coba lagi.");
          setIsPaying(false);
        },
        // User menutup popup sebelum selesai — TETAP di halaman checkout, jangan
        // diarahkan ke mana pun, supaya bisa coba bayar lagi tanpa ulang dari awal.
        onClose: () => setIsPaying(false),
      });
    } catch {
      setPayError("Gagal membuat transaksi pembayaran. Coba lagi nanti.");
      setIsPaying(false);
    }
  }

  return (
    <>
      <Script
        src={isProduction ? "https://app.midtrans.com/snap/snap.js" : "https://app.sandbox.midtrans.com/snap/snap.js"}
        data-client-key={snapClientKey}
        strategy="afterInteractive"
      />

      <div className="flex flex-col gap-6 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-4 sm:px-8 sm:py-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-medium tracking-[-0.02em] text-black sm:text-xl">Kode Promo</h2>
          <p className="text-sm text-[#7E7C7C]">Opsional — masukkan kalau kamu punya kode diskon.</p>
        </div>

        {appliedPromo ? (
          <div className="flex items-center justify-between rounded-[16px] bg-[#F0FDF4] px-4 py-3">
            <span className="text-sm font-medium text-[#0CBA00]">{appliedPromo.kode} diterapkan</span>
            <button
              type="button"
              onClick={handleHapusPromo}
              className="text-sm font-medium text-[#7E7C7C] underline hover:text-black"
            >
              Hapus
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
            <div className="flex-1">
              <InputField
                type="text"
                size="lg"
                placeholder="Masukkan kode promo"
                value={kodePromoInput}
                onChange={(event) => setKodePromoInput(event.target.value.toUpperCase())}
                status={applyError ? "error" : "default"}
              />
            </div>
            <Button
              variant="secondary"
              size="lg"
              onClick={handleTerapkan}
              disabled={isApplying}
              className="shrink-0"
            >
              {isApplying ? "Memeriksa..." : "Terapkan"}
            </Button>
          </div>
        )}
        {applyError ? <p className="text-sm text-[#E70A0A]">{applyError}</p> : null}
      </div>

      <div className="flex flex-col gap-4 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-4 sm:px-8 sm:py-6">
        <h2 className="text-lg font-medium tracking-[-0.02em] text-black sm:text-xl">Ringkasan Harga</h2>
        <div className="flex flex-col gap-2 text-sm sm:text-base">
          <div className="flex items-center justify-between">
            <span className="text-[#7E7C7C]">Subtotal</span>
            <span className="text-black">{formatRupiah(harga)}</span>
          </div>
          {appliedPromo ? (
            <div className="flex items-center justify-between">
              <span className="text-[#7E7C7C]">Diskon</span>
              <span className="text-[#0CBA00]">-{formatRupiah(appliedPromo.diskon)}</span>
            </div>
          ) : null}
          <div className="flex items-center justify-between border-t border-[#E3E3E3] pt-2 text-base font-semibold sm:text-lg">
            <span className="text-black">Total Bayar</span>
            <span className="text-black">{formatRupiah(total)}</span>
          </div>
        </div>

        {payError ? <p className="text-sm text-[#E70A0A]">{payError}</p> : null}

        <Button variant="primary" size="xl" onClick={handleBayar} disabled={isPaying} className="w-full">
          {isPaying ? "Memproses..." : "Bayar Sekarang"}
        </Button>
      </div>
    </>
  );
}
