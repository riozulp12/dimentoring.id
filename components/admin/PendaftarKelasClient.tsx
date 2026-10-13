"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import InputField from "@/components/ui/InputField";
import type { PendaftarItem, SlotStatus } from "@/lib/admin/getPendaftarKelas";
import { formatSlot, slotKey, type JadwalSlot } from "@/lib/shared/jadwalPilihan";

/**
 * Daftar pendaftar satu kelas + aksi "Tetapkan jadwal" — PRD 7.5.8. Pilihan
 * siswa cuma preferensi: Admin boleh menetapkan slot mana pun dari
 * kelas.jadwal saat ini. Slot yang sudah dihapus dari kelas tetap tampil
 * dengan badge "slot tidak lagi tersedia".
 */

const STATUS_LABEL: Record<PendaftarItem["statusPembayaran"], string> = {
  menunggu: "Menunggu",
  lunas: "Lunas",
  batal: "Batal",
};

function formatTanggal(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

function SlotCell({ value }: { value: SlotStatus | undefined | null }) {
  if (!value) return <span className="text-[#AFAFAF]">-</span>;
  return (
    <span className="flex flex-col gap-1">
      <span className={value.tersedia ? "text-black" : "text-[#7E7C7C] line-through"}>{formatSlot(value.slot)}</span>
      {!value.tersedia ? (
        <span className="w-fit rounded-full bg-[#FFF4E5] px-2 py-0.5 text-xs font-medium text-[#B45309]">
          slot tidak lagi tersedia
        </span>
      ) : null}
    </span>
  );
}

interface RowState extends PendaftarItem {
  selectedKey: string;
  busy: boolean;
  error: string | null;
}

export default function PendaftarKelasClient({
  kelasId,
  jadwalPilihanAktif,
  slots,
  initialPendaftar,
}: {
  kelasId: string;
  jadwalPilihanAktif: boolean;
  slots: JadwalSlot[];
  initialPendaftar: PendaftarItem[];
}) {
  const slotOptions = slots.map((s) => ({ label: formatSlot(s), value: slotKey(s) }));
  const tersediaKeys = new Set(slotOptions.map((o) => o.value));

  const [rows, setRows] = useState<RowState[]>(
    initialPendaftar.map((item) => {
      // Default dropdown: jadwal yang sudah ditetapkan, lalu Pilihan 1/2 yang masih tersedia.
      const candidates = [item.ditetapkan, ...item.pilihan].filter((v): v is SlotStatus => Boolean(v));
      const preset = candidates.find((v) => tersediaKeys.has(slotKey(v.slot)));
      return { ...item, selectedKey: preset ? slotKey(preset.slot) : "", busy: false, error: null };
    }),
  );

  function updateRow(enrollmentId: string, patch: Partial<RowState>) {
    setRows((prev) => prev.map((r) => (r.enrollmentId === enrollmentId ? { ...r, ...patch } : r)));
  }

  async function handleTetapkan(row: RowState) {
    const slot = slots.find((s) => slotKey(s) === row.selectedKey);
    if (!slot) {
      updateRow(row.enrollmentId, { error: "Pilih jadwal dulu." });
      return;
    }
    updateRow(row.enrollmentId, { busy: true, error: null });
    try {
      const response = await fetch(`/api/kelola-kelas/${kelasId}/pendaftar/${row.enrollmentId}/jadwal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slot }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        updateRow(row.enrollmentId, { busy: false, error: json.error ?? "Gagal menetapkan jadwal." });
        return;
      }
      updateRow(row.enrollmentId, {
        busy: false,
        ditetapkan: { slot: json.slot as JadwalSlot, tersedia: true },
        ditetapkanAt: json.ditetapkanAt as string,
      });
    } catch {
      updateRow(row.enrollmentId, { busy: false, error: "Gagal terhubung ke server." });
    }
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-12 text-center">
        <p className="text-base text-[#7E7C7C]">Belum ada pendaftar di kelas ini.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {rows.map((row) => (
        <div
          key={row.enrollmentId}
          className="flex flex-col gap-3 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-4 sm:px-6"
        >
          <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-4 sm:text-base">
            <div>
              <p className="text-[#7E7C7C]">Siswa</p>
              <p className="text-black">{row.siswaNama}</p>
              <p className="text-xs text-[#7E7C7C]">Daftar {formatTanggal(row.tanggalDaftar)}</p>
            </div>
            <div>
              <p className="text-[#7E7C7C]">Status</p>
              <p className="text-black">{STATUS_LABEL[row.statusPembayaran] ?? row.statusPembayaran}</p>
            </div>
            <div>
              <p className="text-[#7E7C7C]">Pilihan 1</p>
              <SlotCell value={row.pilihan[0]} />
            </div>
            <div>
              <p className="text-[#7E7C7C]">Pilihan 2</p>
              <SlotCell value={row.pilihan[1]} />
            </div>
          </div>

          {jadwalPilihanAktif ? (
            <div className="flex flex-col gap-2 border-t border-[#E3E3E3] pt-3">
              <div className="text-sm">
                <span className="text-[#7E7C7C]">Jadwal ditetapkan: </span>
                {row.ditetapkan ? <SlotCell value={row.ditetapkan} /> : <span className="text-black">Belum</span>}
              </div>
              {row.statusPembayaran === "lunas" ? (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="sm:w-72">
                    <InputField
                      type="dropdown"
                      size="md"
                      placeholder="Pilih jadwal"
                      value={row.selectedKey}
                      onChange={(e) => updateRow(row.enrollmentId, { selectedKey: e.target.value, error: null })}
                      options={slotOptions}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="primary"
                    size="md"
                    disabled={row.busy || !row.selectedKey}
                    onClick={() => handleTetapkan(row)}
                  >
                    {row.busy ? "Menyimpan..." : row.ditetapkan ? "Ubah jadwal" : "Tetapkan jadwal"}
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-[#7E7C7C]">Jadwal bisa ditetapkan setelah pembayaran lunas.</p>
              )}
              {row.error ? <p className="text-sm text-[#E70A0A]">{row.error}</p> : null}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
