"use client";

import { useEffect, useState } from "react";
import InputField from "@/components/ui/InputField";
import Button from "@/components/ui/Button";
import MaskotLoading from "@/components/ui/MaskotLoading";
import { MAX_JADWAL_PILIHAN, formatSlot, slotKey } from "@/lib/shared/jadwalPilihan";
import type { OpsiJadwalCheckout } from "@/lib/shared/slotTerisi";
import Link from "next/link";
import { batasSesi, bagiRataSesi, pilihanSesiSiap, rincianCheckoutUi } from "@/lib/shared/checkoutSesiUi";
import { HREF_KEBIJAKAN_PRIVASI, HREF_KEBIJAKAN_REFUND, RINGKASAN_REFUND_CHECKOUT } from "@/lib/shared/kebijakan";

/**
 * Form Checkout — PRD Bagian 7.5/Bagian 13 (payments, kode_promo). Validasi
 * Kode Promo dan pembuatan transaksi SELALU lewat API server (bukan dihitung
 * di client) — komponen ini cuma menampilkan hasilnya. Setelah transaksi
 * dibuat, siswa diarahkan ke halaman pembayaran gateway (Mayar, bukan popup);
 * gateway mengembalikan siswa ke /payment-status/[orderId].
 */

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
  /** false = belum ada mentor aktif untuk subtes ini (lib/kelas/subtesTersedia.ts):
   * tampil "Belum tersedia" dan tidak bisa dipilih. Kosong/true = bisa dipilih. */
  tersedia?: boolean;
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
  hargaAsli,
  subtesOptions,
  modePembelajaran,
  jadwalOptions,
  semuaJadwalPenuh = false,
  kelasPenuh = false,
  sesiPilihan = null,
}: {
  kelasId: string;
  /** Harga yang DITAGIH (sudah setelah diskon kelas, dihitung server). */
  harga: number;
  /** Harga asli sebelum diskon kelas — hanya untuk coretan di ringkasan. */
  hargaAsli?: number;
  /** Pool Subtes kelas ini (kelas_subtes) — checklist cuma tampil kalau > 1
   * (kelas paket). Kalau <= 1, dikirim otomatis tanpa perlu siswa memilih. */
  subtesOptions: CheckoutSubtesOption[];
  /** Kelas tatap muka (offline) minta izin lokasi & tampilkan mentor terdekat
   * untuk dipilih siswa — beda alurnya dari kelas online biasa. */
  modePembelajaran: "online" | "offline";
  /** Slot kelas.jadwal yang dipilih siswa (PRD 7.5.8) — HANYA diisi server
   * kalau saklar kelas menyala, bukan offline, dan slot >= 2. Kosong = tanpa
   * pilihan jadwal (perilaku lama). */
  /** Slot kelas + penanda penuh (penuh = tampil "(Penuh)" dan tidak bisa dipilih). */
  jadwalOptions: OpsiJadwalCheckout[];
  /** Semua jadwal kelas penuh → pesan "Semua jadwal kelas ini sudah terisi" dan tombol Bayar nonaktif. */
  semuaJadwalPenuh?: boolean;
  /** Kelas penuh menurut kapasitas (otomatis/manual) → pesan + tombol Bayar nonaktif. */
  kelasPenuh?: boolean;
  /** Diisi SERVER hanya bila saklar SESI_PILIHAN_AKTIF hidup dan kelas private online. null = tampilan lama persis. */
  sesiPilihan?: { hargaNormal: number; jumlahSesiKelas: number } | null;
}) {
  const isOffline = modePembelajaran === "offline";
  const isPaket = !isOffline && subtesOptions.length > 1;
  const tidakTersediaIds = new Set(subtesOptions.filter((s) => s.tersedia === false).map((s) => s.id));
  const adaSubtesTersedia = subtesOptions.some((s) => s.tersedia !== false);
  const [kodePromoInput, setKodePromoInput] = useState("");
  const [appliedPromo, setAppliedPromo] = useState<AppliedPromo | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [selectedSubtesIds, setSelectedSubtesIds] = useState<string[]>([]);
  const [subtesError, setSubtesError] = useState<string | null>(null);
  const isPilihJadwal = jadwalOptions.length >= 2;
  // Urutan = prioritas: index 0 = Pilihan 1 (wajib), index 1 = Pilihan 2 (opsional).
  const [jadwalPilihanKeys, setJadwalPilihanKeys] = useState<[string, string]>(["", ""]);
  const [jadwalError, setJadwalError] = useState<string | null>(null);

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

  // ---- Sesi pilihan (kelas private online, saklar hidup) ----
  const [sesiTotal, setSesiTotal] = useState<number>(sesiPilihan?.jumlahSesiKelas ?? 0);
  // null = pembagian otomatis (rata); diisi bila siswa mengubah sesi sebuah subtes.
  const [sebaranManual, setSebaranManual] = useState<Record<string, number> | null>(null);
  const subtesUntukSesi = isPaket ? selectedSubtesIds : subtesOptions.map((s) => s.id);
  const jumlahSubtesSesi = Math.max(1, subtesUntukSesi.length);
  const rincianSesi = sesiPilihan
    ? rincianCheckoutUi({
        hargaNormal: sesiPilihan.hargaNormal,
        hargaAktif: harga,
        jumlahSesiKelas: sesiPilihan.jumlahSesiKelas,
        sesiTotal,
        jumlahSubtes: jumlahSubtesSesi,
      })
    : null;
  const batas = sesiPilihan ? batasSesi(sesiPilihan.jumlahSesiKelas, jumlahSubtesSesi) : null;
  const sebaranSesi = sebaranManual ?? bagiRataSesi(subtesUntukSesi, sesiTotal);
  const siapSesi = sesiPilihan && rincianSesi ? pilihanSesiSiap({ rincian: rincianSesi, subtesIds: subtesUntukSesi, sebaran: sebaranSesi }) : null;
  const promoDiblokSesi = Boolean(rincianSesi && rincianSesi.valid && !rincianSesi.promoBerlaku);

  function ubahSesiTotal(nilai: number) {
    if (!sesiPilihan) return;
    const { maks } = batasSesi(sesiPilihan.jumlahSesiKelas, jumlahSubtesSesi);
    const baru = Math.min(maks, Math.max(1, nilai));
    setSesiTotal(baru);
    setSebaranManual(null);
    setAppliedPromo(null); // promo yang sudah diterapkan dihitung untuk jumlah sesi sebelumnya
    setApplyError(null);
  }

  function ubahSesiSubtes(subtesId: string, nilai: number) {
    setSebaranManual({ ...sebaranSesi, [subtesId]: Math.max(1, nilai) });
  }

  const [payError, setPayError] = useState<string | null>(null);
  const [isPaying, setIsPaying] = useState(false);
  // Persetujuan Kebijakan Refund & Privasi — wajib dicentang sebelum bayar.
  // Cuma pengaman tampilan (belum dicatat di server).
  const [setujuKebijakan, setSetujuKebijakan] = useState(false);
  const [kebijakanError, setKebijakanError] = useState<string | null>(null);

  const total =
    rincianSesi && rincianSesi.valid
      ? rincianSesi.totalSebelumPromo - (appliedPromo?.diskon ?? 0)
      : appliedPromo
        ? appliedPromo.total
        : harga;

  function toggleSubtes(subtesId: string) {
    setSubtesError(null);
    if (tidakTersediaIds.has(subtesId)) return;
    setSebaranManual(null);
    const prev = selectedSubtesIds;
    const next = prev.includes(subtesId)
      ? prev.filter((id) => id !== subtesId)
      : prev.length >= MAX_SUBTES_PILIHAN
        ? prev
        : [...prev, subtesId];
    setSelectedSubtesIds(next);
    // Total sesi tidak boleh kurang dari jumlah subtes: naikkan otomatis (promo lama tidak berlaku lagi).
    if (sesiPilihan && next.length > sesiTotal) {
      setSesiTotal(next.length);
      setAppliedPromo(null);
    }
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
        body: JSON.stringify({
          kelasId,
          kode,
          ...(sesiPilihan ? { jumlahSesi: sesiTotal, jumlahSubtes: jumlahSubtesSesi } : {}),
        }),
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

  function setJadwalPilihan(index: 0 | 1, key: string) {
    setJadwalError(null);
    setJadwalPilihanKeys((prev) => {
      const next: [string, string] = [prev[0], prev[1]];
      next[index] = key;
      // Pilihan 2 tidak boleh sama dengan Pilihan 1.
      if (index === 0 && next[1] === key) next[1] = "";
      return next;
    });
  }

  async function handleBayar() {
    setPayError(null);
    setSubtesError(null);
    setJadwalError(null);

    if (!setujuKebijakan) {
      setKebijakanError("Centang persetujuan Kebijakan Refund dan Kebijakan Privasi dulu ya.");
      return;
    }
    setKebijakanError(null);

    const jadwalPilihan = jadwalPilihanKeys
      .filter(Boolean)
      .map((key) => jadwalOptions.find((slot) => slotKey(slot) === key))
      .filter((slot): slot is OpsiJadwalCheckout => Boolean(slot) && !slot!.penuh)
      .map(({ hari, jam_mulai }) => ({ hari, jam_mulai }));
    if (isPilihJadwal && jadwalPilihan.length < 1) {
      setJadwalError("Pilih minimal 1 jadwal dulu.");
      return;
    }

    if (isPaket && (selectedSubtesIds.length < 1 || selectedSubtesIds.length > MAX_SUBTES_PILIHAN)) {
      setSubtesError(`Pilih minimal 1, maksimal ${MAX_SUBTES_PILIHAN} subtes dulu.`);
      return;
    }
    if (isPaket && selectedSubtesIds.some((id) => tidakTersediaIds.has(id))) {
      setSubtesError("Ada subtes yang belum tersedia. Muat ulang halaman, lalu pilih lagi ya.");
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
          jadwalPilihan: isPilihJadwal ? jadwalPilihan : undefined,
          ...(sesiPilihan && siapSesi ? { jumlahSesiTotal: sesiTotal, sesiPerSubtes: siapSesi.perSubtes.length > 0 ? siapSesi.perSubtes : undefined } : {}),
        }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        setPayError(json.error ?? "Gagal membuat transaksi pembayaran.");
        setIsPaying(false);
        return;
      }

      const paymentUrl = json.paymentUrl as string | undefined;
      if (!paymentUrl || !paymentUrl.startsWith("https://")) {
        setPayError("Gagal membuka halaman pembayaran. Coba lagi nanti.");
        setIsPaying(false);
        return;
      }

      // Lunas/tidaknya TIDAK ditentukan di sini — halaman "Menunggu Konfirmasi"
      // yang memantau payments.status (cuma diubah webhook, BR-19).
      window.location.assign(paymentUrl);
    } catch {
      setPayError("Gagal membuat transaksi pembayaran. Coba lagi nanti.");
      setIsPaying(false);
    }
  }

  return (
    <>
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
              const tidakTersedia = subtes.tersedia === false;
              const checked = !tidakTersedia && selectedSubtesIds.includes(subtes.id);
              const disabled = tidakTersedia || (!checked && selectedSubtesIds.length >= MAX_SUBTES_PILIHAN);
              return (
                <label
                  key={subtes.id}
                  className={`flex items-center gap-2 rounded-[8px] px-1.5 py-1 text-sm ${tidakTersedia ? "cursor-not-allowed text-[#7E7C7C]" : "text-black"} ${disabled ? "opacity-50" : "hover:bg-gray-50"}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={() => toggleSubtes(subtes.id)}
                    className="size-4 accent-[#081EEA]"
                  />
                  {subtes.nama}
                  {tidakTersedia ? (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-[#7E7C7C]">
                      Belum tersedia
                    </span>
                  ) : null}
                </label>
              );
            })}
          </div>
          {!adaSubtesTersedia ? (
            <p className="text-sm text-[#E70A0A]">
              Kelas ini belum bisa didaftar karena belum ada mentor untuk subtes yang ditawarkan. Coba lagi nanti, ya.
            </p>
          ) : null}
          {subtesError ? <p className="text-sm text-[#E70A0A]">{subtesError}</p> : null}
        </div>
      ) : null}

      {sesiPilihan && rincianSesi && batas ? (
        <div className="flex flex-col gap-4 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-4 sm:px-8 sm:py-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-medium tracking-[-0.02em] text-black sm:text-xl">Jumlah Sesi</h2>
            <p className="text-sm text-[#7E7C7C]">
              Paket kelas ini {sesiPilihan.jumlahSesiKelas} sesi. Kamu bisa pilih {batas.min} sampai {batas.maks} sesi.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Kurangi sesi"
              onClick={() => ubahSesiTotal(sesiTotal - 1)}
              disabled={sesiTotal <= batas.min}
              className="flex size-11 items-center justify-center rounded-[12px] border border-[#E3E3E3] text-xl font-medium text-black hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              &minus;
            </button>
            <span aria-live="polite" className="min-w-16 text-center text-lg font-semibold text-black">
              {sesiTotal} sesi
            </span>
            <button
              type="button"
              aria-label="Tambah sesi"
              onClick={() => ubahSesiTotal(sesiTotal + 1)}
              disabled={sesiTotal >= batas.maks}
              className="flex size-11 items-center justify-center rounded-[12px] border border-[#E3E3E3] text-xl font-medium text-black hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              +
            </button>
          </div>
          {subtesUntukSesi.length > 1 ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium text-black">Pembagian sesi per subtes</p>
              {subtesUntukSesi.map((id) => (
                <div key={id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-black">{subtesOptions.find((s) => s.id === id)?.nama ?? "-"}</span>
                  <span className="flex items-center gap-2">
                    <button
                      type="button"
                      aria-label="Kurangi sesi subtes"
                      onClick={() => ubahSesiSubtes(id, (sebaranSesi[id] ?? 1) - 1)}
                      disabled={(sebaranSesi[id] ?? 1) <= 1}
                      className="flex size-9 items-center justify-center rounded-[10px] border border-[#E3E3E3] text-black hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      &minus;
                    </button>
                    <span className="min-w-6 text-center font-medium text-black">{sebaranSesi[id] ?? 0}</span>
                    <button
                      type="button"
                      aria-label="Tambah sesi subtes"
                      onClick={() => ubahSesiSubtes(id, (sebaranSesi[id] ?? 0) + 1)}
                      className="flex size-9 items-center justify-center rounded-[10px] border border-[#E3E3E3] text-black hover:bg-gray-50"
                    >
                      +
                    </button>
                  </span>
                </div>
              ))}
              <p className="text-xs text-[#7E7C7C]">Tiap subtes minimal 1 sesi, dan jumlahnya harus pas {sesiTotal} sesi.</p>
            </div>
          ) : null}
          {siapSesi && !siapSesi.siap && siapSesi.pesan ? (
            <p role="alert" className="text-sm text-[#E70A0A]">
              {siapSesi.pesan}
            </p>
          ) : null}
          <p className="text-xs text-[#7E7C7C]">Penambahan jumlah sesi tidak termasuk diskon.</p>
        </div>
      ) : null}

      {isPilihJadwal ? (
        <div className="flex flex-col gap-4 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-4 sm:px-8 sm:py-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-medium tracking-[-0.02em] text-black sm:text-xl">Pilih Jadwal</h2>
            <p className="text-sm text-[#7E7C7C]">
              Pilih jadwal yang kamu inginkan (maks. {MAX_JADWAL_PILIHAN}, urut prioritas). Ini preferensi — jadwal
              akhir ditetapkan Admin dan dikabari lewat notifikasi.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-black">Pilihan 1 (wajib)</label>
              <InputField
                type="dropdown"
                size="md"
                placeholder="Pilih jadwal"
                value={jadwalPilihanKeys[0]}
                onChange={(e) => setJadwalPilihan(0, e.target.value)}
                options={jadwalOptions.map((slot) => ({
                  label: slot.penuh ? `${formatSlot(slot)} (Penuh)` : formatSlot(slot),
                  value: slotKey(slot),
                  disabled: slot.penuh,
                }))}
                status={jadwalError ? "error" : "default"}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-black">Pilihan 2 (opsional)</label>
              <InputField
                type="dropdown"
                size="md"
                placeholder="Tidak ada"
                value={jadwalPilihanKeys[1]}
                onChange={(e) => setJadwalPilihan(1, e.target.value)}
                options={jadwalOptions
                  .filter((slot) => slotKey(slot) !== jadwalPilihanKeys[0])
                  .map((slot) => ({
                    label: slot.penuh ? `${formatSlot(slot)} (Penuh)` : formatSlot(slot),
                    value: slotKey(slot),
                    disabled: slot.penuh,
                  }))}
              />
              {jadwalPilihanKeys[1] ? (
                <button
                  type="button"
                  onClick={() => setJadwalPilihan(1, "")}
                  className="w-fit text-xs font-medium text-[#7E7C7C] underline hover:text-black"
                >
                  Kosongkan Pilihan 2
                </button>
              ) : null}
            </div>
          </div>
          {jadwalError ? <p className="text-sm text-[#E70A0A]">{jadwalError}</p> : null}
        </div>
      ) : null}

      {kelasPenuh && !semuaJadwalPenuh ? (
        <p role="alert" className="rounded-[16px] bg-[#FFF4E5] px-4 py-3 text-sm font-medium text-[#B45309]">
          Kelas ini sudah penuh. Coba cek kelas lain ya.
        </p>
      ) : null}

      {semuaJadwalPenuh ? (
        <p role="alert" className="rounded-[16px] bg-[#FFF4E5] px-4 py-3 text-sm font-medium text-[#B45309]">
          Semua jadwal kelas ini sudah terisi. Coba cek kelas lain ya.
        </p>
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
              disabled={isApplying || promoDiblokSesi}
              className="shrink-0"
            >
              {isApplying ? "Memeriksa..." : "Terapkan"}
            </Button>
          </div>
        )}
        {promoDiblokSesi ? (
          <p className="text-sm text-[#7E7C7C]">Kode promo hanya bisa dipakai untuk paket penuh atau lebih.</p>
        ) : null}
        {applyError ? <p className="text-sm text-[#E70A0A]">{applyError}</p> : null}
      </div>

      <div className="flex flex-col gap-4 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-4 sm:px-8 sm:py-6">
        <h2 className="text-lg font-medium tracking-[-0.02em] text-black sm:text-xl">Ringkasan Harga</h2>
        <div className="flex flex-col gap-2 text-sm sm:text-base">
          {hargaAsli !== undefined && hargaAsli > harga && !(rincianSesi?.valid && !rincianSesi.paketPenuhAtauLebih) ? (
            <div className="flex items-center justify-between">
              <span className="text-[#7E7C7C]">Harga asli</span>
              <span className="text-[#7E7C7C] line-through decoration-[#DC2626]">{formatRupiah(hargaAsli)}</span>
            </div>
          ) : null}
          {rincianSesi && rincianSesi.valid ? (
            <>
              <div className="flex items-center justify-between">
                <span className="text-[#7E7C7C]">
                  Paket {rincianSesi.paketPenuhAtauLebih ? (sesiPilihan?.jumlahSesiKelas ?? sesiTotal) : sesiTotal} sesi
                </span>
                <span className="text-black">{formatRupiah(rincianSesi.hargaDasar)}</span>
              </div>
              {rincianSesi.sesiTambahan > 0 ? (
                <div className="flex items-center justify-between">
                  <span className="text-[#7E7C7C]">Sesi tambahan ({rincianSesi.sesiTambahan} sesi)</span>
                  <span className="text-black">{formatRupiah(rincianSesi.biayaSesiTambahan)}</span>
                </div>
              ) : null}
            </>
          ) : (
            <div className="flex items-center justify-between">
              <span className="text-[#7E7C7C]">Subtotal</span>
              <span className="text-black">{formatRupiah(harga)}</span>
            </div>
          )}
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

        <div className="flex flex-col gap-1 rounded-[16px] bg-[#F5F6FF] px-4 py-3 text-sm leading-[1.6] text-black">
          <p className="font-semibold">Kebijakan Refund singkat</p>
          <ul className="flex list-disc flex-col gap-0.5 pl-5">
            {RINGKASAN_REFUND_CHECKOUT.map((baris) => (
              <li key={baris}>{baris}</li>
            ))}
            <li>
              Selengkapnya di{" "}
              <Link
                href={HREF_KEBIJAKAN_REFUND}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-[#081EEA] underline underline-offset-2"
              >
                Kebijakan Refund
              </Link>
              .
            </li>
          </ul>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="flex items-start gap-3 text-sm leading-[1.6] text-black">
            <input
              type="checkbox"
              checked={setujuKebijakan}
              onChange={(event) => {
                setSetujuKebijakan(event.target.checked);
                if (event.target.checked) setKebijakanError(null);
              }}
              className="mt-1 h-4 w-4 shrink-0 accent-[#081EEA]"
            />
            <span>
              Saya sudah membaca dan setuju dengan{" "}
              <Link
                href={HREF_KEBIJAKAN_REFUND}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-[#081EEA] underline underline-offset-2"
              >
                Kebijakan Refund
              </Link>{" "}
              dan{" "}
              <Link
                href={HREF_KEBIJAKAN_PRIVASI}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-[#081EEA] underline underline-offset-2"
              >
                Kebijakan Privasi
              </Link>{" "}
              dimentoring.id.
            </span>
          </label>
          {!setujuKebijakan && !kebijakanError ? (
            <p className="text-xs text-[#7E7C7C]">Centang kotak di atas dulu supaya tombol bayar aktif.</p>
          ) : null}
          {kebijakanError ? (
            <p role="alert" className="text-sm text-[#E70A0A]">
              {kebijakanError}
            </p>
          ) : null}
        </div>

        {payError ? <p className="text-sm text-[#E70A0A]">{payError}</p> : null}

        <Button
          variant="primary"
          size="xl"
          onClick={handleBayar}
          disabled={
            isPaying ||
            !setujuKebijakan ||
            semuaJadwalPenuh ||
            kelasPenuh ||
            (isPaket && !adaSubtesTersedia) ||
            (sesiPilihan !== null && !(siapSesi?.siap ?? false)) ||
            (isOffline && (!offlineMentors || offlineMentors.length === 0 || !selectedMentorId))
          }
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
