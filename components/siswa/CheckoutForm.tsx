"use client";

import Script from "next/script";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import InputField from "@/components/ui/InputField";
import Button from "@/components/ui/Button";
import MaskotLoading from "@/components/ui/MaskotLoading";

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

export interface CheckoutSubtesOption {
  id: string;
  nama: string;
}

interface OfflineMentorOption {
  mentorId: string;
  nama: string;
  asalPtn: string;
  jarakKm: number;
}

const MAX_SUBTES_PILIHAN = 3;

function formatJarak(km: number): string {
  return `${km.toLocaleString("id-ID", { maximumFractionDigits: 1, minimumFractionDigits: 1 })} km`;
}

export default function CheckoutForm({
  kelasId,
  harga,
  snapClientKey,
  isProduction,
  subtesOptions,
  modePembelajaran,
}: {
  kelasId: string;
  harga: number;
  snapClientKey: string;
  isProduction: boolean;
  /** Pool Subtes kelas ini (kelas_subtes) — checklist cuma tampil kalau > 1
   * (kelas paket). Kalau <= 1, dikirim otomatis tanpa perlu siswa memilih. */
  subtesOptions: CheckoutSubtesOption[];
  /** Kelas tatap muka (offline) minta izin lokasi & tampilkan mentor terdekat
   * untuk dipilih siswa — beda alurnya dari kelas online biasa. */
  modePembelajaran: "online" | "offline";
}) {
  const router = useRouter();
  const isOffline = modePembelajaran === "offline";
  const isPaket = !isOffline && subtesOptions.length > 1;
  const [kodePromoInput, setKodePromoInput] = useState("");
  const [appliedPromo, setAppliedPromo] = useState<AppliedPromo | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [selectedSubtesIds, setSelectedSubtesIds] = useState<string[]>([]);
  const [subtesError, setSubtesError] = useState<string | null>(null);

  // ---- Kelas Offline: lokasi siswa + pilihan Mentor terdekat ----
  const [geoStatus, setGeoStatus] = useState<"idle" | "requesting" | "granted" | "denied" | "error">(() => {
    if (!isOffline) return "idle";
    return typeof navigator !== "undefined" && "geolocation" in navigator ? "requesting" : "error";
  });
  const [studentLat, setStudentLat] = useState<number | null>(null);
  const [studentLng, setStudentLng] = useState<number | null>(null);
  const [offlineMentors, setOfflineMentors] = useState<OfflineMentorOption[] | null>(null);
  const [isLoadingMentors, setIsLoadingMentors] = useState(false);
  const [mentorsError, setMentorsError] = useState<string | null>(null);
  const [selectedMentorId, setSelectedMentorId] = useState<string | null>(null);

  async function fetchOfflineMentors(lat: number, lng: number) {
    setIsLoadingMentors(true);
    setMentorsError(null);
    try {
      const response = await fetch("/api/payment/offline-mentors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kelasId, lat, lng }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        setMentorsError(json.error ?? "Gagal memuat daftar mentor. Coba lagi nanti.");
        setOfflineMentors(null);
        return;
      }
      setOfflineMentors(json.mentors as OfflineMentorOption[]);
    } catch {
      setMentorsError("Gagal terhubung ke server. Periksa koneksi internet kamu.");
      setOfflineMentors(null);
    } finally {
      setIsLoadingMentors(false);
    }
  }

  function startGeolocation() {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        setStudentLat(lat);
        setStudentLng(lng);
        setGeoStatus("granted");
        fetchOfflineMentors(lat, lng);
      },
      () => setGeoStatus("denied"),
      { enableHighAccuracy: false, timeout: 15000 },
    );
  }

  // Tombol "Coba Lagi" (setelah izin ditolak/error) — beda dari mount effect
  // di bawah, di sini boleh setState synchronous karena dipicu klik user,
  // bukan dari body efek.
  function requestLokasi() {
    if (!("geolocation" in navigator)) {
      setGeoStatus("error");
      return;
    }
    setGeoStatus("requesting");
    startGeolocation();
  }

  useEffect(() => {
    // geoStatus awal sudah "requesting" (lihat lazy initializer di atas) kalau
    // kelas ini offline & browser dukung geolocation — effect ini cuma perlu
    // MEMULAI request-nya, tanpa setState synchronous di body efek sendiri.
    if (isOffline && typeof navigator !== "undefined" && "geolocation" in navigator) {
      startGeolocation();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOffline]);

  const [payError, setPayError] = useState<string | null>(null);
  const [isPaying, setIsPaying] = useState(false);

  const total = appliedPromo ? appliedPromo.total : harga;

  function toggleSubtes(subtesId: string) {
    setSubtesError(null);
    setSelectedSubtesIds((prev) => {
      if (prev.includes(subtesId)) return prev.filter((id) => id !== subtesId);
      if (prev.length >= MAX_SUBTES_PILIHAN) return prev;
      return [...prev, subtesId];
    });
  }

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
    setSubtesError(null);

    if (isPaket && (selectedSubtesIds.length < 1 || selectedSubtesIds.length > MAX_SUBTES_PILIHAN)) {
      setSubtesError(`Pilih minimal 1, maksimal ${MAX_SUBTES_PILIHAN} subtes dulu.`);
      return;
    }

    if (isOffline) {
      if (studentLat === null || studentLng === null) {
        setPayError("Izinkan akses lokasi dulu supaya kami bisa carikan mentor terdekat.");
        return;
      }
      if (!selectedMentorId) {
        setPayError("Pilih mentor tatap muka dulu sebelum bayar.");
        return;
      }
    }

    setIsPaying(true);

    try {
      const response = await fetch("/api/payment/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kelasId,
          kodePromo: appliedPromo?.kode,
          subtesIds: isPaket ? selectedSubtesIds : undefined,
          mentorOfflineId: isOffline ? selectedMentorId : undefined,
          lokasiSiswaLat: isOffline ? studentLat : undefined,
          lokasiSiswaLng: isOffline ? studentLng : undefined,
        }),
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

      {isOffline ? (
        <div className="flex flex-col gap-4 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-4 sm:px-8 sm:py-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-medium tracking-[-0.02em] text-black sm:text-xl">Pilih Mentor Tatap Muka</h2>
            <p className="text-sm text-[#7E7C7C]">
              Kelas ini tatap muka (offline) — mentor akan datang ke lokasimu. Pilih salah satu mentor terdekat.
            </p>
          </div>

          {geoStatus === "idle" || geoStatus === "requesting" ? (
            <p className="text-sm text-[#7E7C7C]">Meminta izin lokasi dari browser kamu...</p>
          ) : null}

          {geoStatus === "denied" || geoStatus === "error" ? (
            <div className="flex flex-col gap-2 rounded-[16px] bg-[#FFEBEB] px-4 py-3">
              <p className="text-sm text-[#E70A0A]">
                Kami butuh akses lokasi untuk mencarikan mentor tatap muka terdekat. Izinkan akses lokasi di
                browser kamu, lalu coba lagi.
              </p>
              <Button type="button" variant="secondary" size="sm" className="w-fit" onClick={requestLokasi}>
                Coba Lagi
              </Button>
            </div>
          ) : null}

          {geoStatus === "granted" && isLoadingMentors ? (
            <p className="text-sm text-[#7E7C7C]">Mencari mentor terdekat...</p>
          ) : null}

          {mentorsError ? <p className="text-sm text-[#E70A0A]">{mentorsError}</p> : null}

          {geoStatus === "granted" && !isLoadingMentors && offlineMentors ? (
            offlineMentors.length === 0 ? (
              <p className="rounded-[16px] bg-[#FFEBEB] px-4 py-3 text-sm text-[#E70A0A]">
                Belum ada mentor tatap muka tersedia untuk mapel ini di area kamu.
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {offlineMentors.map((mentor) => (
                  <label
                    key={mentor.mentorId}
                    className={`flex items-center justify-between gap-3 rounded-[12px] border px-3 py-2.5 text-sm ${
                      selectedMentorId === mentor.mentorId
                        ? "border-[#081EEA] bg-[#F5F6FF]"
                        : "border-[#E3E3E3] hover:bg-gray-50"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="mentorOffline"
                        checked={selectedMentorId === mentor.mentorId}
                        onChange={() => setSelectedMentorId(mentor.mentorId)}
                        className="size-4 accent-[#081EEA]"
                      />
                      <span className="flex flex-col">
                        <span className="font-medium text-black">{mentor.nama}</span>
                        <span className="text-xs text-[#7E7C7C]">{mentor.asalPtn}</span>
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-medium text-[#081EEA]">{formatJarak(mentor.jarakKm)}</span>
                  </label>
                ))}
              </div>
            )
          ) : null}
        </div>
      ) : null}

      {isPaket ? (
        <div className="flex flex-col gap-4 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-4 sm:px-8 sm:py-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-medium tracking-[-0.02em] text-black sm:text-xl">Pilih Subtes</h2>
            <p className="text-sm text-[#7E7C7C]">
              Kelas ini paket — pilih minimal 1, maksimal {MAX_SUBTES_PILIHAN} subtes yang mau kamu ikuti (
              {selectedSubtesIds.length}/{MAX_SUBTES_PILIHAN} dipilih).
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            {subtesOptions.map((subtes) => {
              const checked = selectedSubtesIds.includes(subtes.id);
              const disabled = !checked && selectedSubtesIds.length >= MAX_SUBTES_PILIHAN;
              return (
                <label
                  key={subtes.id}
                  className={`flex items-center gap-2 rounded-[8px] px-1.5 py-1 text-sm text-black ${disabled ? "opacity-50" : "hover:bg-gray-50"}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={() => toggleSubtes(subtes.id)}
                    className="size-4 accent-[#081EEA]"
                  />
                  {subtes.nama}
                </label>
              );
            })}
          </div>
          {subtesError ? <p className="text-sm text-[#E70A0A]">{subtesError}</p> : null}
        </div>
      ) : null}

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

        <Button
          variant="primary"
          size="xl"
          onClick={handleBayar}
          disabled={isPaying || (isOffline && (!offlineMentors || offlineMentors.length === 0 || !selectedMentorId))}
          className="w-full"
        >
          {isPaying ? (
            <span className="flex items-center justify-center gap-2">
              <MaskotLoading size="sm" />
              Memproses...
            </span>
          ) : (
            "Bayar Sekarang"
          )}
        </Button>
      </div>
    </>
  );
}
