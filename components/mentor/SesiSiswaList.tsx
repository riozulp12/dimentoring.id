"use client";

import { useState } from "react";
import Avatar from "@/components/ui/Avatar";
import Button from "@/components/ui/Button";
import type { SesiSiswaItem } from "@/lib/mentor/getKelasSayaData";

/**
 * Absensi per siswa (PRD 7.5.5 FR-A1) — di halaman Kelas Saya (Mentor).
 * Tiap siswa punya progress "Sesi X dari Y" sendiri (bukan agregat kelas),
 * karena beda siswa bisa beda progress sesi meski satu kelas yang sama.
 * Klik "Tandai Sesi Hari Ini Selesai" SELALU menandai nomor_sesi PALING
 * KECIL yang belum ditandai — urut, tidak bisa loncat sesi.
 */

interface RowState extends SesiSiswaItem {
  busy: boolean;
  error: string | null;
  info: string | null;
}

export default function SesiSiswaList({ items, jumlahSesi }: { items: SesiSiswaItem[]; jumlahSesi: number }) {
  const [rows, setRows] = useState<RowState[]>(
    items.map((item) => ({ ...item, busy: false, error: null, info: null })),
  );

  async function handleTandai(enrollmentId: string) {
    setRows((prev) =>
      prev.map((r) => (r.enrollmentId === enrollmentId ? { ...r, busy: true, error: null, info: null } : r)),
    );

    try {
      const response = await fetch("/api/mentor/sesi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enrollmentId }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        setRows((prev) =>
          prev.map((r) =>
            r.enrollmentId === enrollmentId
              ? { ...r, busy: false, error: json.error ?? "Gagal menandai sesi. Coba lagi nanti." }
              : r,
          ),
        );
        return;
      }

      const nomorDitandai = json.nomorSesi as number;
      const nomorBerikutnya = nomorDitandai + 1;
      setRows((prev) =>
        prev.map((r) =>
          r.enrollmentId === enrollmentId
            ? {
                ...r,
                busy: false,
                info: `Sesi ke-${nomorDitandai} ditandai, menunggu konfirmasi siswa.`,
                sesiBerikutnya: nomorBerikutnya <= jumlahSesi ? nomorBerikutnya : null,
              }
            : r,
        ),
      );
    } catch {
      setRows((prev) =>
        prev.map((r) =>
          r.enrollmentId === enrollmentId ? { ...r, busy: false, error: "Gagal terhubung ke server." } : r,
        ),
      );
    }
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-10 text-center">
        <p className="text-base text-[#7E7C7C]">Belum ada siswa terdaftar di kelas ini.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {rows.map((row) => (
        <div
          key={row.enrollmentId}
          className="flex flex-col gap-3 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"
        >
          <div className="flex items-center gap-3">
            <Avatar avatarUrl={row.avatarUrl} nama={row.nama} size="md" />
            <div className="flex flex-col">
              <p className="text-sm font-medium text-black sm:text-base">{row.nama}</p>
              <p className="text-xs text-[#7E7C7C] sm:text-sm">
                Sesi {row.sesiValidCount} dari {jumlahSesi}
              </p>
            </div>
          </div>

          <div className="flex flex-col items-start gap-1 sm:items-end">
            {row.sesiBerikutnya !== null ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={row.busy}
                onClick={() => handleTandai(row.enrollmentId)}
              >
                {row.busy ? "Menyimpan..." : "Tandai Sesi Hari Ini Selesai"}
              </Button>
            ) : (
              <span className="inline-flex items-center rounded-full bg-[#F0FDF4] px-2.5 py-0.5 text-xs font-medium text-[#0CBA00]">
                Semua sesi sudah ditandai
              </span>
            )}
            {row.info ? <p className="text-xs text-[#7E7C7C]">{row.info}</p> : null}
            {row.error ? <p className="text-xs text-[#E70A0A]">{row.error}</p> : null}
          </div>
        </div>
      ))}
    </div>
  );
}
