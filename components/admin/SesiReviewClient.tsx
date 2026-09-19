"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import type { SesiReviewItem } from "@/lib/admin/getSesiReviewData";

/**
 * List "Sesi Perlu Ditinjau" (Admin) — PRD Bagian 7.5.5 FR-A3. "Setujui
 * sebagai Valid" = sesi dianggap terlaksana (masuk progress kehadiran
 * siswa). "Batalkan Sesi Ini" = sesi dikembalikan ke kondisi belum terjadi
 * sama sekali (mentor bisa tandai ulang lewat alur normal).
 */

function formatTanggalIndonesia(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

interface RowState extends SesiReviewItem {
  busy: boolean;
  error: string | null;
}

export default function SesiReviewClient({ initialItems }: { initialItems: SesiReviewItem[] }) {
  const [rows, setRows] = useState<RowState[]>(initialItems.map((item) => ({ ...item, busy: false, error: null })));

  async function handleAction(sesiId: string, action: "setujui" | "batalkan") {
    setRows((prev) => prev.map((r) => (r.id === sesiId ? { ...r, busy: true, error: null } : r)));

    try {
      const response = await fetch("/api/admin/sesi-review", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sesiId, action }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        setRows((prev) =>
          prev.map((r) =>
            r.id === sesiId ? { ...r, busy: false, error: json.error ?? "Gagal menyimpan keputusan." } : r,
          ),
        );
        return;
      }
      setRows((prev) => prev.filter((r) => r.id !== sesiId));
    } catch {
      setRows((prev) => prev.map((r) => (r.id === sesiId ? { ...r, busy: false, error: "Gagal terhubung ke server." } : r)));
    }
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-12 text-center">
        <p className="text-base text-[#7E7C7C]">Tidak ada sesi yang perlu ditinjau saat ini.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {rows.map((row) => (
        <div
          key={row.id}
          className="flex flex-col gap-3 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-4 sm:px-6"
        >
          <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2 sm:text-base">
            <div>
              <p className="text-[#7E7C7C]">Siswa</p>
              <p className="text-black">{row.siswaNama}</p>
            </div>
            <div>
              <p className="text-[#7E7C7C]">Mentor</p>
              <p className="text-black">{row.mentorNama ?? "-"}</p>
            </div>
            <div>
              <p className="text-[#7E7C7C]">Kelas</p>
              <p className="text-black">{row.kelasNama}</p>
            </div>
            <div>
              <p className="text-[#7E7C7C]">Sesi ke-</p>
              <p className="text-black">{row.nomorSesi}</p>
            </div>
            <div>
              <p className="text-[#7E7C7C]">Tanggal Dilaksanakan</p>
              <p className="text-black">{formatTanggalIndonesia(row.tanggalDilaksanakan)}</p>
            </div>
            <div>
              <p className="text-[#7E7C7C]">Disangkal Sejak</p>
              <p className="text-black">{formatTanggalIndonesia(row.dikonfirmasiSiswaPada)}</p>
            </div>
          </div>

          {row.error ? <p className="text-sm text-[#E70A0A]">{row.error}</p> : null}

          <div className="flex gap-3">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={row.busy}
              onClick={() => handleAction(row.id, "batalkan")}
            >
              Batalkan Sesi Ini
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={row.busy}
              onClick={() => handleAction(row.id, "setujui")}
            >
              Setujui sebagai Valid
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
