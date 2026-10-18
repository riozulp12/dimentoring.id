"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import type { SesiRiwayat } from "@/lib/siswa/getKelasDetail";
import type { StatusSesiEfektif } from "@/lib/shared/statusSesi";

/**
 * Progress Kehadiran + prompt konfirmasi balik Siswa + riwayat sesi (PRD
 * 7.5.5 FR-A2/A4, BR-34) — TERPISAH dari "Progress Materi" (materi_progress,
 * sudah ada duluan di MateriList) karena beda metrik: ini kehadiran sesi
 * tatap muka/live, bukan penyelesaian materi belajar.
 *
 * Prompt cuma untuk sesi berstatus efektif "menunggu_siswa"
 * (lib/shared/statusSesi.ts) — sesi yang lewat 24 jam tanpa jawaban sudah
 * terkonfirmasi otomatis dan tidak ditanyakan lagi. Kelas multi-mentor bisa
 * punya lebih dari satu sesi menunggu (beda mentor, hari yang sama), jadi
 * prompt berikutnya muncul begitu yang pertama dijawab.
 */

function formatBatasWib(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** tanggal_dilaksanakan = DATE (sudah tanggal WIB) — diformat apa adanya. */
function formatTanggal(tanggal: string | null): string | null {
  if (!tanggal) return null;
  return new Date(`${tanggal}T00:00:00Z`).toLocaleDateString("id-ID", { timeZone: "UTC", day: "numeric", month: "short" });
}

const STATUS_LABEL: Record<StatusSesiEfektif, string> = {
  belum_terjadi: "Belum terjadi",
  menunggu_siswa: "Menunggu konfirmasimu",
  terkonfirmasi_siswa: "Dikonfirmasi",
  terkonfirmasi_otomatis: "Terkonfirmasi otomatis",
  disangkal_menunggu_review: "Disangkal, ditinjau Admin",
};

const STATUS_BADGE: Record<StatusSesiEfektif, string> = {
  belum_terjadi: "bg-[#F0F0F0] text-[#7E7C7C]",
  menunggu_siswa: "bg-[#FFFBEB] text-amber-700",
  terkonfirmasi_siswa: "bg-[#F0FDF4] text-[#0CBA00]",
  terkonfirmasi_otomatis: "bg-[#F0FDF4] text-[#0CBA00]",
  disangkal_menunggu_review: "bg-[#FFEBEB] text-[#E70A0A]",
};

export default function SesiKehadiranSection({
  riwayat: initialRiwayat,
  jumlahSesi,
  initialValidCount,
}: {
  riwayat: SesiRiwayat[];
  jumlahSesi: number;
  initialValidCount: number;
}) {
  const [riwayat, setRiwayat] = useState(initialRiwayat);
  const [validCount, setValidCount] = useState(initialValidCount);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pending = riwayat.find((r) => r.status === "menunggu_siswa") ?? null;

  async function submit(konfirmasi: boolean) {
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/siswa/sesi", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sesiId: pending.id, konfirmasi }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        setError(json.error ?? "Gagal menyimpan konfirmasi. Coba lagi nanti.");
        setBusy(false);
        return;
      }
      // Sesi yang menunggu jawaban SUDAH ikut terhitung (progresSesi.ts) —
      // "Ya" tidak mengubah angka, "Tidak" mengeluarkannya dari hitungan.
      if (!konfirmasi) setValidCount((prev) => Math.max(0, prev - 1));
      const statusBaru: StatusSesiEfektif = konfirmasi ? "terkonfirmasi_siswa" : "disangkal_menunggu_review";
      setRiwayat((prev) => prev.map((r) => (r.id === pending.id ? { ...r, status: statusBaru, batasRespons: null } : r)));
      setBusy(false);
    } catch {
      setError("Gagal terhubung ke server.");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-4 sm:px-8 sm:py-6">
      <div className="flex items-center justify-between text-sm sm:text-base">
        <span className="font-medium text-black">Progress Kehadiran</span>
        <span className="text-[#7E7C7C]">
          {validCount} dari {jumlahSesi} sesi
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-[#F0F0F0]">
        <div
          className="h-full rounded-full bg-[#081EEA]"
          style={{ width: `${jumlahSesi > 0 ? Math.min(100, (validCount / jumlahSesi) * 100) : 0}%` }}
        />
      </div>

      {pending ? (
        <div className="flex flex-col gap-3 rounded-[16px] border border-[#FACC15] bg-[#FFFBEB] px-4 py-3">
          <p className="text-sm text-black sm:text-base">
            Mentor bilang sesi ke-{pending.nomorSesi}
            {pending.mentorLabel ? ` (${pending.mentorLabel})` : ""} sudah selesai, betul?
          </p>
          {pending.batasRespons ? (
            <p className="text-xs text-[#7E7C7C] sm:text-sm">
              Jawab sebelum {formatBatasWib(pending.batasRespons)} WIB. Kalau tidak ada jawaban, sesi ini otomatis
              terkonfirmasi.
            </p>
          ) : null}
          {error ? <p className="text-sm text-[#E70A0A]">{error}</p> : null}
          <div className="flex gap-3">
            <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => submit(false)}>
              Tidak
            </Button>
            <Button type="button" variant="primary" size="sm" disabled={busy} onClick={() => submit(true)}>
              Ya
            </Button>
          </div>
        </div>
      ) : null}

      {riwayat.length > 0 ? (
        <ul className="flex flex-col divide-y divide-[#F0F0F0]">
          {riwayat.map((r) => {
            const tanggal = formatTanggal(r.tanggalDilaksanakan);
            return (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs sm:text-sm">
                <span className="text-black">
                  Sesi {r.nomorSesi}
                  {tanggal ? <span className="text-[#7E7C7C]"> · {tanggal}</span> : null}
                  {r.mentorLabel ? <span className="text-[#7E7C7C]"> · {r.mentorLabel}</span> : null}
                </span>
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[r.status]}`}>
                  {STATUS_LABEL[r.status]}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
