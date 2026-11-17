"use client";

import { useId, useMemo, useState } from "react";
import InputField from "@/components/ui/InputField";
import { KONTEN_INFO_TIPE_LABEL } from "@/lib/shared/kontenInfoLabels";
import KontenInfoCard from "@/components/beasiswa-event/KontenInfoCard";
import type { KontenInfoListItem } from "@/lib/dashboard/getInfoBeasiswaEvent";

/**
 * List + search + filter halaman publik /beasiswa-event (PRD Bagian 7/13,
 * konten_info) — data lengkap (termasuk yang sudah 'ditutup') sudah di-fetch
 * sekaligus di page.tsx (Server Component), search/filter murni client-side
 * (pola sama dengan ApprovalMentorClient.tsx: tab + InputField search). SATU
 * list/grid gabungan semua tipe (TIDAK dipisah section per tipe) — filter
 * Tipe pakai dropdown (REUSE pola InputField type="dropdown" dari
 * components/program/KategoriFilterBar.tsx), opsinya REUSE
 * KONTEN_INFO_TIPE_LABEL supaya otomatis ikut kalau ada tipe baru lagi.
 * Filter Tipe + search jalan BERSAMAAN (AND, lihat `filtered` di bawah).
 *
 * Baris filter (desktop, SATU baris): [Jenis (dropdown)] [Cari (flex-1)] [Status
 * (Semua | Masih Buka | Sudah Ditutup)] — tiap kontrol berlabel, tinggi seragam,
 * sejajar di bawah. Di layar sempit: Jenis + Cari di baris atas, Status di bawah.
 * Status awal = "semua" (bukan "Sudah Ditutup"); tombol aktif ditandai
 * aria-pressed dan gaya terisi, hover hanya abu-abu supaya tidak terbaca "aktif".
 */

type TipeFilter = "semua" | "beasiswa" | "internship" | "webinar" | "workshop" | "event";
type StatusFilter = "semua" | "aktif" | "ditutup";

const TIPE_OPTIONS = [
  { label: "Semua jenis", value: "semua" },
  ...Object.entries(KONTEN_INFO_TIPE_LABEL).map(([value, label]) => ({ label, value })),
];

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: "semua", label: "Semua" },
  { key: "aktif", label: "Masih Buka" },
  { key: "ditutup", label: "Sudah Ditutup" },
];

export default function BeasiswaEventListClient({ items }: { items: KontenInfoListItem[] }) {
  const jenisId = useId();
  const cariId = useId();
  const statusLabelId = useId();
  const [search, setSearch] = useState("");
  const [tipeFilter, setTipeFilter] = useState<TipeFilter>("semua");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("semua");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (q && !item.judul.toLowerCase().includes(q)) return false;
      if (tipeFilter !== "semua" && item.tipe !== tipeFilter) return false;
      if (statusFilter !== "semua" && item.status !== statusFilter) return false;
      return true;
    });
  }, [items, search, tipeFilter, statusFilter]);

  const isFiltering = search.trim() !== "" || tipeFilter !== "semua" || statusFilter !== "semua";

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:gap-4">
        <div className="flex items-end gap-3 lg:contents">
          <div className="flex w-36 shrink-0 flex-col gap-1.5 sm:w-48">
            <label htmlFor={jenisId} className="text-sm font-medium text-black">
              Jenis
            </label>
            <InputField
              id={jenisId}
              type="dropdown"
              size="md"
              value={tipeFilter}
              onChange={(e) => setTipeFilter(e.target.value as TipeFilter)}
              options={TIPE_OPTIONS}
            />
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <label htmlFor={cariId} className="text-sm font-medium text-black">
              Cari
            </label>
            <InputField
              id={cariId}
              type="text"
              size="md"
              placeholder="Cari judul..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5 lg:shrink-0">
          <span id={statusLabelId} className="text-sm font-medium text-black">
            Status
          </span>
          <div
            role="group"
            aria-labelledby={statusLabelId}
            className="flex items-center gap-1 rounded-[16px] border border-[#AFAFAF] bg-white p-1"
          >
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                aria-pressed={statusFilter === tab.key}
                onClick={() => setStatusFilter(tab.key)}
                className={`flex h-[33px] flex-1 items-center justify-center rounded-[12px] px-3.5 text-sm font-medium whitespace-nowrap transition-colors sm:h-10 lg:flex-none ${
                  statusFilter === tab.key
                    ? "bg-[#F9FAFF] text-[#081EEA] ring-1 ring-[#081EEA] ring-inset"
                    : "text-[#7E7C7C] hover:bg-gray-50 hover:text-black"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-[20px] border-[0.8px] border-[#E3E3E3] bg-white px-5 py-16 text-center">
          <p className="text-base text-[#7E7C7C]">
            {items.length === 0
              ? "Belum ada info beasiswa, internship, atau event saat ini."
              : isFiltering
                ? "Tidak ada konten yang cocok dengan pencarian/filter kamu."
                : "Belum ada konten untuk ditampilkan."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
          {filtered.map((item) => (
            <KontenInfoCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
