"use client";

import { useRef, useState } from "react";
import Button from "@/components/ui/Button";
import InputField from "@/components/ui/InputField";
import {
  ALASAN_MIN,
  MAX_SUBTES_MANUAL,
  METODE_PEMBAYARAN_LABEL,
  METODE_PEMBAYARAN_MANUAL,
  panjangKarakter,
} from "@/lib/shared/enrollmentManual";

/**
 * Form "Daftarkan Siswa Manual" — PRD 7.5.10 (Admin, halaman Pendaftar).
 * Untuk siswa yang sudah bayar di luar website. Server memvalidasi ulang
 * semuanya (duplikat, kapasitas, mentor offline, subtes); requestId dibuat
 * sekali per pembukaan form supaya klik dobel tidak mendaftarkan dua kali.
 */

interface SiswaOption {
  id: string;
  nama: string;
  email: string;
}

interface MentorOption {
  mentorId: string;
  nama: string;
  asalPtn: string;
  jarakKm: number | null;
}

const TEXTAREA_CLASS =
  "w-full rounded-[16px] border border-[#AFAFAF] bg-white px-4 py-2.5 text-sm text-black outline-none transition-colors placeholder:text-[#AFAFAF] focus:border-black";

export default function DaftarSiswaManualModal({
  kelasId,
  kelasNama,
  modePembelajaran,
  subtesPool,
  onClose,
  onSuccess,
}: {
  kelasId: string;
  kelasNama: string;
  modePembelajaran: "online" | "offline";
  subtesPool: { id: string; nama: string }[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [requestId] = useState(() => crypto.randomUUID());
  const isPaket = modePembelajaran === "online" && subtesPool.length > 1;
  const isOffline = modePembelajaran === "offline";

  const [query, setQuery] = useState("");
  const [hasilCari, setHasilCari] = useState<SiswaOption[]>([]);
  const [mencari, setMencari] = useState(false);
  const [siswa, setSiswa] = useState<SiswaOption | null>(null);

  const [subtesIds, setSubtesIds] = useState<string[]>([]);

  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [mentorList, setMentorList] = useState<MentorOption[] | null>(null);
  const [mentorId, setMentorId] = useState("");
  const [memuatMentor, setMemuatMentor] = useState(false);

  const [metode, setMetode] = useState("");
  const [nominal, setNominal] = useState("");
  const [alasan, setAlasan] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selesai, setSelesai] = useState(false);

  // Cari siswa (debounce 300 ms) — dipicu dari ketikan, bukan effect.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function handleQueryChange(value: string) {
    setQuery(value);
    if (timerRef.current) clearTimeout(timerRef.current);
    const q = value.trim();
    if (q.length < 2) {
      setHasilCari([]);
      return;
    }
    timerRef.current = setTimeout(async () => {
      setMencari(true);
      try {
        const res = await fetch(`/api/admin/enrollment-manual/siswa?q=${encodeURIComponent(q)}`);
        const json = await res.json();
        setHasilCari(res.ok && json.success ? (json.siswa as SiswaOption[]) : []);
      } catch {
        setHasilCari([]);
      } finally {
        setMencari(false);
      }
    }, 300);
  }

  async function muatMentor() {
    setMemuatMentor(true);
    setError(null);
    try {
      const params = new URLSearchParams({ kelasId });
      if (siswa) params.set("siswaId", siswa.id);
      if (lat.trim() && lng.trim()) {
        params.set("lat", lat.trim());
        params.set("lng", lng.trim());
      }
      const res = await fetch(`/api/admin/enrollment-manual/mentor-offline?${params.toString()}`);
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error ?? "Gagal memuat mentor.");
        setMentorList([]);
      } else {
        setMentorList(json.mentor as MentorOption[]);
      }
    } catch {
      setError("Gagal terhubung ke server.");
    } finally {
      setMemuatMentor(false);
    }
  }

  function toggleSubtes(id: string) {
    setSubtesIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : prev.length >= MAX_SUBTES_MANUAL ? prev : [...prev, id],
    );
  }

  const alasanCukup = panjangKarakter(alasan.trim()) >= ALASAN_MIN;
  const bisaKirim =
    !busy &&
    Boolean(siswa) &&
    Boolean(metode) &&
    alasanCukup &&
    (!isPaket || subtesIds.length > 0) &&
    (!isOffline || Boolean(mentorId));

  async function handleSubmit() {
    if (!siswa || !bisaKirim) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/enrollment-manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siswaId: siswa.id,
          kelasId,
          subtesIds: isPaket ? subtesIds : undefined,
          mentorOfflineId: isOffline ? mentorId : undefined,
          lokasiSiswaLat: isOffline && lat.trim() ? lat.trim() : undefined,
          lokasiSiswaLng: isOffline && lng.trim() ? lng.trim() : undefined,
          metodePembayaran: metode,
          nominalDibayar: nominal.trim() || undefined,
          alasan,
          requestId,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error ?? "Gagal mendaftarkan siswa.");
        setBusy(false);
        return;
      }
      setSelesai(true);
      setBusy(false);
      onSuccess();
    } catch {
      setError("Gagal terhubung ke server. Coba lagi — form yang sama aman dikirim ulang.");
      setBusy(false);
    }
  }

  if (selesai && siswa) {
    return (
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-black">Siswa terdaftar</h2>
        <p className="text-sm text-[#7E7C7C]">
          {siswa.nama} sudah terdaftar di {kelasNama} (lunas, sumber Manual) dan sudah menerima notifikasi.
        </p>
        <Button type="button" variant="primary" size="md" onClick={onClose}>
          Tutup
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-black">Daftarkan siswa manual</h2>
        <p className="text-sm text-[#7E7C7C]">
          Untuk siswa yang sudah bayar di luar website. Tidak membuat transaksi, tidak memakai promo, dan tidak
          memberi poin/referral. Kapasitas kelas tetap berlaku.
        </p>
      </div>

      {/* Siswa */}
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-black">Siswa</p>
        {siswa ? (
          <div className="flex items-center justify-between gap-2 rounded-[16px] bg-[#F9FAFF] px-4 py-2.5 text-sm">
            <span className="text-black">
              {siswa.nama} <span className="text-[#7E7C7C]">· {siswa.email}</span>
            </span>
            <button
              type="button"
              className="text-[#081EEA] hover:underline"
              onClick={() => {
                setSiswa(null);
                // Daftar mentor mengecualikan siswa terpilih — muat ulang setelah ganti siswa.
                setMentorList(null);
                setMentorId("");
              }}
            >
              Ganti
            </button>
          </div>
        ) : (
          <>
            <InputField
              type="text"
              size="md"
              placeholder="Cari nama atau email siswa"
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
            />
            {mencari ? <p className="text-xs text-[#7E7C7C]">Mencari...</p> : null}
            {hasilCari.length > 0 ? (
              <div className="flex max-h-40 flex-col overflow-y-auto rounded-[16px] border border-[#E3E3E3]">
                {hasilCari.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className="px-4 py-2 text-left text-sm hover:bg-[#F9FAFF]"
                    onClick={() => {
                      setSiswa(s);
                      setMentorList(null);
                      setMentorId("");
                    }}
                  >
                    {s.nama} <span className="text-[#7E7C7C]">· {s.email}</span>
                  </button>
                ))}
              </div>
            ) : query.trim().length >= 2 && !mencari ? (
              <p className="text-xs text-[#7E7C7C]">Tidak ada siswa aktif yang cocok.</p>
            ) : null}
          </>
        )}
      </div>

      {/* Subtes paket */}
      {isPaket ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-black">Subtes (maks. {MAX_SUBTES_MANUAL})</p>
          {subtesPool.map((s) => (
            <label key={s.id} className="flex items-center gap-2 text-sm text-black">
              <input
                type="checkbox"
                checked={subtesIds.includes(s.id)}
                disabled={!subtesIds.includes(s.id) && subtesIds.length >= MAX_SUBTES_MANUAL}
                onChange={() => toggleSubtes(s.id)}
              />
              {s.nama}
            </label>
          ))}
        </div>
      ) : null}

      {/* Offline */}
      {isOffline ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-black">Mentor tatap muka</p>
          <p className="text-xs text-[#7E7C7C]">
            Lokasi siswa opsional (koordinat, mis. dari Google Maps) — cuma untuk mengurutkan mentor terdekat.
          </p>
          <div className="flex gap-2">
            <InputField type="text" size="md" placeholder="Latitude" value={lat} onChange={(e) => setLat(e.target.value)} />
            <InputField type="text" size="md" placeholder="Longitude" value={lng} onChange={(e) => setLng(e.target.value)} />
          </div>
          <Button type="button" variant="secondary" size="sm" disabled={memuatMentor} onClick={muatMentor}>
            {memuatMentor ? "Memuat..." : mentorList ? "Muat ulang daftar mentor" : "Tampilkan mentor yang tersedia"}
          </Button>
          {mentorList && mentorList.length === 0 ? (
            <p className="text-xs text-[#E70A0A]">
              Belum ada mentor aktif yang bersedia tatap muka dan mengampu mapel kelas ini.
            </p>
          ) : null}
          {mentorList && mentorList.length > 0 ? (
            <InputField
              type="dropdown"
              size="md"
              placeholder="Pilih mentor"
              value={mentorId}
              onChange={(e) => setMentorId(e.target.value)}
              options={mentorList.map((m) => ({
                value: m.mentorId,
                label: `${m.nama} — ${m.asalPtn}${m.jarakKm !== null ? ` (${m.jarakKm.toFixed(1)} km)` : ""}`,
              }))}
            />
          ) : null}
        </div>
      ) : null}

      {/* Pembayaran */}
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-black">Metode pembayaran</p>
        <InputField
          type="dropdown"
          size="md"
          placeholder="Pilih metode"
          value={metode}
          onChange={(e) => setMetode(e.target.value)}
          options={METODE_PEMBAYARAN_MANUAL.map((m) => ({ value: m, label: METODE_PEMBAYARAN_LABEL[m] }))}
        />
        <InputField
          type="text"
          size="md"
          inputMode="numeric"
          placeholder="Nominal dibayar (Rp, opsional)"
          value={nominal}
          onChange={(e) => setNominal(e.target.value.replace(/[^0-9]/g, ""))}
        />
      </div>

      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-black">Alasan / catatan</p>
        <textarea
          value={alasan}
          onChange={(e) => setAlasan(e.target.value)}
          rows={3}
          placeholder="Mis. sudah transfer ke rekening BCA 12 Okt, bukti di grup admin"
          className={TEXTAREA_CLASS}
        />
        <p className={`text-xs ${alasanCukup || !alasan ? "text-[#7E7C7C]" : "text-[#E70A0A]"}`}>
          Wajib, min. {ALASAN_MIN} karakter. Tercatat di log audit.
        </p>
      </div>

      {error ? <p className="text-sm text-[#E70A0A]">{error}</p> : null}

      <div className="flex gap-3 pt-2">
        <Button type="button" variant="secondary" size="md" className="flex-1" onClick={onClose}>
          Batal
        </Button>
        <Button type="button" variant="primary" size="md" className="flex-1" disabled={!bisaKirim} onClick={handleSubmit}>
          {busy ? "Mendaftarkan..." : "Daftarkan"}
        </Button>
      </div>
    </div>
  );
}
