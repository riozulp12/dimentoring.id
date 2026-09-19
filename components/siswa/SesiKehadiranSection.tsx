"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import type { SesiPending } from "@/lib/siswa/getKelasDetail";

/**
 * Progress Kehadiran + prompt konfirmasi balik Siswa (PRD 7.5.5 FR-A2/A4,
 * BR-34) — TERPISAH dari "Progress Materi" (materi_progress, sudah ada
 * duluan di MateriList) karena beda metrik: ini kehadiran sesi tatap
 * muka/live, bukan penyelesaian materi belajar.
 */

export default function SesiKehadiranSection({
  sesiId: initialSesiId,
  jumlahSesi,
  initialValidCount,
}: {
  sesiId: SesiPending | null;
  jumlahSesi: number;
  initialValidCount: number;
}) {
  const [pending, setPending] = useState(initialSesiId);
  const [validCount, setValidCount] = useState(initialValidCount);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      if (konfirmasi) setValidCount((prev) => prev + 1);
      setPending(null);
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
            Mentor bilang sesi ke-{pending.nomorSesi} sudah selesai, betul?
          </p>
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
    </div>
  );
}
